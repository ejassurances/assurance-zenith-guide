ALTER TABLE public.reclamations ADD COLUMN IF NOT EXISTS compagnie_id uuid REFERENCES public.compagnies(id);
CREATE INDEX IF NOT EXISTS idx_reclamations_compagnie ON public.reclamations(compagnie_id);
UPDATE public.reclamations r SET compagnie_id = c.compagnie_id FROM public.contrats c WHERE r.contrat_id = c.id AND r.compagnie_id IS NULL;

ALTER TABLE public.recommandations_prescripteur ADD COLUMN IF NOT EXISTS dossier_id uuid REFERENCES public.dossiers(id);
ALTER TABLE public.recommandations_prescripteur ADD COLUMN IF NOT EXISTS commission_id uuid REFERENCES public.commissions(id);
CREATE INDEX IF NOT EXISTS idx_reco_prescripteur_dossier ON public.recommandations_prescripteur(dossier_id);