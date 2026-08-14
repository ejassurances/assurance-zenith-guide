CREATE OR REPLACE FUNCTION public.score_valeur_client(p_client_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ca AS (
    SELECT COALESCE(SUM(cm.montant), 0)::numeric AS total
    FROM public.commissions cm
    JOIN public.contrats ct ON ct.id = cm.contrat_id
    WHERE ct.client_id = p_client_id AND cm.statut = 'versee'
  ), nb_ct AS (
    SELECT COUNT(*)::numeric AS n FROM public.contrats WHERE client_id = p_client_id
  ), nb_reco AS (
    SELECT COUNT(*)::numeric AS n FROM public.clients
    WHERE client_origine_id = p_client_id
      AND origine IN ('parrainage', 'recommandation')
  )
  SELECT GREATEST(0, LEAST(100, ROUND(
      LEAST((SELECT total FROM ca) / 5000, 1) * 100 * 0.50
    + LEAST((SELECT n FROM nb_ct) / 5, 1) * 100 * 0.25
    + LEAST((SELECT n FROM nb_reco) / 5, 1) * 100 * 0.25
  )))::integer
$$;

REVOKE ALL ON FUNCTION public.score_valeur_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.score_valeur_client(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.scores_valeur_clients()
RETURNS TABLE(client_id uuid, score integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id, public.score_valeur_client(c.id) FROM public.clients c
$$;

REVOKE ALL ON FUNCTION public.scores_valeur_clients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scores_valeur_clients() TO authenticated, service_role;