ALTER TABLE public.compagnies
  ADD COLUMN IF NOT EXISTS tier_favori integer;

ALTER TABLE public.compagnies
  ADD CONSTRAINT compagnies_tier_favori_check CHECK (tier_favori IS NULL OR tier_favori IN (1, 2, 3));

COMMENT ON COLUMN public.compagnies.tier_favori IS 'Compagnie favorite du cabinet : 1 = top 1, 2, 3 ; NULL = non favorite. Utilisé pour prioriser le classement IA des devis.';