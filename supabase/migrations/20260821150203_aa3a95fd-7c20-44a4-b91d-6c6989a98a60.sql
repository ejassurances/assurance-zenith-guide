create table if not exists public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  slug text not null unique,
  categorie text not null default 'autre',
  statut text not null default 'actif',
  siret text,
  numero_tva text,
  email text,
  domaines_email text[] not null default '{}',
  telephone text,
  site_web text,
  adresse text,
  contact_nom text,
  compte_charge_defaut text,
  echeance_jours integer,
  moyen_paiement_habituel text,
  contrat_reference text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fournisseurs_categorie_check check (categorie in ('plateforme','logiciel','courtage','comptabilite','marketing','telecom','banque','formation','autre')),
  constraint fournisseurs_statut_check check (statut in ('actif','inactif'))
);

grant select, insert, update, delete on public.fournisseurs to authenticated;
grant all on public.fournisseurs to service_role;

alter table public.fournisseurs enable row level security;

create policy "Staff lit les fournisseurs"
on public.fournisseurs for select to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'mandataire'));

create policy "Staff cree les fournisseurs"
on public.fournisseurs for insert to authenticated
with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'mandataire'));

create policy "Staff modifie les fournisseurs"
on public.fournisseurs for update to authenticated
using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'mandataire'));

create policy "Admin supprime les fournisseurs"
on public.fournisseurs for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

create trigger fournisseurs_updated_at
before update on public.fournisseurs
for each row execute function public.update_updated_at_column();

alter table public.factures_achat
  add column if not exists fournisseur_id uuid references public.fournisseurs(id) on delete set null;

create index if not exists factures_achat_fournisseur_id_idx on public.factures_achat(fournisseur_id);

insert into public.fournisseurs (nom, slug, categorie, domaines_email, notes)
values ('+Simple', 'plus-simple', 'plateforme', array['plus-simple.fr','plussimple.fr','simple.fr'],
        'Plateforme fournisseur du cabinet (déclarations, outils courtage).')
on conflict (slug) do nothing;