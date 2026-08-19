-- Suppression des 3 fiches créées à tort depuis des adresses internes / de notification
with faux as (
  select id from public.clients
  where id in ('be5984bf-b35f-4448-b164-42f38aa84430','8316cf58-067e-46dc-b3d8-8f39d5a5f197','13a8d344-5e74-4810-ba2e-ee010a5af740')
)
update public.crm_emails e
   set client_id = null,
       notes = coalesce(e.notes,'') || ' | Fiche client erronée supprimée (expéditeur interne / notification)',
       triage_ia = jsonb_build_object('agent','interne','motif','expediteur interne ou notification')
 where e.client_id in (select id from faux);

delete from public.taches where client_id in ('be5984bf-b35f-4448-b164-42f38aa84430','8316cf58-067e-46dc-b3d8-8f39d5a5f197','13a8d344-5e74-4810-ba2e-ee010a5af740');
delete from public.activites where client_id in ('be5984bf-b35f-4448-b164-42f38aa84430','8316cf58-067e-46dc-b3d8-8f39d5a5f197','13a8d344-5e74-4810-ba2e-ee010a5af740');
delete from public.client_risque_lcbft where client_id in ('be5984bf-b35f-4448-b164-42f38aa84430','8316cf58-067e-46dc-b3d8-8f39d5a5f197','13a8d344-5e74-4810-ba2e-ee010a5af740');
delete from public.client_kyc_documents where client_id in ('be5984bf-b35f-4448-b164-42f38aa84430','8316cf58-067e-46dc-b3d8-8f39d5a5f197','13a8d344-5e74-4810-ba2e-ee010a5af740');
delete from public.client_der_envois where client_id in ('be5984bf-b35f-4448-b164-42f38aa84430','8316cf58-067e-46dc-b3d8-8f39d5a5f197','13a8d344-5e74-4810-ba2e-ee010a5af740');
delete from public.clients where id in ('be5984bf-b35f-4448-b164-42f38aa84430','8316cf58-067e-46dc-b3d8-8f39d5a5f197','13a8d344-5e74-4810-ba2e-ee010a5af740');