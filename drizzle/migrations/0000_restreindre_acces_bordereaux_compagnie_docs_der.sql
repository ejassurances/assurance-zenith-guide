-- 1) bordereau_lignes : donnees client/contrat/commission -> staff uniquement, aucun acces anonyme
REVOKE ALL ON public.bordereau_lignes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bordereau_lignes TO authenticated;
GRANT ALL ON public.bordereau_lignes TO service_role;

DROP POLICY IF EXISTS "Staff gere les lignes de bordereau" ON public.bordereau_lignes;
CREATE POLICY "bordereau_lignes_staff_all"
ON public.bordereau_lignes
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role));

-- Verrou supplementaire : aucune ligne n'est lisible en dehors du staff, meme si une
-- future politique permissive etait ajoutee par erreur.
CREATE POLICY "bordereau_lignes_staff_only_restrictive"
ON public.bordereau_lignes
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role));

-- 2) compagnie_documents : les documents commercialement sensibles restent admin
REVOKE ALL ON public.compagnie_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compagnie_documents TO authenticated;
GRANT ALL ON public.compagnie_documents TO service_role;

DROP POLICY IF EXISTS "compagnie docs mandataire read" ON public.compagnie_documents;
CREATE POLICY "compagnie_docs_mandataire_read_non_sensible"
ON public.compagnie_documents
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'mandataire'::app_role)
  AND type NOT IN (
    'protocole_commissions'::compagnie_doc_type,
    'conditions_apporteur'::compagnie_doc_type
  )
);

-- 3) der_modele : modeles internes reserves au staff du cabinet et aux clients destinataires
REVOKE ALL ON public.der_modele FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.der_modele TO authenticated;
GRANT ALL ON public.der_modele TO service_role;

DROP POLICY IF EXISTS "der_modele_select_staff_or_own" ON public.der_modele;
CREATE POLICY "der_modele_select_staff_or_own"
ON public.der_modele
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'mandataire'::app_role)
  OR EXISTS (
    SELECT 1
    FROM client_der_envois e
    JOIN clients c ON c.id = e.client_id
    WHERE e.der_modele_id = der_modele.id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "der_modele_read_staff" ON storage.objects;
CREATE POLICY "der_modele_read_staff"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'conformite-documents'
  AND (storage.foldername(name))[1] = 'der-modele'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'mandataire'::app_role)
  )
);