CREATE OR REPLACE FUNCTION public.trg_lettre_mission_avance_dossier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ancienne text;
BEGIN
  IF NEW.statut = 'signee' AND (OLD.statut IS DISTINCT FROM 'signee') THEN
    SELECT statut::text INTO _ancienne FROM public.dossiers WHERE id = NEW.dossier_id;
    IF _ancienne IS NOT NULL AND _ancienne <> 'dda_validee' THEN
      UPDATE public.dossiers SET statut = 'dda_validee', updated_at = now() WHERE id = NEW.dossier_id;
      INSERT INTO public.dossier_etapes_historique (dossier_id, ancienne_etape, nouvelle_etape, commentaire, par)
      VALUES (NEW.dossier_id, _ancienne, 'dda_validee', 'Lettre de mission signée par le client', auth.uid());
    END IF;
    IF NEW.client_id IS NOT NULL THEN
      UPDATE public.clients SET dda_statut = 'validee', updated_at = now() WHERE id = NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lettre_mission_avance_dossier ON public.lettres_mission;
CREATE TRIGGER lettre_mission_avance_dossier
AFTER UPDATE ON public.lettres_mission
FOR EACH ROW EXECUTE FUNCTION public.trg_lettre_mission_avance_dossier();

CREATE OR REPLACE FUNCTION public.trg_devoir_conseil_avance_dossier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ancienne text; _cible text; _label text;
BEGIN
  IF NEW.statut = 'signe' AND (OLD.statut IS DISTINCT FROM 'signe') THEN
    _cible := 'devoir_conseil_signe'; _label := 'Devoir de conseil signé par le client';
  ELSIF NEW.statut = 'refuse' AND (OLD.statut IS DISTINCT FROM 'refuse') THEN
    _cible := 'devoir_conseil_refuse'; _label := 'Devoir de conseil refusé par le client';
  ELSE
    RETURN NEW;
  END IF;

  SELECT statut::text INTO _ancienne FROM public.dossiers WHERE id = NEW.dossier_id;
  IF _ancienne IS NOT NULL AND _ancienne <> _cible THEN
    UPDATE public.dossiers SET statut = _cible::dossier_statut, updated_at = now() WHERE id = NEW.dossier_id;
    INSERT INTO public.dossier_etapes_historique (dossier_id, ancienne_etape, nouvelle_etape, commentaire, par)
    VALUES (NEW.dossier_id, _ancienne, _cible, _label, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS devoir_conseil_avance_dossier ON public.devoirs_conseil;
CREATE TRIGGER devoir_conseil_avance_dossier
AFTER UPDATE ON public.devoirs_conseil
FOR EACH ROW EXECUTE FUNCTION public.trg_devoir_conseil_avance_dossier();

REVOKE ALL ON FUNCTION public.trg_lettre_mission_avance_dossier() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_devoir_conseil_avance_dossier() FROM PUBLIC, anon, authenticated;

-- Rattrapage des dossiers bloqués
INSERT INTO public.dossier_etapes_historique (dossier_id, ancienne_etape, nouvelle_etape, commentaire)
SELECT d.id, d.statut::text, 'dda_validee', 'Rattrapage : lettre de mission déjà signée'
FROM public.dossiers d
JOIN public.lettres_mission l ON l.dossier_id = d.id AND l.statut = 'signee'
WHERE d.statut::text IN ('nouveau','en_cours','lettre_mission_envoyee');

UPDATE public.dossiers d SET statut = 'dda_validee', updated_at = now()
WHERE d.statut::text IN ('nouveau','en_cours','lettre_mission_envoyee')
  AND EXISTS (SELECT 1 FROM public.lettres_mission l WHERE l.dossier_id = d.id AND l.statut = 'signee');

UPDATE public.clients c SET dda_statut = 'validee', updated_at = now()
WHERE EXISTS (SELECT 1 FROM public.lettres_mission l WHERE l.client_id = c.id AND l.statut = 'signee')
  AND c.dda_statut <> 'validee';