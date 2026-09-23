-- Le calcul fiscal consulte le référentiel assurance_regles_fiscales : STABLE est correct, IMMUTABLE ne l'est pas.
create or replace function public.calculer_fiscalite_prime_ttc(
  p_prime_ttc numeric,
  p_regime text,
  p_contribution_attentat numeric default 0
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_taux numeric;
  v_ht numeric;
  v_taxe numeric;
  v_contribution numeric := coalesce(p_contribution_attentat, 0);
begin
  if p_prime_ttc is null then
    return jsonb_build_object('statut', 'incomplet');
  end if;

  select taux into v_taux
  from public.assurance_regles_fiscales
  where code = p_regime
    and actif = true
  order by date_debut desc
  limit 1;

  if p_regime = 'manuel' or v_taux is null then
    return jsonb_build_object(
      'statut', 'a_confirmer',
      'prime_ttc', round(p_prime_ttc, 2),
      'contribution_attentat', round(v_contribution, 2)
    );
  end if;

  if v_taux = 0 then
    v_ht := p_prime_ttc;
  else
    v_ht := p_prime_ttc / (1 + v_taux);
  end if;

  v_taxe := p_prime_ttc - v_ht;

  return jsonb_build_object(
    'statut', 'calcule',
    'prime_ttc', round(p_prime_ttc, 2),
    'prime_ht', round(v_ht, 2),
    'taxes', round(v_taxe, 2),
    'contribution_attentat', round(v_contribution, 2),
    'total_taxes_contributions', round(v_taxe + v_contribution, 2),
    'taux', v_taux
  );
end;
$$;
