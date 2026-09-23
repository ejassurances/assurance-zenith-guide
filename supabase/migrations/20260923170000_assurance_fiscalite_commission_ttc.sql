-- Référentiel fiscal et séparation TTC / HT / taxes / assiette de commission.
-- La migration ajoute la structure et initialise uniquement les nouvelles colonnes
-- à partir de valeurs déjà présentes lorsqu'elles sont non ambiguës.

create table if not exists public.taxes_assurances (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  taux numeric(8,5),
  montant_forfaitaire numeric(12,2),
  branche text,
  produit text,
  base_calcul text not null default 'prime_ttc',
  actif boolean not null default true,
  date_debut date,
  date_fin date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.taxes_assurances
  (code, libelle, taux, branche, produit, base_calcul, actif, date_debut, notes)
values
  ('TCAS_EMPRUNTEUR_9', 'Taxe sur les conventions d''assurances — assurance décès en garantie d''un prêt', 9.00000, 'emprunteur', 'assurance_deces_credit', 'prime_ht', true, date '2019-01-01', 'Référentiel CRM : le montant client TTC est la donnée source. Le HT est reconstruit à partir du régime fiscal applicable.'),
  ('CONTRIBUTION_ATTENTAT', 'Contribution au fonds de garantie des victimes des actes de terrorisme', null, 'biens', null, 'forfait', true, date '2027-01-01', 'Ne pas appliquer automatiquement aux contrats emprunteur. Applicabilité déterminée par branche/produit et période.' )
on conflict (code) do nothing;

alter table public.contrats
  add column if not exists prime_ttc_source_annuelle numeric(14,2),
  add column if not exists prime_ht_annuelle numeric(14,2),
  add column if not exists taxes_annuelles numeric(14,2),
  add column if not exists assiette_commission_annuelle numeric(14,2),
  add column if not exists regime_fiscal_code text,
  add column if not exists devis_retenu_id uuid,
  add column if not exists document_devis_id uuid,
  add column if not exists controle_financier_statut text,
  add column if not exists controle_financier_details jsonb;

comment on column public.contrats.prime_ttc_source_annuelle is 'Prime TTC annuelle issue du devis/contrat client ; donnée source commerciale.';
comment on column public.contrats.prime_ht_annuelle is 'Prime annuelle hors taxes reconstruite depuis le TTC et le régime fiscal applicable.';
comment on column public.contrats.taxes_annuelles is 'Total annuel des taxes/contributions séparées de la prime HT.';
comment on column public.contrats.assiette_commission_annuelle is 'Base annuelle réellement commissionnable selon le barème de la compagnie ; distincte du TTC.';
comment on column public.contrats.devis_retenu_id is 'Identifiant du devis retenu comme source commerciale du contrat, sans contrainte FK pour préserver les données existantes.';
comment on column public.contrats.document_devis_id is 'Identifiant du document justificatif du devis retenu.';

create or replace function public.calculer_montants_assurance_depuis_ttc(
  p_prime_ttc numeric,
  p_taux_taxe numeric default null,
  p_forfait_taxe numeric default 0
)
returns table (
  prime_ttc numeric,
  prime_ht numeric,
  taxes numeric
)
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_prime_ttc is null then
    return query select null::numeric, null::numeric, null::numeric;
    return;
  end if;

  if p_taux_taxe is null then
    return query select round(p_prime_ttc, 2), null::numeric, null::numeric;
    return;
  end if;

  prime_ht := round((p_prime_ttc - coalesce(p_forfait_taxe, 0)) / (1 + p_taux_taxe / 100), 2);
  taxes := round(p_prime_ttc - prime_ht, 2);
  prime_ttc := round(p_prime_ttc, 2);
  return next;
end;
$$;

-- Retourne le montant de commission calculé sur l'assiette HT/commissionnable.
create or replace function public.calculer_commission_depuis_assiette(
  p_assiette_commission numeric,
  p_taux_commission numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_assiette_commission is null or p_taux_commission is null then null
    else round(p_assiette_commission * p_taux_commission / 100, 2)
  end;
$$;

-- Pour l'assurance emprunteur dont le régime 9 % est confirmé,
-- dérive HT/taxes depuis le seul TTC du devis.
create or replace function public.calculer_emprunteur_depuis_ttc(p_prime_ttc numeric)
returns table (
  prime_ttc numeric,
  prime_ht numeric,
  taxes numeric
)
language sql
immutable
set search_path = public
as $$
  select * from public.calculer_montants_assurance_depuis_ttc(p_prime_ttc, 9, 0);
$$;

-- Compatibilité avec le moteur historique : si une assiette explicite existe
-- déjà, elle devient la source prioritaire sans écraser une valeur existante.
update public.contrats
set assiette_commission_annuelle = prime_nette_annuelle
where assiette_commission_annuelle is null
  and prime_nette_annuelle is not null;

-- La prime annuelle existante est conservée comme source TTC historique lorsqu'il
-- n'existe pas encore de champ source TTC. Aucune fiscalité n'est déduite ici.
update public.contrats
set prime_ttc_source_annuelle = prime_annuelle
where prime_ttc_source_annuelle is null
  and prime_annuelle is not null;
