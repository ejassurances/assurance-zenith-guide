ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS prochain_suivi_le date,
  ADD COLUMN IF NOT EXISTS dernier_suivi_le date,
  ADD COLUMN IF NOT EXISTS recommandation_personnalisee boolean NOT NULL DEFAULT false;

ALTER TABLE public.activites
  ADD COLUMN IF NOT EXISTS contrat_id uuid REFERENCES public.contrats(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activites_contrat_id ON public.activites(contrat_id);
CREATE INDEX IF NOT EXISTS idx_contrats_prochain_suivi ON public.contrats(prochain_suivi_le);

-- Branche d'un contrat : dossier lié en priorité, sinon famille du produit du catalogue.
CREATE OR REPLACE FUNCTION public.branche_contrat(_contrat_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT d.type_assurance FROM public.contrats c
       JOIN public.dossiers d ON d.id = c.dossier_id
      WHERE c.id = _contrat_id),
    (SELECT f.code FROM public.contrats c
       JOIN public.produits p ON p.id = c.produit_id
       JOIN public.produit_familles f ON f.id = p.famille_id
      WHERE c.id = _contrat_id),
    (SELECT CASE WHEN c.is_emprunteur THEN 'emprunteur' END FROM public.contrats c WHERE c.id = _contrat_id)
  );
$$;

-- Périodicité de suivi en mois (NULL = pas de suivi périodique pour cette branche).
CREATE OR REPLACE FUNCTION public.periodicite_suivi_mois(_branche text, _recommandation boolean)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _branche
    WHEN 'epargne_retraite' THEN CASE WHEN _recommandation THEN 24 ELSE 48 END
    WHEN 'epargne' THEN CASE WHEN _recommandation THEN 24 ELSE 48 END
    WHEN 'accidents_vie' THEN 60
    WHEN 'juridique' THEN 60
    WHEN 'sante' THEN 24
    WHEN 'prevoyance' THEN 36
    WHEN 'prevoyance_sante' THEN 36
    WHEN 'animaux' THEN 24
    WHEN 'emprunteur' THEN 36
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.trg_contrat_planifier_suivi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mois integer;
  _base date;
BEGIN
  IF NEW.statut IS NULL OR NEW.statut NOT IN ('actif', 'contrat_actif', 'contrat_valide') THEN
    RETURN NEW;
  END IF;
  IF NEW.prochain_suivi_le IS NOT NULL THEN
    RETURN NEW;
  END IF;
  _mois := public.periodicite_suivi_mois(public.branche_contrat(NEW.id), NEW.recommandation_personnalisee);
  IF _mois IS NULL THEN
    RETURN NEW;
  END IF;
  _base := COALESCE(NEW.date_effet, CURRENT_DATE);
  NEW.prochain_suivi_le := (_base + (_mois || ' months')::interval)::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contrat_planifier_suivi ON public.contrats;
CREATE TRIGGER contrat_planifier_suivi
  BEFORE INSERT OR UPDATE OF statut, date_effet, produit_id, dossier_id, recommandation_personnalisee
  ON public.contrats
  FOR EACH ROW EXECUTE FUNCTION public.trg_contrat_planifier_suivi();

-- Replanification groupée de tous les contrats actifs d'un client après un envoi de suivi.
CREATE OR REPLACE FUNCTION public.replanifier_suivi_client(_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer := 0;
  _c record;
  _mois integer;
BEGIN
  FOR _c IN
    SELECT id, recommandation_personnalisee FROM public.contrats
     WHERE client_id = _client_id AND statut IN ('actif', 'contrat_actif', 'contrat_valide')
  LOOP
    _mois := public.periodicite_suivi_mois(public.branche_contrat(_c.id), _c.recommandation_personnalisee);
    IF _mois IS NULL THEN CONTINUE; END IF;
    UPDATE public.contrats
       SET dernier_suivi_le = CURRENT_DATE,
           prochain_suivi_le = (CURRENT_DATE + (_mois || ' months')::interval)::date
     WHERE id = _c.id;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.replanifier_suivi_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replanifier_suivi_client(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.branche_contrat(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.periodicite_suivi_mois(text, boolean) TO authenticated, service_role;

-- Initialisation des contrats actifs existants.
UPDATE public.contrats c
   SET prochain_suivi_le = (COALESCE(c.date_effet, CURRENT_DATE)
       + (public.periodicite_suivi_mois(public.branche_contrat(c.id), c.recommandation_personnalisee) || ' months')::interval)::date
 WHERE c.statut IN ('actif', 'contrat_actif', 'contrat_valide')
   AND c.prochain_suivi_le IS NULL
   AND public.periodicite_suivi_mois(public.branche_contrat(c.id), c.recommandation_personnalisee) IS NOT NULL;

SELECT cron.schedule(
  'suivi-contrats-periodique',
  '45 8 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://project--858511e9-52da-414d-be08-3727111ac35d.lovable.app/api/public/suivi-contrats',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_fX6ES4Ygmp7ciNow6D__aA_HDcn0vXB"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'brevo-listes-sync',
  '10 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--858511e9-52da-414d-be08-3727111ac35d.lovable.app/api/public/brevo-listes-sync',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_fX6ES4Ygmp7ciNow6D__aA_HDcn0vXB"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);