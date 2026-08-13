-- 1. Nouveaux statuts de dossier
ALTER TYPE public.dossier_statut ADD VALUE IF NOT EXISTS 'lettre_mission_envoyee';
ALTER TYPE public.dossier_statut ADD VALUE IF NOT EXISTS 'dda_validee';

-- 2. Nouveau type de pièce KYC (client professionnel)
ALTER TYPE public.client_kyc_type ADD VALUE IF NOT EXISTS 'kbis';

-- 3. Champs d'archivage du PDF signé de la lettre de mission
ALTER TABLE public.lettres_mission
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS archive_envoye_le timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reponse text;

-- 4. Nouveau barème de score de conformité
CREATE OR REPLACE FUNCTION public.calculer_score_conformite_client(_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pts integer := 0;
  base integer := 80;          -- particulier : 80 pts atteignables, ramenés sur 100
  est_pro boolean := false;
  cni_ok boolean := false;
  jd_ok boolean := false;
  rib_ok boolean := false;
  kbis_ok boolean := false;
  lcb_ok boolean := false;
  lcb_row record;
  derniere timestamptz;
  score integer;
  niveau text;
  prochaine date;
BEGIN
  -- Identité : CNI validée et non expirée (30 pts)
  SELECT EXISTS (
    SELECT 1 FROM public.client_kyc_documents
    WHERE client_id = _client_id AND type = 'cni' AND statut = 'valide'
      AND (date_expiration IS NULL OR date_expiration >= CURRENT_DATE)
  ) INTO cni_ok;

  -- RIB + justificatif de domicile de moins de 3 mois (30 pts, les deux requis)
  SELECT EXISTS (
    SELECT 1 FROM public.client_kyc_documents
    WHERE client_id = _client_id AND type = 'rib' AND statut = 'valide'
  ) INTO rib_ok;
  SELECT EXISTS (
    SELECT 1 FROM public.client_kyc_documents
    WHERE client_id = _client_id AND type = 'justificatif_domicile' AND statut = 'valide'
      AND date_emission IS NOT NULL
      AND date_emission >= CURRENT_DATE - INTERVAL '3 months'
  ) INTO jd_ok;

  -- Client professionnel ?
  SELECT EXISTS (
    SELECT 1 FROM public.client_entreprise
    WHERE client_id = _client_id
      AND (siret IS NOT NULL OR raison_sociale IS NOT NULL)
  ) INTO est_pro;

  IF est_pro THEN
    base := 100;
    SELECT EXISTS (
      SELECT 1 FROM public.client_kyc_documents
      WHERE client_id = _client_id AND type = 'kbis' AND statut = 'valide'
        AND (date_emission IS NULL OR date_emission >= CURRENT_DATE - INTERVAL '12 months')
        AND (date_expiration IS NULL OR date_expiration >= CURRENT_DATE)
    ) INTO kbis_ok;
  END IF;

  -- LCB-FT : dernière vérification exploitable de moins de 12 mois (20 pts)
  SELECT * INTO lcb_row FROM public.client_lcb_verifications
   WHERE client_id = _client_id
   ORDER BY verifie_le DESC LIMIT 1;

  IF lcb_row IS NOT NULL THEN
    derniere := lcb_row.verifie_le;
    lcb_ok := lcb_row.statut IN ('clair', 'faux_positif')
              AND lcb_row.verifie_le >= now() - INTERVAL '12 months';
  END IF;

  IF cni_ok THEN pts := pts + 30; END IF;
  IF jd_ok AND rib_ok THEN pts := pts + 30; END IF;
  IF kbis_ok THEN pts := pts + 20; END IF;
  IF lcb_ok THEN pts := pts + 20; END IF;

  score := LEAST(100, GREATEST(0, ROUND(pts::numeric * 100 / base)::integer));

  IF score >= 90 THEN
    niveau := 'vert';
    prochaine := CURRENT_DATE + INTERVAL '18 months';
  ELSIF score >= 50 THEN
    niveau := 'orange';
    prochaine := CURRENT_DATE + INTERVAL '12 months';
  ELSE
    niveau := 'rouge';
    prochaine := CURRENT_DATE + INTERVAL '6 months';
  END IF;

  UPDATE public.clients
     SET conformite_score = score,
         conformite_niveau = niveau,
         conformite_derniere_verif = COALESCE(derniere, conformite_derniere_verif),
         conformite_prochaine_verif = prochaine
   WHERE id = _client_id;

  RETURN score;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculer_score_conformite_client(uuid) FROM PUBLIC, anon, authenticated;

-- 5. Recalcul automatique
CREATE OR REPLACE FUNCTION public.trg_recalcul_conformite_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
BEGIN
  cid := COALESCE(NEW.client_id, OLD.client_id);
  IF cid IS NOT NULL THEN
    PERFORM public.calculer_score_conformite_client(cid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_recalcul_conformite_client() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conformite_kyc ON public.client_kyc_documents;
CREATE TRIGGER trg_conformite_kyc
AFTER INSERT OR UPDATE OR DELETE ON public.client_kyc_documents
FOR EACH ROW EXECUTE FUNCTION public.trg_recalcul_conformite_client();

DROP TRIGGER IF EXISTS trg_conformite_lcb ON public.client_lcb_verifications;
CREATE TRIGGER trg_conformite_lcb
AFTER INSERT OR UPDATE OR DELETE ON public.client_lcb_verifications
FOR EACH ROW EXECUTE FUNCTION public.trg_recalcul_conformite_client();

DROP TRIGGER IF EXISTS trg_conformite_entreprise ON public.client_entreprise;
CREATE TRIGGER trg_conformite_entreprise
AFTER INSERT OR UPDATE OR DELETE ON public.client_entreprise
FOR EACH ROW EXECUTE FUNCTION public.trg_recalcul_conformite_client();

-- 6. Blocage des contrats sous 50 % de conformité
CREATE OR REPLACE FUNCTION public.trg_bloquer_contrat_non_conforme()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sc integer;
BEGIN
  SELECT conformite_score INTO sc FROM public.clients WHERE id = NEW.client_id;
  IF COALESCE(sc, 0) < 50 THEN
    RAISE EXCEPTION 'Conformité insuffisante (score %/100) : complétez les pièces KYC du client avant de créer un contrat.', COALESCE(sc, 0)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_bloquer_contrat_non_conforme() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contrats_conformite ON public.contrats;
CREATE TRIGGER trg_contrats_conformite
BEFORE INSERT ON public.contrats
FOR EACH ROW EXECUTE FUNCTION public.trg_bloquer_contrat_non_conforme();

-- 7. Rafraîchissement des scores existants
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.clients LOOP
    PERFORM public.calculer_score_conformite_client(r.id);
  END LOOP;
END $$;