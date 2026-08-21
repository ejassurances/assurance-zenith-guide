insert into public.fournisseurs (nom, slug, categorie, domaines_email, notes)
values
 ('IONOS SARL', 'ionos', 'telecom', array['ionos.fr','ionos.com'], 'Hébergement, noms de domaine et messagerie du cabinet.'),
 ('Lovable Labs Incorporated', 'lovable', 'logiciel', array['lovable.dev','lovable.app'], 'Plateforme de développement du CRM et du site.')
on conflict (slug) do nothing;

update public.factures_achat fa
set fournisseur_id = f.id
from public.fournisseurs f
where fa.fournisseur_id is null
  and lower(regexp_replace(fa.fournisseur, '[^a-zA-Z0-9]', '', 'g')) like '%' || lower(regexp_replace(split_part(f.nom, ' ', 1), '[^a-zA-Z0-9]', '', 'g')) || '%';