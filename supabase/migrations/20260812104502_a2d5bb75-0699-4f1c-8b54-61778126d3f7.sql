ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS economie_cout_groupe numeric(14,2),
  ADD COLUMN IF NOT EXISTS economie_cout_delegue numeric(14,2),
  ADD COLUMN IF NOT EXISTS economie_realisee numeric(14,2),
  ADD COLUMN IF NOT EXISTS economie_taux_groupe numeric,
  ADD COLUMN IF NOT EXISTS economie_taux_delegue numeric,
  ADD COLUMN IF NOT EXISTS economie_base jsonb,
  ADD COLUMN IF NOT EXISTS economie_calculee_le timestamp with time zone;

CREATE OR REPLACE FUNCTION public.economies_emprunteur(_mandataire_id uuid DEFAULT NULL)
RETURNS TABLE(total_economies numeric, nb_contrats integer, economie_moyenne numeric, capital_total numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_admin boolean := public.has_role(auth.uid(), 'admin');
  _is_mand  boolean := public.has_role(auth.uid(), 'mandataire');
  _filter   uuid;
BEGIN
  IF NOT (_is_admin OR _is_mand) THEN
    RETURN QUERY SELECT 0::numeric, 0::integer, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  IF _is_admin THEN
    _filter := _mandataire_id;
  ELSE
    _filter := auth.uid();
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(c.economie_realisee), 0)::numeric,
    COUNT(*)::int,
    COALESCE(ROUND(AVG(c.economie_realisee), 2), 0)::numeric,
    COALESCE(SUM(c.capital_initial), 0)::numeric
  FROM public.contrats c
  JOIN public.clients cl ON cl.id = c.client_id
  WHERE c.is_emprunteur
    AND c.statut = 'signe'
    AND c.economie_realisee IS NOT NULL
    AND cl.marque = 'ej_assurances'
    AND (_filter IS NULL OR c.mandataire_id = _filter);
END;
$$;

REVOKE ALL ON FUNCTION public.economies_emprunteur(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.economies_emprunteur(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.economies_emprunteur(uuid) TO authenticated;