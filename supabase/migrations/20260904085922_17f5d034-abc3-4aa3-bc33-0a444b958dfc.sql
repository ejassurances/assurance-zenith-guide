CREATE OR REPLACE FUNCTION public.trg_recueil_emprunteur_sans_sante()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cles_autorisees text[] := ARRAY[
    'banque','objet_pret','capital','duree_mois','capital_restant_du','mois_restants',
    'taux_pret','assures','tarif_montant_total','tarif_cotisation_mensuelle',
    'tarif_cotisation_annuelle','tarif_nb_annees','tarif_taux_commission',
    'priorite','garanties_souhaitees','rachat_exclusions',
    'assureur','capital_emprunte','contrat_numero','cotisation_mensuelle','date_effet',
    'date_premiere_echeance',
    'fractionnement','garanties_acceptees','notes_contrat','origine','produit','quotite'
  ];
  _cles_assure_autorisees text[] := ARRAY['lien','date_naissance','quotite_pct','csp','fumeur'];
  _cle text;
  _assures jsonb;
  _nettoyes jsonb := '[]'::jsonb;
  _a jsonb;
  _b jsonb;
  _k text;
BEGIN
  IF NEW.type_assurance <> 'emprunteur' OR NEW.recueil_besoins IS NULL THEN
    RETURN NEW;
  END IF;

  FOR _cle IN SELECT jsonb_object_keys(NEW.recueil_besoins) LOOP
    IF NOT (_cle = ANY(_cles_autorisees)) THEN
      RAISE EXCEPTION 'Recueil emprunteur : clé « % » refusée (liste blanche stricte, loi Lemoine — aucune donnée de santé ne peut être collectée).', _cle;
    END IF;
  END LOOP;

  _assures := NEW.recueil_besoins -> 'assures';
  IF _assures IS NOT NULL AND jsonb_typeof(_assures) = 'array' THEN
    FOR _a IN SELECT * FROM jsonb_array_elements(_assures) LOOP
      _b := '{}'::jsonb;
      IF jsonb_typeof(_a) = 'object' THEN
        FOR _k IN SELECT jsonb_object_keys(_a) LOOP
          IF _k = ANY(_cles_assure_autorisees) THEN
            _b := _b || jsonb_build_object(_k, _a -> _k);
          END IF;
        END LOOP;
      END IF;
      _nettoyes := _nettoyes || jsonb_build_array(_b);
    END LOOP;
    NEW.recueil_besoins := jsonb_set(NEW.recueil_besoins, '{assures}', _nettoyes);
  END IF;

  RETURN NEW;
END;
$function$;