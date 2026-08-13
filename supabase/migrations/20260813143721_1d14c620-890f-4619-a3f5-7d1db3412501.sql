REVOKE ALL ON FUNCTION public.trg_der_marquer_obsolete() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.trg_formule_garanties_validation_admin() FROM anon, authenticated, public;

DROP POLICY IF EXISTS "Voir historique de ses dossiers" ON public.dossier_etapes_historique;
CREATE POLICY "Voir historique de ses dossiers"
ON public.dossier_etapes_historique
FOR SELECT TO authenticated
USING (public.can_access_dossier(dossier_id));

DROP POLICY IF EXISTS "Staff journalise les étapes" ON public.dossier_etapes_historique;
CREATE POLICY "Staff journalise les étapes"
ON public.dossier_etapes_historique
FOR INSERT TO authenticated
WITH CHECK (par = auth.uid() AND public.can_access_dossier(dossier_id));