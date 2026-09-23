-- CORRECTIF D'ACCÈS — trouvé en travaillant sur le cloisonnement des
-- mandataires (23/09/2026) : can_access_contrat() accordait l'accès à
-- TOUS les contrats à TOUT mandataire, sans vérifier qu'il en est bien le
-- titulaire — contrairement à can_access_client() et can_access_dossier(),
-- qui vérifient déjà correctement la propriété (mandataire_id/created_by/
-- apporteur_id). Un mandataire pouvait donc voir les contrats des autres
-- mandataires.
--
-- Corrigé sur le même principe que les deux autres fonctions : admin voit
-- tout, sinon uniquement les contrats dont on est le mandataire, le
-- prescripteur, le créateur, ou dont le client est accessible.

CREATE OR REPLACE FUNCTION public.can_access_contrat(_contrat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contrats c
    WHERE c.id = _contrat_id
      AND (
        public.has_role(auth.uid(), 'admin') OR
        c.mandataire_id = auth.uid() OR
        c.prescripteur_id = auth.uid() OR
        c.created_by = auth.uid() OR
        (c.client_id IS NOT NULL AND public.can_access_client(c.client_id))
      )
  )
$$;
