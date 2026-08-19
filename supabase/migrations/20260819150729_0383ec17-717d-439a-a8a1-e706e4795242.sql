create or replace function public.trg_garde_fou_pipeline_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _ordre text[] := array[
    'nouveau','en_cours','lettre_mission_envoyee','dda_validee','devis_en_cours',
    'devoir_conseil_envoye','devoir_conseil_signe','souscription_envoyee',
    'contrat_valide','contrat_actif'
  ];
  _idx int;
  _idx_lm int := array_position(_ordre, 'lettre_mission_envoyee');
  _idx_dc int := array_position(_ordre, 'devoir_conseil_envoye');
  _lm_ok boolean;
  _dc_ok boolean;
begin
  -- Contournement explicite pour les imports documentaires / reprises d'historique
  if coalesce(current_setting('app.bypass_pipeline_guard', true), '') = 'on' then
    return new;
  end if;

  _idx := array_position(_ordre, new.statut::text);
  if _idx is null then
    return new; -- statuts hors parcours (perdu, cloture, signe, devoir_conseil_refuse)
  end if;

  if tg_op = 'UPDATE' and new.statut = old.statut then
    return new;
  end if;

  if _idx > _idx_lm then
    select exists (
      select 1 from public.lettres_mission l
      where l.dossier_id = new.id
        and l.statut in ('envoyee','signee')
        and l.envoye_le is not null
    ) into _lm_ok;
    if not _lm_ok then
      raise exception 'Étape « % » impossible : aucune lettre de mission réellement envoyée pour ce projet.', new.statut
        using errcode = 'check_violation';
    end if;
  end if;

  if _idx > _idx_dc then
    select exists (
      select 1 from public.devoirs_conseil dc
      where dc.dossier_id = new.id
        and (dc.envoye_le is not null or dc.statut in ('envoye','envoyee','signe','signee'))
    ) into _dc_ok;
    if not _dc_ok then
      raise exception 'Étape « % » impossible : aucun devoir de conseil réellement envoyé pour ce projet.', new.statut
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists garde_fou_pipeline_documents on public.dossiers;
create trigger garde_fou_pipeline_documents
before insert or update of statut on public.dossiers
for each row execute function public.trg_garde_fou_pipeline_documents();