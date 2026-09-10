ALTER TABLE public.dossier_references_externes
  ADD COLUMN IF NOT EXISTS contrat_id uuid REFERENCES public.contrats(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS dossier_references_externes_contrat_unique
  ON public.dossier_references_externes (contrat_id, upper(reference))
  WHERE contrat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS dossier_references_externes_contrat_idx
  ON public.dossier_references_externes (contrat_id);

DROP POLICY IF EXISTS "references_externes_acces_dossier" ON public.dossier_references_externes;
CREATE POLICY "references_externes_acces_dossier"
  ON public.dossier_references_externes
  TO authenticated
  USING (public.can_access_dossier(dossier_id) AND (contrat_id IS NULL OR public.can_access_contrat(contrat_id)))
  WITH CHECK (public.can_access_dossier(dossier_id) AND (contrat_id IS NULL OR public.can_access_contrat(contrat_id)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dossier_references_externes TO authenticated;
GRANT ALL ON public.dossier_references_externes TO service_role;