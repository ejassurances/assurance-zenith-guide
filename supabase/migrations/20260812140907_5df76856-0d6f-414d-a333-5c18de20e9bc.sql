-- 1. client_kyc_documents : séparer lecture / écriture / suppression
DROP POLICY IF EXISTS "kyc access via client" ON public.client_kyc_documents;

CREATE POLICY "kyc_select" ON public.client_kyc_documents
FOR SELECT TO authenticated
USING (
  public.can_access_client(client_id)
  OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
);

CREATE POLICY "kyc_insert" ON public.client_kyc_documents
FOR INSERT TO authenticated
WITH CHECK (public.can_access_client(client_id));

CREATE POLICY "kyc_update" ON public.client_kyc_documents
FOR UPDATE TO authenticated
USING (public.can_access_client(client_id))
WITH CHECK (public.can_access_client(client_id));

CREATE POLICY "kyc_delete" ON public.client_kyc_documents
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));

-- 2. der_modele : lecture staff + client concerné
DROP POLICY IF EXISTS "der_modele_read_all_auth" ON public.der_modele;

CREATE POLICY "der_modele_select_staff_or_own" ON public.der_modele
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'mandataire')
  OR public.has_role(auth.uid(), 'prescripteur')
  OR EXISTS (
    SELECT 1
    FROM public.client_der_envois e
    JOIN public.clients c ON c.id = e.client_id
    WHERE e.der_modele_id = der_modele.id
      AND c.user_id = auth.uid()
  )
);

-- 3. documents : update via has_role (rôles multiples fiables)
DROP POLICY IF EXISTS "Staff peut mettre a jour les documents" ON public.documents;

CREATE POLICY "documents_update_staff" ON public.documents
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'mandataire'));
