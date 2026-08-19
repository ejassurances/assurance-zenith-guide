CREATE OR REPLACE FUNCTION public.calculer_risque_lcbft(_client_id uuid)
RETURNS public.client_risque_lcbft
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  cl public.clients%ROWTYPE;
  facteurs jsonb := '[]'::jsonb;
  score integer := 0;
  pts integer;
  ppe boolean := false;
  sanctions_a_verifier boolean := false;
  kyc_incomplet boolean := false;
  identite_manquante boolean := false;
  identite_expiree boolean := false;
  kyc_score integer;
  niveau text;
  statut_ligne text := 'evalue';
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

  -- Facteur bloquant : identité du client non vérifiée (art. L561-5 CMF).
  -- Sans pièce d'identité valide au dossier, aucun score « standard » ne peut
  -- être considéré comme fiable : la relation est mise en alerte.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.client_kyc_documents k
     WHERE k.client_id = _client_id
       AND k.type = 'cni'
       AND COALESCE(k.statut, '') <> 'refuse'
  ) INTO identite_manquante;

  IF NOT identite_manquante THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM public.client_kyc_documents k
       WHERE k.client_id = _client_id
         AND k.type = 'cni'
         AND COALESCE(k.statut, '') <> 'refuse'
         AND (k.date_expiration IS NULL OR k.date_expiration >= CURRENT_DATE)
    ) INTO identite_expiree;
  END IF;

  IF identite_manquante OR identite_expiree THEN
    score := score + 40;
    kyc_incomplet := true;
    facteurs := facteurs || jsonb_build_object(
      'code','kyc_identite',
      'libelle', CASE WHEN identite_manquante
        THEN 'Aucune pièce d''identité au dossier : identité du client non vérifiée'
        ELSE 'Pièce d''identité expirée : identité du client à revérifier' END,
      'points',40);
  END IF;

  -- Facteur 6 : complétude des pièces KYC (score de conformité du client).
  kyc_score := COALESCE(cl.conformite_score, 0);
  IF kyc_score < 50 THEN
    score := score + 30;
    kyc_incomplet := true;
    facteurs := facteurs || jsonb_build_object('code','kyc','libelle','Pièces KYC incomplètes (' || kyc_score || ' %)','points',30);
  ELSIF kyc_score < 100 THEN
    score := score + 10;
    kyc_incomplet := true;
    facteurs := facteurs || jsonb_build_object('code','kyc','libelle','Pièces KYC partiellement réunies (' || kyc_score || ' %)','points',10);
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

  -- Identité non vérifiée : vigilance renforcée de plein droit et évaluation
  -- non concluante tant que les pièces manquent (alerte conformité).
  IF identite_manquante OR identite_expiree THEN
    niveau := 'renforcee';
    statut_ligne := 'a_reviser';
  END IF;

  -- Jamais de vigilance simplifiée tant que le dossier KYC est incomplet.
  IF kyc_incomplet AND niveau = 'simplifiee' THEN
    niveau := 'standard';
  END IF;

  revue_mois := CASE niveau WHEN 'renforcee' THEN 12 WHEN 'standard' THEN 36 ELSE 60 END;

  INSERT INTO public.client_risque_lcbft (
    client_id, score_risque, niveau_vigilance, facteurs, ppe_detecte, statut, prochaine_revue_le
  ) VALUES (
    _client_id, score, niveau, facteurs, ppe, statut_ligne,
    (CURRENT_DATE + (revue_mois || ' months')::interval)::date
  )
  ON CONFLICT (client_id) DO UPDATE SET
    score_risque = EXCLUDED.score_risque,
    niveau_vigilance = EXCLUDED.niveau_vigilance,
    facteurs = EXCLUDED.facteurs,
    ppe_detecte = EXCLUDED.ppe_detecte,
    statut = EXCLUDED.statut,
    prochaine_revue_le = EXCLUDED.prochaine_revue_le,
    updated_at = now()
  RETURNING * INTO ligne;

  RETURN ligne;
END;
$fn$;