
CREATE POLICY "Lire fichiers dossier" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'dossier-documents'
  AND public.can_access_dossier((storage.foldername(name))[1]::uuid)
);
CREATE POLICY "Uploader fichiers dossier" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'dossier-documents'
  AND public.can_access_dossier((storage.foldername(name))[1]::uuid)
);
CREATE POLICY "Supprimer fichier propriétaire ou admin" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'dossier-documents'
  AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'))
);
