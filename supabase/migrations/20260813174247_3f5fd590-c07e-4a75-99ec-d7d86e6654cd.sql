ALTER TABLE public.produits
  ADD COLUMN IF NOT EXISTS mode_tarification text NOT NULL DEFAULT 'manuel';

ALTER TABLE public.produits
  DROP CONSTRAINT IF EXISTS produits_mode_tarification_check;
ALTER TABLE public.produits
  ADD CONSTRAINT produits_mode_tarification_check
  CHECK (mode_tarification IN ('api','manuel','fixe'));

ALTER TABLE public.produit_formules
  ADD COLUMN IF NOT EXISTS tarif_fixe numeric;

CREATE TABLE public.produit_options (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  nom text NOT NULL,
  tarif_fixe numeric,
  description text,
  actif boolean NOT NULL DEFAULT true,
  ordre integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX produit_options_produit_id_idx ON public.produit_options(produit_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.produit_options TO authenticated;
GRANT ALL ON public.produit_options TO service_role;

ALTER TABLE public.produit_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet lit les options produit"
  ON public.produit_options FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Staff gere les options produit"
  ON public.produit_options FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER update_produit_options_updated_at
  BEFORE UPDATE ON public.produit_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();