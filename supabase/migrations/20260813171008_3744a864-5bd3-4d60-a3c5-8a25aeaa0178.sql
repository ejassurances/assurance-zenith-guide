ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS image_url text;

CREATE POLICY "compagnies_logos_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'compagnies-logos');
CREATE POLICY "compagnies_logos_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'compagnies-logos' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire')));
CREATE POLICY "compagnies_logos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'compagnies-logos' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire')));
CREATE POLICY "compagnies_logos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'compagnies-logos' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire')));

CREATE POLICY "produits_images_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'produits-images');
CREATE POLICY "produits_images_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'produits-images' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire')));
CREATE POLICY "produits_images_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'produits-images' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire')));
CREATE POLICY "produits_images_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'produits-images' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'mandataire')));