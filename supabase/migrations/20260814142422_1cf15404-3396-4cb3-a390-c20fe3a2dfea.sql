ALTER TABLE public.dossier_devis
  ADD COLUMN IF NOT EXISTS quotite_pct numeric;

ALTER TABLE public.dossier_devis
  DROP CONSTRAINT IF EXISTS dossier_devis_quotite_pct_check;

ALTER TABLE public.dossier_devis
  ADD CONSTRAINT dossier_devis_quotite_pct_check
  CHECK (quotite_pct IS NULL OR (quotite_pct > 0 AND quotite_pct <= 100));