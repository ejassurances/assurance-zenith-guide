ALTER TABLE public.devoirs_conseil
  ADD COLUMN IF NOT EXISTS valide_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valide_par UUID;

CREATE INDEX IF NOT EXISTS devoirs_conseil_valide_le_idx
  ON public.devoirs_conseil (valide_le)
  WHERE valide_le IS NOT NULL;