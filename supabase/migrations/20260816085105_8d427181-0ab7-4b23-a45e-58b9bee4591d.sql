CREATE TABLE public.client_risque_lcbft (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  score_risque integer NOT NULL DEFAULT 0 CHECK (score_risque BETWEEN 0 AND 100),
  niveau_vigilance text NOT NULL DEFAULT 'standard' CHECK (niveau_vigilance IN ('simplifiee','standard','renforcee')),
  facteurs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ppe_detecte boolean NOT NULL DEFAULT false,
  justification text,
  decide_par uuid REFERENCES auth.users(id),
  decide_le timestamptz,
  statut text NOT NULL DEFAULT 'a_evaluer' CHECK (statut IN ('a_evaluer','evalue','a_reviser')),
  prochaine_revue_le date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_risque_lcbft TO authenticated;
GRANT ALL ON public.client_risque_lcbft TO service_role;

ALTER TABLE public.client_risque_lcbft ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet gere le risque LCB-FT"
ON public.client_risque_lcbft FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER trg_client_risque_lcbft_updated
BEFORE UPDATE ON public.client_risque_lcbft
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.calculer_risque_lcbft(_client_id uuid)
RETURNS public.client_risque_lcbft
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cl public.clients%ROWTYPE;
  facteurs jsonb := '[]'::jsonb;
  score integer := 0;
  pts integer;
  ppe boolean := false;
  sanctions_a_verifier boolean := false;
  niveau text;
  revue_mois integer;
  montant_capital numeric := 0;
  montant_annuel numeric := 0;
  lcb record;
  res jsonb;
  ligne public.client_risque_lcbft;
BEGIN
  SELECT * INTO cl FROM public.clients WHERE id = _client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;

  -- Facteur 1 : origine du client (canal d'entrée)
  IF cl.origine IS NOT NULL THEN
    IF cl.origine::text IN ('internet','assurlead','telephone') THEN
      pts := 15;
      facteurs := facteurs || jsonb_build_object('code','origine','libelle','Entrée à distance (' || cl.origine::text || ')','points',pts);
    ELSIF cl.origine::text IN ('apporteur','reseau','parrainage','recommandation','contact_perso') THEN
      pts := 5;
      facteurs := facteurs || jsonb_build_object('code','origine','libelle','Relation déjà établie (' || cl.origine::text || ')','points',pts);
    ELSE
      pts := 0;
    END IF;
    score := score + pts;
  END IF;

  -- Facteur 2 : pays de résidence.
  -- TODO : intégrer la liste GAFI des pays à haut risque (non disponible à ce jour),
  -- afin de distinguer « hors France » de « juridiction à risque ».
  IF cl.pays IS NOT NULL AND lower(trim(cl.pays)) NOT IN ('france','fr') THEN
    score := score + 20;
    facteurs := facteurs || jsonb_build_object('code','pays','libelle','Pays de résidence hors France (' || cl.pays || ')','points',20);
  END IF;

  -- Facteur 3 : montant du contrat le plus élevé
  SELECT COALESCE(MAX(c.capital_initial), 0) INTO montant_capital
    FROM public.contrats c WHERE c.client_id = _client_id AND c.is_emprunteur;
  SELECT COALESCE(MAX(c.prime_annuelle), 0) INTO montant_annuel
    FROM public.contrats c WHERE c.client_id = _client_id AND NOT c.is_emprunteur;

  IF montant_capital > 200000 OR montant_annuel > 3000 THEN
    score := score + 25;
    facteurs := facteurs || jsonb_build_object('code','montant','libelle','Montant élevé (capital ' || round(montant_capital) || ' € / cotisation ' || round(montant_annuel) || ' €/an)','points',25);
  ELSIF montant_capital > 0 OR montant_annuel > 0 THEN
    score := score + 10;
    facteurs := facteurs || jsonb_build_object('code','montant','libelle','Montant intermédiaire (capital ' || round(montant_capital) || ' € / cotisation ' || round(montant_annuel) || ' €/an)','points',10);
  END IF;

  -- Facteur 4 et 5 : dernier contrôle LCB-FT
  SELECT * INTO lcb FROM public.client_lcb_verifications
   WHERE client_id = _client_id ORDER BY verifie_le DESC LIMIT 1;

  IF lcb IS NOT NULL THEN
    IF jsonb_typeof(lcb.resultats) = 'array' THEN
      FOR res IN SELECT * FROM jsonb_array_elements(lcb.resultats) LOOP
        IF COALESCE((res->>'is_ppe')::boolean, false) THEN ppe := true; END IF;
      END LOOP;
    END IF;
    IF lcb.statut = 'a_verifier' THEN sanctions_a_verifier := true; END IF;
  END IF;

  IF ppe THEN
    score := score + 40;
    facteurs := facteurs || jsonb_build_object('code','ppe','libelle','Personne politiquement exposée détectée','points',40);
  END IF;

  IF sanctions_a_verifier THEN
    score := score + 20;
    facteurs := facteurs || jsonb_build_object('code','sanctions','libelle','Correspondance sanctions à vérifier (non confirmée)','points',20);
  END IF;

  score := LEAST(100, GREATEST(0, score));

  IF ppe THEN
    niveau := 'renforcee';
  ELSIF score >= 50 THEN
    niveau := 'renforcee';
  ELSIF score >= 20 THEN
    niveau := 'standard';
  ELSE
    niveau := 'simplifiee';
  END IF;

  revue_mois := CASE niveau WHEN 'renforcee' THEN 12 WHEN 'standard' THEN 36 ELSE 60 END;

  INSERT INTO public.client_risque_lcbft (
    client_id, score_risque, niveau_vigilance, facteurs, ppe_detecte, statut, prochaine_revue_le
  ) VALUES (
    _client_id, score, niveau, facteurs, ppe, 'evalue',
    (CURRENT_DATE + (revue_mois || ' months')::interval)::date
  )
  ON CONFLICT (client_id) DO UPDATE SET
    score_risque = EXCLUDED.score_risque,
    niveau_vigilance = EXCLUDED.niveau_vigilance,
    facteurs = EXCLUDED.facteurs,
    ppe_detecte = EXCLUDED.ppe_detecte,
    statut = 'evalue',
    prochaine_revue_le = EXCLUDED.prochaine_revue_le,
    updated_at = now()
  RETURNING * INTO ligne;

  RETURN ligne;
END;
$$;