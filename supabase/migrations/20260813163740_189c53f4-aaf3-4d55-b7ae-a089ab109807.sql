ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS contrat_id uuid REFERENCES public.contrats(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS documents_contrat_id_idx ON public.documents(contrat_id);

CREATE OR REPLACE FUNCTION public.can_access_contrat(_contrat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contrats c
    WHERE c.id = _contrat_id
      AND (
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'mandataire') OR
        (c.client_id IS NOT NULL AND public.can_access_client(c.client_id))
      )
  )
$$;
REVOKE ALL ON FUNCTION public.can_access_contrat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_contrat(uuid) TO authenticated;

DROP POLICY IF EXISTS documents_select ON public.documents;
CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated
USING (
  ((dossier_id IS NOT NULL) AND can_access_dossier(dossier_id))
  OR ((client_id IS NOT NULL) AND can_access_client(client_id))
  OR ((contrat_id IS NOT NULL) AND can_access_contrat(contrat_id))
);

DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  (uploader_id = auth.uid())
  AND (
    ((dossier_id IS NOT NULL) AND can_access_dossier(dossier_id))
    OR ((client_id IS NOT NULL) AND can_access_client(client_id))
    OR ((contrat_id IS NOT NULL) AND can_access_contrat(contrat_id))
  )
);