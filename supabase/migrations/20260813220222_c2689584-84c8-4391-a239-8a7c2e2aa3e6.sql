ALTER TYPE public.produit_document_type ADD VALUE IF NOT EXISTS 'ccsf';

ALTER TABLE public.produit_formules
  ADD COLUMN IF NOT EXISTS base_calcul TEXT NOT NULL DEFAULT 'na'
  CHECK (base_calcul IN ('na','ci','crd','ci_crd'));