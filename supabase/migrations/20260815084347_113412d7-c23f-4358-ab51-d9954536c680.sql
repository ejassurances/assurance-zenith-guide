-- 1. Revoke public/anon execute on internal SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.purger_neoliane_evenements() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_actualiser_prevision_commission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_sinistre_gestion_staff_only() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purger_neoliane_evenements() TO service_role;

-- 2. Fix can_access_dossier: map auth user through clients.user_id
CREATE OR REPLACE FUNCTION public.can_access_dossier(_dossier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.dossiers d
    WHERE d.id = _dossier_id AND (
      public.has_role(auth.uid(), 'admin')
      OR d.apporteur_id = auth.uid()
      OR d.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = d.client_id AND c.user_id = auth.uid()
      )
    )
  );
$function$;

-- 3. Fix contrat_echeances client policy
DROP POLICY IF EXISTS "Client voit ses echeances (sans commission)" ON public.contrat_echeances;
CREATE POLICY "Client voit ses echeances (sans commission)"
ON public.contrat_echeances
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contrats ct
  JOIN public.clients cl ON cl.id = ct.client_id
  WHERE ct.id = contrat_echeances.contrat_id
    AND cl.user_id = auth.uid()
));