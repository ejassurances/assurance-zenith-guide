ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS ecriture_id uuid REFERENCES public.ecritures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compte_produit text NOT NULL DEFAULT '706100';

CREATE INDEX IF NOT EXISTS idx_commissions_ecriture ON public.commissions(ecriture_id);