DROP POLICY IF EXISTS "Staff gere les emails CRM" ON public.crm_emails;

CREATE POLICY "Staff gere les emails CRM"
ON public.crm_emails
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'mandataire'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'mandataire'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_emails TO authenticated;
GRANT ALL ON public.crm_emails TO service_role;