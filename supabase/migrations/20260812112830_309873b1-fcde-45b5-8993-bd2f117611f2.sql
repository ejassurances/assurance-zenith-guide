ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS date_expiration date,
  ADD COLUMN IF NOT EXISTS rappel_expiration_envoye_le timestamp with time zone;

ALTER TABLE public.client_kyc_documents
  ADD COLUMN IF NOT EXISTS rappel_expiration_envoye_le timestamp with time zone;

DROP POLICY IF EXISTS "Staff peut mettre a jour les documents" ON public.documents;
CREATE POLICY "Staff peut mettre a jour les documents"
ON public.documents
FOR UPDATE
TO authenticated
USING (public.current_user_role() IN ('admin','mandataire'))
WITH CHECK (public.current_user_role() IN ('admin','mandataire'));

CREATE INDEX IF NOT EXISTS documents_date_expiration_idx ON public.documents (date_expiration) WHERE date_expiration IS NOT NULL;
CREATE INDEX IF NOT EXISTS client_kyc_documents_date_expiration_idx ON public.client_kyc_documents (date_expiration) WHERE date_expiration IS NOT NULL;