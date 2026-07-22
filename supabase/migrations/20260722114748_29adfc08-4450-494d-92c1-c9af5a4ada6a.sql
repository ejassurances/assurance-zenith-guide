
-- ============ 1. TABLE client_kyc_documents ============
CREATE TYPE public.client_kyc_type AS ENUM ('cni', 'justificatif_domicile', 'rib');

CREATE TABLE public.client_kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type public.client_kyc_type NOT NULL,
  nom text NOT NULL,
  storage_path text NOT NULL,
  date_emission date,
  date_expiration date,
  statut text NOT NULL DEFAULT 'a_valider' CHECK (statut IN ('a_valider','valide','expire','refuse')),
  notes text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_kyc_client ON public.client_kyc_documents(client_id);
CREATE INDEX idx_client_kyc_type ON public.client_kyc_documents(type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_kyc_documents TO authenticated;
GRANT ALL ON public.client_kyc_documents TO service_role;
ALTER TABLE public.client_kyc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kyc access via client" ON public.client_kyc_documents
  FOR ALL TO authenticated
  USING (public.can_access_client(client_id))
  WITH CHECK (public.can_access_client(client_id));

CREATE TRIGGER trg_client_kyc_updated
  BEFORE UPDATE ON public.client_kyc_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 2. TABLE client_lcb_verifications ============
CREATE TABLE public.client_lcb_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sanctions','ppe','combined')),
  fournisseur text NOT NULL DEFAULT 'opensanctions',
  requete jsonb NOT NULL,
  resultats jsonb NOT NULL DEFAULT '[]'::jsonb,
  nb_correspondances integer NOT NULL DEFAULT 0,
  score_correspondance numeric,
  statut text NOT NULL DEFAULT 'clair' CHECK (statut IN ('clair','a_verifier','confirme','faux_positif')),
  notes text,
  verifie_par uuid REFERENCES auth.users(id),
  verifie_le timestamptz NOT NULL DEFAULT now(),
  valide_jusqua date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lcb_client ON public.client_lcb_verifications(client_id);
CREATE INDEX idx_lcb_verifie_le ON public.client_lcb_verifications(verifie_le DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_lcb_verifications TO authenticated;
GRANT ALL ON public.client_lcb_verifications TO service_role;
ALTER TABLE public.client_lcb_verifications ENABLE ROW LEVEL SECURITY;

-- LCB-FT : réservé au cabinet (admin + mandataire + commercial du client), JAMAIS visible par le client final
CREATE POLICY "lcb cabinet only" ON public.client_lcb_verifications
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'mandataire')
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id
        AND (c.commercial_id = auth.uid() OR c.apporteur_id = auth.uid() OR c.created_by = auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'mandataire')
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id
        AND (c.commercial_id = auth.uid() OR c.apporteur_id = auth.uid() OR c.created_by = auth.uid())
    )
  );

CREATE TRIGGER trg_lcb_updated
  BEFORE UPDATE ON public.client_lcb_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3. Colonnes score sur clients ============
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS conformite_score integer,
  ADD COLUMN IF NOT EXISTS conformite_niveau text CHECK (conformite_niveau IN ('vert','orange','rouge')),
  ADD COLUMN IF NOT EXISTS conformite_derniere_verif timestamptz,
  ADD COLUMN IF NOT EXISTS conformite_prochaine_verif date;

-- ============ 4. Fonction recalcul score ============
CREATE OR REPLACE FUNCTION public.calculer_score_conformite_client(_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s integer := 0;
  cni_ok boolean;
  jd_ok boolean;
  rib_ok boolean;
  lcb_row record;
  lcb_score integer := 0;
  niveau text;
  prochaine date;
  derniere timestamptz;
BEGIN
  -- Documents (65 pts)
  SELECT EXISTS (SELECT 1 FROM public.client_kyc_documents
                 WHERE client_id = _client_id AND type='cni' AND statut='valide'
                   AND (date_expiration IS NULL OR date_expiration >= CURRENT_DATE))
    INTO cni_ok;
  SELECT EXISTS (SELECT 1 FROM public.client_kyc_documents
                 WHERE client_id = _client_id AND type='justificatif_domicile' AND statut='valide'
                   AND (date_emission IS NULL OR date_emission >= CURRENT_DATE - INTERVAL '3 months'))
    INTO jd_ok;
  SELECT EXISTS (SELECT 1 FROM public.client_kyc_documents
                 WHERE client_id = _client_id AND type='rib' AND statut='valide')
    INTO rib_ok;

  IF cni_ok THEN s := s + 30; END IF;
  IF jd_ok THEN s := s + 20; END IF;
  IF rib_ok THEN s := s + 15; END IF;

  -- LCB-FT (35 pts)
  SELECT * INTO lcb_row FROM public.client_lcb_verifications
   WHERE client_id = _client_id
   ORDER BY verifie_le DESC LIMIT 1;

  IF lcb_row IS NOT NULL THEN
    derniere := lcb_row.verifie_le;
    IF lcb_row.statut = 'clair' THEN
      lcb_score := 35;
    ELSIF lcb_row.statut = 'faux_positif' THEN
      lcb_score := 30;
    ELSIF lcb_row.statut = 'a_verifier' THEN
      lcb_score := 10;
    ELSE  -- confirme
      lcb_score := 0;
    END IF;
    -- Vérification obsolète (>18 mois) : divise par 2
    IF lcb_row.verifie_le < now() - INTERVAL '18 months' THEN
      lcb_score := lcb_score / 2;
    END IF;
    s := s + lcb_score;
  END IF;

  -- Niveau + prochaine échéance
  IF s >= 80 THEN
    niveau := 'vert';
    prochaine := (COALESCE(derniere, now()) + INTERVAL '18 months')::date;
  ELSIF s >= 50 THEN
    niveau := 'orange';
    prochaine := (COALESCE(derniere, now()) + INTERVAL '12 months')::date;
  ELSE
    niveau := 'rouge';
    prochaine := (COALESCE(derniere, now()) + INTERVAL '6 months')::date;
  END IF;

  UPDATE public.clients
     SET conformite_score = s,
         conformite_niveau = niveau,
         conformite_derniere_verif = derniere,
         conformite_prochaine_verif = prochaine
   WHERE id = _client_id;

  RETURN s;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculer_score_conformite_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculer_score_conformite_client(uuid) TO authenticated;

-- ============ 5. Triggers auto-recalcul ============
CREATE OR REPLACE FUNCTION public.trg_recalcul_conformite_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.calculer_score_conformite_client(COALESCE(NEW.client_id, OLD.client_id));
  RETURN COALESCE(NEW, OLD);
END; $$;

REVOKE EXECUTE ON FUNCTION public.trg_recalcul_conformite_client() FROM PUBLIC, anon;

CREATE TRIGGER trg_kyc_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.client_kyc_documents
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalcul_conformite_client();

CREATE TRIGGER trg_lcb_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.client_lcb_verifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalcul_conformite_client();

-- ============ 6. Score cabinet (agrégat) ============
CREATE OR REPLACE FUNCTION public.score_conformite_cabinet()
RETURNS TABLE (
  score numeric,
  niveau text,
  nb_clients integer,
  nb_vert integer,
  nb_orange integer,
  nb_rouge integer,
  nb_a_relancer integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN QUERY
  SELECT
    ROUND(COALESCE(AVG(c.conformite_score), 0), 1) AS score,
    CASE
      WHEN COALESCE(AVG(c.conformite_score), 0) >= 80 THEN 'vert'
      WHEN COALESCE(AVG(c.conformite_score), 0) >= 50 THEN 'orange'
      ELSE 'rouge'
    END AS niveau,
    COUNT(*)::int AS nb_clients,
    COUNT(*) FILTER (WHERE c.conformite_niveau = 'vert')::int,
    COUNT(*) FILTER (WHERE c.conformite_niveau = 'orange')::int,
    COUNT(*) FILTER (WHERE c.conformite_niveau = 'rouge')::int,
    COUNT(*) FILTER (WHERE c.conformite_prochaine_verif IS NOT NULL AND c.conformite_prochaine_verif <= CURRENT_DATE + INTERVAL '30 days')::int
  FROM public.clients c
  WHERE c.statut IN ('actif','client');
END; $$;

REVOKE EXECUTE ON FUNCTION public.score_conformite_cabinet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.score_conformite_cabinet() TO authenticated;
