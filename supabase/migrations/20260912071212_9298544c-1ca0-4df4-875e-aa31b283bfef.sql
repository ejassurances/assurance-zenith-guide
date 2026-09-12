ALTER TABLE public.dossier_devis
  ADD COLUMN IF NOT EXISTS commission_base text NOT NULL DEFAULT 'prime',
  ADD COLUMN IF NOT EXISTS commission_source text NOT NULL DEFAULT 'bareme';

ALTER TABLE public.dossier_devis
  DROP CONSTRAINT IF EXISTS dossier_devis_commission_base_check;
ALTER TABLE public.dossier_devis
  ADD CONSTRAINT dossier_devis_commission_base_check
  CHECK (commission_base IN ('prime', 'economie_realisee'));

ALTER TABLE public.dossier_devis
  DROP CONSTRAINT IF EXISTS dossier_devis_commission_source_check;
ALTER TABLE public.dossier_devis
  ADD CONSTRAINT dossier_devis_commission_source_check
  CHECK (commission_source IN ('bareme', 'manuel'));

COMMENT ON COLUMN public.dossier_devis.commission_base IS 'Assiette du taux de commission : prime (cotisation) ou economie_realisee.';
COMMENT ON COLUMN public.dossier_devis.commission_source IS 'Origine du taux : bareme (défaut compagnie/branche) ou manuel (saisi par le conseiller).';