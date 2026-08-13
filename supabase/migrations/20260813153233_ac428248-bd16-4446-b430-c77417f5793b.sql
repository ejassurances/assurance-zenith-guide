CREATE TABLE public.devoir_conseil_refus_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devoir_id uuid NOT NULL REFERENCES public.devoirs_conseil(id) ON DELETE CASCADE,
  dossier_id uuid NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  motif_client text NOT NULL,
  recommandation_ia text NOT NULL CHECK (recommandation_ia IN ('contre_proposition','cloture_perdue')),
  synthese text NOT NULL,
  suggestion_contre_proposition text,
  modele_ia text,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','suivie','ignoree')),
  created_at timestamptz NOT NULL DEFAULT now(),
  traite_par uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  traite_le timestamptz
);

CREATE INDEX idx_dcra_dossier ON public.devoir_conseil_refus_analyses(dossier_id, statut);

GRANT SELECT, INSERT, UPDATE ON public.devoir_conseil_refus_analyses TO authenticated;
GRANT ALL ON public.devoir_conseil_refus_analyses TO service_role;

ALTER TABLE public.devoir_conseil_refus_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cabinet lit les analyses de refus"
ON public.devoir_conseil_refus_analyses FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Cabinet cree les analyses de refus"
ON public.devoir_conseil_refus_analyses FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

CREATE POLICY "Cabinet met a jour les analyses de refus"
ON public.devoir_conseil_refus_analyses FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));