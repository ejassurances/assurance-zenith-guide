-- conformite-documents : chemins sous "<user_id>/..."
CREATE POLICY "conformite storage admin all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'conformite-documents' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'conformite-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "conformite storage owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'conformite-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "conformite storage owner upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'conformite-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "conformite storage owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'conformite-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "conformite storage owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'conformite-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- compagnie-documents : lecture mandataire + admin, écriture admin
CREATE POLICY "compagnie docs storage admin all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'compagnie-documents' AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'compagnie-documents' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "compagnie docs storage mandataire read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'compagnie-documents' AND has_role(auth.uid(), 'mandataire'::app_role));