-- ============ 1. reference_compteurs : policy service_role uniquement =============
GRANT SELECT, UPDATE ON public.reference_compteurs TO service_role;
ALTER TABLE public.reference_compteurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reference_compteurs_service_role"
  ON public.reference_compteurs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============ 2. Revocation EXECUTE : fonctions internes jamais appele par l'application =============
-- (fonctions de trigger et fonctions reservees au systeme / client admin)
REVOKE EXECUTE ON FUNCTION public.branche_contrat(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculer_risque_lcbft(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nb_assures_emprunteur(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculer_prevision_contrat(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replanifier_suivi_client(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_bloquer_contrat_couplage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_bloquer_devoir_sans_grille() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_contrat_planifier_suivi() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_contrat_prevision_commission() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_dossier_suit_contrat_actif() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_garanties_validation_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_risque_lcbft_sur_conformite() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_verrouiller_contrat_actif() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.branche_contrat(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculer_risque_lcbft(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.nb_assures_emprunteur(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculer_prevision_contrat(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.replanifier_suivi_client(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_bloquer_contrat_couplage() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_bloquer_devoir_sans_grille() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_contrat_planifier_suivi() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_contrat_prevision_commission() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_dossier_suit_contrat_actif() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_garanties_validation_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_risque_lcbft_sur_conformite() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_verrouiller_contrat_actif() TO service_role;

-- ============ 3. Fonctions legitimes : retrait anon/public, conservation authenticated + service_role =============
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_client(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_contrat(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_dossier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.score_valeur_client(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.score_conformite_cabinet() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.economies_emprunteur(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.corriger_contrat_actif(uuid, jsonb, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_contrat(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_dossier(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.score_valeur_client(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.score_conformite_cabinet() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.economies_emprunteur(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.corriger_contrat_actif(uuid, jsonb, text) TO authenticated, service_role;