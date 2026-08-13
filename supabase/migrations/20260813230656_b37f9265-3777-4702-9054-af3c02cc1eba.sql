DROP POLICY IF EXISTS "Staff gere les bulletins de commission" ON storage.objects;
CREATE POLICY "Staff gere les bulletins de commission"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'bordereaux-commissions' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire')))
WITH CHECK (bucket_id = 'bordereaux-commissions' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire')));