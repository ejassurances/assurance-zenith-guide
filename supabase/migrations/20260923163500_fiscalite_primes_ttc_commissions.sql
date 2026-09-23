-- Fiscalité des primes : le TTC du devis/contrat est la donnée source.
-- Les montants HT, taxes et assiettes de commission sont dérivés et conservés.

create table if not exists public.assurance_regles_fiscales (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  libelle text not null,
  taux numeric(8,5),
  contribution_fixe numeric(12,2) not null default 0,
  unite_contribution text not null default 'annuelle',
  actif boolean not null default true,
  date_debut date not null,
  date_fin date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assurance_regles_fiscales is
  'Référentiel fiscal versionné utilisé pour décomposer une prime TTC. Ne remplace pas le barème de commission de la compagnie.';

insert into public.assurance_regles_fiscales
  (code, libelle, taux, contribution_fixe, date_debut, notes)
values
  ('tcas_9_emprunteur', 'TCAS 9 % — assurance décès en garantie du remboursement d’un prêt', 0.09, 0, '2026-01-01', 'Régime utilisé par défaut pour l’assurance emprunteur. La taxe est incluse dans le TTC et n’est pas une assiette de commission si le barème commissionne la prime hors taxes.'),
  ('tsa_13_27_sante', 'TSA 13,27 % — assurance maladie complémentaire éligible', 0.1327, 0, '2026-01-01', 'Applicable sous les conditions prévues par l’article L.862-4 du Code de la sécurité sociale.'),
  ('tsa_20_27_sante', 'TSA 20,27 % — assurance maladie complémentaire non éligible au taux réduit', 0.2027, 0, '2026-01-01', 'Taux majoré de 7 points lorsque les conditions du taux de 13,27 % ne sont pas respectées.'),
  ('tsa_6_27_sante', 'TSA 6,27 % — régime dérogatoire santé', 0.0627, 0, '2026-01-01', 'Régime dérogatoire prévu par l’article L.862-4 II bis.'),
  ('sans_taxe', 'Sans taxe connue', 0, 0, '2026-01-01', 'Utiliser uniquement lorsque l’absence de taxe a été vérifiée.'),
  ('manuel', 'Fiscalité à confirmer', null, 0, '2026-01-01', 'Aucun calcul automatique : les données fiscales doivent être confirmées à partir du devis/avis de cotisation.')
on conflict (code) do update set
  libelle = excluded.libelle,
  taux = excluded.taux,
  contribution_fixe = excluded.contribution_fixe,
  date_debut = excluded.date_debut,
  notes = excluded.notes,
  updated_at = now();

alter table public.dossier_devis
  add column if not exists prime_ttc_annuelle numeric,
  add column if not exists prime_ht_annuelle numeric,
  add column if not exists taxes_annuelles numeric,
  add column if not exists contribution_attentat_annuelle numeric not null default 0,
  add column if not exists assiette_commission_annuelle numeric,
  add column if not exists regime_fiscal text not null default 'manuel',
  add column if not exists fiscalite_detail jsonb,
  add column if not exists fiscalite_calculee_le timestamptz,
  add column if not exists source_prime_ttc text,
  add column if not exists est_retenu boolean not null default false;

alter table public.contrats
  add column if not exists prime_ttc_annuelle numeric,
  add column if not exists prime_ht_annuelle numeric,
  add column if not exists taxes_annuelles numeric,
  add column if not exists contribution_attentat_annuelle numeric not null default 0,
  add column if not exists assiette_commission_annuelle numeric,
  add column if not exists regime_fiscal text not null default 'manuel',
  add column if not exists fiscalite_detail jsonb,
  add column if not exists fiscalite_calculee_le timestamptz,
  add column if not exists source_prime_ttc text,
  add column if not exists devis_source_id uuid references public.dossier_devis(id) on delete set null;

create unique index if not exists dossier_devis_un_seul_retenu
  on public.dossier_devis(dossier_id)
  where est_retenu = true and archive_le is null;

create index if not exists contrats_devis_source_id_idx
  on public.contrats(devis_source_id);

create or replace function public.calculer_fiscalite_prime_ttc(
  p_prime_ttc numeric,
  p_regime text,
  p_contribution_attentat numeric default 0
)
returns jsonb
language plpgsql
immutable
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

-- Les contrats existants utilisent historiquement prime_annuelle comme montant payé par le client.
-- Pour les contrats emprunteur actifs, on conserve cette valeur comme TTC source et on calcule
-- la composante fiscale 9 %. Aucun capital, devis ou prime client n'est écrasé.
update public.contrats
set
  prime_ttc_annuelle = prime_annuelle,
  prime_ht_annuelle = round((prime_annuelle / 1.09)::numeric, 2),
  taxes_annuelles = round((prime_annuelle - prime_annuelle / 1.09)::numeric, 2),
  assiette_commission_annuelle = round((prime_annuelle / 1.09)::numeric, 2),
  regime_fiscal = 'tcas_9_emprunteur',
  fiscalite_detail = public.calculer_fiscalite_prime_ttc(prime_annuelle, 'tcas_9_emprunteur', 0),
  fiscalite_calculee_le = now(),
  source_prime_ttc = 'prime_annuelle_historique'
where is_emprunteur = true
  and prime_annuelle is not null
  and statut in ('actif', 'contrat_actif', 'contrat_valide');

update public.contrats
set prime_nette_annuelle = prime_ht_annuelle
where is_emprunteur = true
  and prime_ht_annuelle is not null
  and (prime_nette_annuelle is null or prime_nette_annuelle = 0)
  and coalesce(commission_cabinet_taux, 0) <> 0;

-- Quand un contrat emprunteur actif possède un devis mensuel qui correspond exactement à sa prime annuelle,
-- on rattache le devis comme source TTC et comme devis retenu. Les cas ambigus restent à contrôler manuellement.
with correspondances as (
  select
    c.id as contrat_id,
    c.dossier_id,
    c.prime_ttc_annuelle,
    dv.id as devis_id,
    row_number() over (partition by c.id order by dv.created_at desc) as rn
  from public.contrats c
  join public.dossier_devis dv on dv.dossier_id = c.dossier_id and dv.archive_le is null
  where c.is_emprunteur = true
    and c.statut in ('actif', 'contrat_actif', 'contrat_valide')
    and c.prime_ttc_annuelle is not null
    and dv.cotisation_mensuelle is not null
    and abs((dv.cotisation_mensuelle * 12) - c.prime_ttc_annuelle) <= 0.02
)
update public.contrats c
set devis_source_id = x.devis_id
from correspondances x
where x.rn = 1 and x.contrat_id = c.id;

update public.dossier_devis dv
set
  est_retenu = true,
  prime_ttc_annuelle = c.prime_ttc_annuelle,
  prime_ht_annuelle = c.prime_ht_annuelle,
  taxes_annuelles = c.taxes_annuelles,
  assiette_commission_annuelle = c.assiette_commission_annuelle,
  regime_fiscal = c.regime_fiscal,
  fiscalite_detail = c.fiscalite_detail,
  fiscalite_calculee_le = c.fiscalite_calculee_le,
  source_prime_ttc = 'contrat_historique_correspondant'
from public.contrats c
where c.devis_source_id = dv.id;

comment on column public.contrats.prime_ttc_annuelle is 'Montant TTC payé par le client, issu du devis/contrat. Donnée source commerciale.';
comment on column public.contrats.prime_ht_annuelle is 'Prime hors taxes reconstituée depuis le TTC selon le régime fiscal.';
comment on column public.contrats.assiette_commission_annuelle is 'Assiette effectivement utilisée pour le calcul de la commission.';
comment on column public.dossier_devis.prime_ttc_annuelle is 'Prime TTC annuelle issue du devis client.';
comment on column public.dossier_devis.est_retenu is 'Devis retenu comme source contractuelle pour le dossier.';
