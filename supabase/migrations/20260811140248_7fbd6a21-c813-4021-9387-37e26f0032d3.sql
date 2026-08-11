REVOKE EXECUTE ON FUNCTION public.calculer_score_conformite_client(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.solde_compte(text, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalcul_conformite_client() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verifier_equilibre_ecriture(uuid) FROM authenticated;