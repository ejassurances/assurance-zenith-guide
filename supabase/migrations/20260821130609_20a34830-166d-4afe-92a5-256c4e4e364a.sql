REVOKE EXECUTE ON FUNCTION public.generer_reference(text, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_reference_client() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_reference_dossier() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_reference_sinistre() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_reference_reclamation() FROM anon, authenticated, public;