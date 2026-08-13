CREATE TABLE public.commission_bareme (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  niveau text NOT NULL CHECK (niveau IN ('branche','compagnie')),
  branche text NOT NULL,
  compagnie_id uuid REFERENCES public.compagnies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('fixe','pourcentage')),
  montant_fixe numeric(12,2),
  taux_pourcentage numeric(6,3),
  base_calcul text NOT NULL CHECK (base_calcul IN ('prime','economie_realisee')),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commission_bareme_niveau_coherent CHECK (
    (niveau = 'compagnie' AND compagnie_id IS NOT NULL)
    OR (niveau = 'branche' AND compagnie_id IS NULL)
  ),
  CONSTRAINT commission_bareme_valeur_coherente CHECK (
    (type = 'fixe' AND montant_fixe IS NOT NULL)
    OR (type = 'pourcentage' AND taux_pourcentage IS NOT NULL)
  )
);

CREATE UNIQUE INDEX commission_bareme_branche_unique
  ON public.commission_bareme (branche) WHERE niveau = 'branche';
CREATE UNIQUE INDEX commission_bareme_compagnie_unique
  ON public.commission_bareme (branche, compagnie_id) WHERE niveau = 'compagnie';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_bareme TO authenticated;
GRANT ALL ON public.commission_bareme TO service_role;

ALTER TABLE public.commission_bareme ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff peut consulter le bareme de commissions"
  ON public.commission_bareme FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Admin peut creer une regle de commission"
  ON public.commission_bareme FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin peut modifier une regle de commission"
  ON public.commission_bareme FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin peut supprimer une regle de commission"
  ON public.commission_bareme FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_commission_bareme_updated
  BEFORE UPDATE ON public.commission_bareme
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();