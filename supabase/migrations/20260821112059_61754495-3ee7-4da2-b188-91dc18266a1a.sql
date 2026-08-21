ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS analyse_ia jsonb,
  ADD COLUMN IF NOT EXISTS analyse_ia_le timestamptz,
  ADD COLUMN IF NOT EXISTS analyse_ia_modele text;