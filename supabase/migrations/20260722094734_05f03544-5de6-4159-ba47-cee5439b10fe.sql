
ALTER TABLE public.documents ALTER COLUMN dossier_id DROP NOT NULL;
ALTER TABLE public.documents ADD CONSTRAINT documents_link_check
  CHECK (dossier_id IS NOT NULL OR client_id IS NOT NULL);

DROP POLICY IF EXISTS "Voir documents du dossier" ON public.documents;
DROP POLICY IF EXISTS "Uploader document si accès" ON public.documents;

CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated
USING (
  (dossier_id IS NOT NULL AND public.can_access_dossier(dossier_id))
  OR (client_id IS NOT NULL AND public.can_access_client(client_id))
);

CREATE POLICY "documents_insert" ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  uploader_id = auth.uid()
  AND (
    (dossier_id IS NOT NULL AND public.can_access_dossier(dossier_id))
    OR (client_id IS NOT NULL AND public.can_access_client(client_id))
  )
);
