-- Zone de référence pour la clause de non-concurrence post-contractuelle
-- (30 km autour de ce point, 1 an après la rupture) — personnalisable par
-- mandataire plutôt qu'un point fixe dans le texte du contrat.

ALTER TABLE public.mandataires_profils
  ADD COLUMN IF NOT EXISTS zone_non_concurrence text;

COMMENT ON COLUMN public.mandataires_profils.zone_non_concurrence IS
  'Point de référence (commune ou adresse) du rayon de 30 km de la clause de non-concurrence post-contrat, propre à ce mandataire.';
