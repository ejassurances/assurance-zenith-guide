ALTER TABLE public.produit_garanties_propositions
  ADD COLUMN IF NOT EXISTS assureur_porteur_propose text,
  ADD COLUMN IF NOT EXISTS reference_contrat_propose text,
  ADD COLUMN IF NOT EXISTS assureur_porteur_extrait text,
  ADD COLUMN IF NOT EXISTS assureur_porteur_confiance numeric;

ALTER TABLE public.produits
  ADD COLUMN IF NOT EXISTS reference_contrat text;