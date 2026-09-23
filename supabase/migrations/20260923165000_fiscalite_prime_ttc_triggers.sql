-- Automatise la décomposition fiscale à partir du TTC saisi.
-- Pour l'assurance emprunteur, le régime TCAS 9 % est déterministe.
-- Les autres branches restent en mode manuel tant que le régime fiscal exact n'est pas confirmé.

create or replace function public.trg_calculer_fiscalite_contrat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regime text;
  v_calc jsonb;
begin
  if new.is_emprunteur and coalesce(new.prime_ttc_annuelle, new.prime_annuelle) is not null then
    if new.prime_ttc_annuelle is null then
      new.prime_ttc_annuelle := new.prime_annuelle;
      if new.source_prime_ttc is null then
        new.source_prime_ttc := 'prime_annuelle';
      end if;
    end if;

    if new.regime_fiscal is null or new.regime_fiscal = 'manuel' then
      new.regime_fiscal := 'tcas_9_emprunteur';
    end if;

    v_calc := public.calculer_fiscalite_prime_ttc(
      new.prime_ttc_annuelle,
      new.regime_fiscal,
      coalesce(new.contribution_attentat_annuelle, 0)
    );

    if v_calc->>'statut' = 'calcule' then
      new.prime_ht_annuelle := (v_calc->>'prime_ht')::numeric;
      new.taxes_annuelles := (v_calc->>'taxes')::numeric;
      new.assiette_commission_annuelle := new.prime_ht_annuelle;
      new.fiscalite_detail := v_calc;
      new.fiscalite_calculee_le := now();
      if new.prime_nette_annuelle is null then
        new.prime_nette_annuelle := new.prime_ht_annuelle;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_contrats_fiscalite_prime_ttc on public.contrats;
create trigger trg_contrats_fiscalite_prime_ttc
before insert or update of prime_annuelle, prime_ttc_annuelle, prime_nette_annuelle, is_emprunteur, regime_fiscal, contribution_attentat_annuelle
on public.contrats
for each row execute function public.trg_calculer_fiscalite_contrat();

create or replace function public.trg_calculer_fiscalite_devis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_calc jsonb;
begin
  if new.prime_ttc_annuelle is not null then
    select type_assurance into v_type from public.dossiers where id = new.dossier_id;

    if (new.regime_fiscal is null or new.regime_fiscal = 'manuel') and v_type = 'emprunteur' then
      new.regime_fiscal := 'tcas_9_emprunteur';
    end if;

    v_calc := public.calculer_fiscalite_prime_ttc(
      new.prime_ttc_annuelle,
      coalesce(new.regime_fiscal, 'manuel'),
      coalesce(new.contribution_attentat_annuelle, 0)
    );

    if v_calc->>'statut' = 'calcule' then
      new.prime_ht_annuelle := (v_calc->>'prime_ht')::numeric;
      new.taxes_annuelles := (v_calc->>'taxes')::numeric;
      new.assiette_commission_annuelle := new.prime_ht_annuelle;
      new.fiscalite_detail := v_calc;
      new.fiscalite_calculee_le := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_dossier_devis_fiscalite_prime_ttc on public.dossier_devis;
create trigger trg_dossier_devis_fiscalite_prime_ttc
before insert or update of prime_ttc_annuelle, regime_fiscal, contribution_attentat_annuelle, dossier_id
on public.dossier_devis
for each row execute function public.trg_calculer_fiscalite_devis();
