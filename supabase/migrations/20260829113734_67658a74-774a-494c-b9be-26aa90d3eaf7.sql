ALTER TABLE public.produits
  ADD COLUMN IF NOT EXISTS frais_versement_pct numeric,
  ADD COLUMN IF NOT EXISTS frais_gestion_pct numeric,
  ADD COLUMN IF NOT EXISTS frais_arbitrage_pct numeric;

CREATE TABLE IF NOT EXISTS public.etudes_epargne (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  produit_id uuid REFERENCES public.produits(id) ON DELETE SET NULL,
  profil_risque text,
  contrat_actuel jsonb NOT NULL DEFAULT '{}'::jsonb,
  offre_cabinet jsonb NOT NULL DEFAULT '{}'::jsonb,
  hypotheses jsonb NOT NULL DEFAULT '{}'::jsonb,
  comparatif jsonb NOT NULL DEFAULT '{}'::jsonb,
  statut text NOT NULL DEFAULT 'produite',
  motif_indisponibilite text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS etudes_epargne_dossier_idx ON public.etudes_epargne(dossier_id);
CREATE INDEX IF NOT EXISTS etudes_epargne_client_idx ON public.etudes_epargne(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.etudes_epargne TO authenticated;
GRANT ALL ON public.etudes_epargne TO service_role;

ALTER TABLE public.etudes_epargne ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etudes_epargne_staff_all" ON public.etudes_epargne
  FOR ALL TO authenticated
  USING (public.can_access_dossier(dossier_id))
  WITH CHECK (public.can_access_dossier(dossier_id));

CREATE TRIGGER update_etudes_epargne_updated_at
  BEFORE UPDATE ON public.etudes_epargne
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();