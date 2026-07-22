
-- 1. Move sensitive API integration columns to a separate admin-only table
CREATE TABLE public.compagnies_api_config (
  compagnie_id uuid PRIMARY KEY REFERENCES public.compagnies(id) ON DELETE CASCADE,
  api_base_url text,
  api_auth_type public.api_auth_type NOT NULL DEFAULT 'none',
  api_secret_name text,
  api_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compagnies_api_config TO authenticated;
GRANT ALL ON public.compagnies_api_config TO service_role;

ALTER TABLE public.compagnies_api_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compagnies_api_config_admin_all" ON public.compagnies_api_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_compagnies_api_config_updated_at
  BEFORE UPDATE ON public.compagnies_api_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from existing compagnies rows
INSERT INTO public.compagnies_api_config (compagnie_id, api_base_url, api_auth_type, api_secret_name, api_config)
SELECT id, api_base_url, api_auth_type, api_secret_name, COALESCE(api_config, '{}'::jsonb)
FROM public.compagnies
WHERE api_base_url IS NOT NULL
   OR api_secret_name IS NOT NULL
   OR (api_config IS NOT NULL AND api_config <> '{}'::jsonb)
   OR api_auth_type <> 'none';

-- Drop sensitive columns from compagnies (api_active stays: it's just a flag)
ALTER TABLE public.compagnies
  DROP COLUMN api_base_url,
  DROP COLUMN api_auth_type,
  DROP COLUMN api_secret_name,
  DROP COLUMN api_config;

-- 2. Lock down SECURITY DEFINER functions: revoke default PUBLIC EXECUTE
-- Internal-only functions (triggers / server-side compute): remove from anon+authenticated
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recalculer_echeances() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculer_echeances_contrat(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trouver_taux_regle(uuid, text, uuid, uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- RLS helper functions: revoke from PUBLIC and anon, keep authenticated (needed for RLS evaluation)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_dossier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_dossier(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_client(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
