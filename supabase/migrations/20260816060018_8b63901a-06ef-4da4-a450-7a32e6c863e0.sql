ALTER TABLE public.sinistres DROP CONSTRAINT IF EXISTS sinistres_statut_check;
ALTER TABLE public.sinistres ADD CONSTRAINT sinistres_statut_check
  CHECK (statut IN ('ouvert','en_analyse','transmis_compagnie','reponse_envoyee','clos','refuse'));