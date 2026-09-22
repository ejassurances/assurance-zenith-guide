-- Confirmation explicite, tracée (qui, quand), que le courtier/mandataire a
-- bien renseigné l'échelonnement sur l'intranet du partenaire — pas une
-- simple case qu'on peut cocher sans avoir fait l'action, une popup
-- bloquante à l'ouverture du dossier tant que ce n'est pas confirmé.

ALTER TABLE public.devoirs_conseil
  ADD COLUMN IF NOT EXISTS echelonnement_partenaire_confirme boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS echelonnement_partenaire_confirme_par uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS echelonnement_partenaire_confirme_le timestamptz;

COMMENT ON COLUMN public.devoirs_conseil.echelonnement_partenaire_confirme IS
  'Le courtier/mandataire a confirmé avoir renseigné l''échelonnement sur l''intranet du partenaire (popup bloquante à l''ouverture du dossier).';
