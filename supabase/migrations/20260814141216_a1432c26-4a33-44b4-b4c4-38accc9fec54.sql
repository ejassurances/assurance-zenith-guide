ALTER TABLE public.commission_previsions
  ADD COLUMN IF NOT EXISTS reduction_courtage_pct numeric,
  ADD CONSTRAINT commission_previsions_reduction_courtage_pct_check
    CHECK (reduction_courtage_pct IS NULL OR (reduction_courtage_pct >= 0 AND reduction_courtage_pct <= 15));

ALTER TABLE public.devoir_conseil_refus_analyses
  ADD COLUMN IF NOT EXISTS niveau text,
  ADD COLUMN IF NOT EXISTS niveau_justification text,
  ADD COLUMN IF NOT EXISTS devis_alternatif_id uuid REFERENCES public.dossier_devis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reduction_courtage_pct numeric,
  ADD COLUMN IF NOT EXISTS execution_auto_le timestamptz,
  ADD COLUMN IF NOT EXISTS execution_auto_detail text,
  ADD CONSTRAINT devoir_conseil_refus_analyses_niveau_check
    CHECK (niveau IS NULL OR niveau IN ('niveau_1', 'niveau_2')),
  ADD CONSTRAINT devoir_conseil_refus_analyses_reduction_check
    CHECK (reduction_courtage_pct IS NULL OR (reduction_courtage_pct >= 0 AND reduction_courtage_pct <= 15));