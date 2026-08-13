CREATE TABLE public.dossier_devis_classements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  genere_le timestamptz NOT NULL DEFAULT now(),
  modele_ia text,
  classement jsonb NOT NULL DEFAULT '[]'::jsonb,
  statut text NOT NULL DEFAULT 'propose' CHECK (statut IN ('propose','traite')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ddc_dossier ON public.dossier_devis_classements(dossier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossier_devis_classements TO authenticated;
GRANT ALL ON public.dossier_devis_classements TO service_role;

ALTER TABLE public.dossier_devis_classements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet manage devis classements"
ON public.dossier_devis_classements FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE TRIGGER trg_ddc_updated BEFORE UPDATE ON public.dossier_devis_classements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();