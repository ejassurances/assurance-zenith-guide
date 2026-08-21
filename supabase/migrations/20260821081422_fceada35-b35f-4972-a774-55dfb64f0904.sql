-- Le statut du dossier doit refléter la réalité du portefeuille : un contrat
-- actif (souvent importé ou reconstitué) fait passer le dossier à « contrat
-- actif » même si les pièces DDA manquent encore. Le manque documentaire reste
-- signalé dans l'historique d'étapes et par la tâche de régularisation.
CREATE OR REPLACE FUNCTION public.trg_dossier_suit_contrat_actif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ancien text;
  _lm_ok boolean;
  _dc_ok boolean;
  _commentaire text;
BEGIN
  IF NEW.dossier_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.statut NOT IN ('actif','contrat_actif') THEN RETURN NEW; END IF;

  SELECT statut INTO _ancien FROM public.dossiers WHERE id = NEW.dossier_id;
  IF _ancien IS NULL OR _ancien IN ('contrat_actif','cloture','perdu') THEN RETURN NEW; END IF;

  SELECT EXISTS (SELECT 1 FROM public.lettres_mission l
                  WHERE l.dossier_id = NEW.dossier_id AND l.statut IN ('envoyee','signee') AND l.envoye_le IS NOT NULL)
    INTO _lm_ok;
  SELECT EXISTS (SELECT 1 FROM public.devoirs_conseil dc
                  WHERE dc.dossier_id = NEW.dossier_id
                    AND (dc.envoye_le IS NOT NULL OR dc.statut IN ('envoye','envoyee','signe','signee')))
    INTO _dc_ok;

  _commentaire := 'Contrat actif au portefeuille (synchronisation automatique)';
  IF NOT (_lm_ok AND _dc_ok) THEN
    _commentaire := _commentaire || ' — pièces DDA à régulariser : '
      || CASE WHEN NOT _lm_ok THEN 'lettre de mission' ELSE '' END
      || CASE WHEN NOT _lm_ok AND NOT _dc_ok THEN ' et ' ELSE '' END
      || CASE WHEN NOT _dc_ok THEN 'devoir de conseil' ELSE '' END;
  END IF;

  PERFORM set_config('app.bypass_pipeline_guard', 'on', true);
  UPDATE public.dossiers SET statut = 'contrat_actif', updated_at = now() WHERE id = NEW.dossier_id;
  PERFORM set_config('app.bypass_pipeline_guard', 'off', true);

  INSERT INTO public.dossier_etapes_historique (dossier_id, ancienne_etape, nouvelle_etape, commentaire, par)
  VALUES (NEW.dossier_id, _ancien, 'contrat_actif', _commentaire, auth.uid());
  RETURN NEW;
END;
$$;