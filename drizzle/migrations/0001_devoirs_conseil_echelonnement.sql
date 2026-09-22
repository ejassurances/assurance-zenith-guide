ALTER TABLE public.devoirs_conseil
  ADD COLUMN IF NOT EXISTS echelonnement_demande boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS echelonnement_montant_mensuel numeric;