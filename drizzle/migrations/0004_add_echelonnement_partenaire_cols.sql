ALTER TABLE public.devoirs_conseil
  ADD COLUMN IF NOT EXISTS echelonnement_partenaire_confirme boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS echelonnement_partenaire_confirme_par uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS echelonnement_partenaire_confirme_le timestamptz;