-- 1. Fonction sans search_path figé
CREATE OR REPLACE FUNCTION public.periodicite_suivi_mois(_branche text, _recommandation boolean)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _recommandation THEN 6
    WHEN lower(coalesce(_branche,'')) IN ('emprunteur') THEN 12
    WHEN lower(coalesce(_branche,'')) IN ('sante', 'santé', 'prevoyance', 'prévoyance') THEN 12
    ELSE 24
  END
$$;

-- 2. Fonctions SECURITY DEFINER : plus aucune exécution par un visiteur non connecté
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
  END LOOP;
END $$;

-- 3. Suppression des documents KYC scopée au client
DROP POLICY IF EXISTS kyc_delete ON public.client_kyc_documents;
CREATE POLICY kyc_delete ON public.client_kyc_documents
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'mandataire'::app_role) AND can_access_client(client_id))
);

-- 4. Contrôles internes : vérification de rôle homogène
DROP POLICY IF EXISTS "Cabinet peut consulter les controles internes" ON public.controles_internes;
CREATE POLICY "Cabinet peut consulter les controles internes" ON public.controles_internes
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role));

DROP POLICY IF EXISTS "Cabinet peut creer les controles internes" ON public.controles_internes;
CREATE POLICY "Cabinet peut creer les controles internes" ON public.controles_internes
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role));

DROP POLICY IF EXISTS "Cabinet peut modifier les controles internes" ON public.controles_internes;
CREATE POLICY "Cabinet peut modifier les controles internes" ON public.controles_internes
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'mandataire'::app_role));

-- 5. Tiers : lecture mandataire scopée à ses propres pièces comptables
DROP POLICY IF EXISTS "Tiers lecture mandataire" ON public.tiers;
CREATE POLICY "Tiers lecture mandataire" ON public.tiers
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'mandataire'::app_role)
  AND (
    EXISTS (
      SELECT 1 FROM public.factures_achat f
      WHERE f.tiers_id = tiers.id AND f.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.ecritures_lignes l
      JOIN public.ecritures e ON e.id = l.ecriture_id
      WHERE l.tiers_id = tiers.id AND e.created_by = auth.uid()
    )
  )
);