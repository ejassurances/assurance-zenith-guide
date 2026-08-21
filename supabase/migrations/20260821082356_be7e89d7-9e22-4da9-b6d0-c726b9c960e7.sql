-- 1. Autoriser une règle de commissionnement au bénéfice du cabinet lui-même
ALTER TABLE public.commission_regles DROP CONSTRAINT IF EXISTS commission_regles_portee_check;
ALTER TABLE public.commission_regles ADD CONSTRAINT commission_regles_portee_check
  CHECK (portee = ANY (ARRAY['mandataire'::text, 'prescripteur'::text, 'cabinet'::text]));

-- 2. Recherche du taux cabinet (le plus spécifique d'abord)
CREATE OR REPLACE FUNCTION public.trouver_taux_cabinet(_compagnie_id uuid, _produit_id uuid, _famille_id uuid, _date date)
RETURNS TABLE(taux numeric, assiette text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.taux, r.assiette
  FROM public.commission_regles r
  WHERE r.portee = 'cabinet'
    AND r.beneficiaire_id IS NULL
    AND r.date_effet <= _date
    AND (r.date_fin IS NULL OR r.date_fin >= _date)
    AND (r.produit_id IS NULL OR r.produit_id = _produit_id)
    AND (r.famille_id IS NULL OR r.famille_id = _famille_id)
    AND (r.compagnie_id IS NULL OR r.compagnie_id = _compagnie_id)
  ORDER BY
    (r.produit_id IS NOT NULL)::int DESC,
    (r.famille_id IS NOT NULL)::int DESC,
    (r.compagnie_id IS NOT NULL)::int DESC,
    r.date_effet DESC
  LIMIT 1;
$function$;

-- 3. Prévisions : priorité au taux réel du barème compagnie, et gestion des
--    contrats sans durée connue (santé, prévoyance) sur un horizon glissant.
CREATE OR REPLACE FUNCTION public.recalculer_prevision_contrat(_contrat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.contrats%ROWTYPE;
  _prev public.commission_previsions%ROWTYPE;
  _branche text;
  _periodicite text;
  _cotisation numeric;
  _reel numeric;
  _nb_periodes integer;
  _dernier_mois date;
  _estime numeric;
  _ecoules integer;
  _restants integer;
  _offset integer := 0;
  _echeances integer;
  _famille_id uuid;
  _taux_cab numeric;
  _assiette_cab text;
BEGIN
  SELECT * INTO c FROM public.contrats WHERE id = _contrat_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF c.statut NOT IN ('actif','signe','contrat_actif','contrat_valide') THEN RETURN; END IF;

  _branche := public.branche_contrat(_contrat_id);
  _periodicite := CASE WHEN lower(COALESCE(c.fractionnement,'')) LIKE 'annuel%' THEN 'annuelle' ELSE 'mensuelle' END;

  _cotisation := CASE
    WHEN c.prime_annuelle IS NULL THEN NULL
    WHEN _periodicite = 'annuelle' THEN c.prime_annuelle
    ELSE c.prime_annuelle / 12
  END;

  SELECT SUM(montant),
         COUNT(DISTINCT CASE WHEN _periodicite = 'annuelle'
                             THEN date_trunc('year', date_versement)
                             ELSE date_trunc('month', date_versement) END),
         MAX(date_trunc('month', date_versement))::date
    INTO _reel, _nb_periodes, _dernier_mois
    FROM public.commissions
   WHERE contrat_id = _contrat_id AND statut = 'versee' AND date_versement IS NOT NULL;

  IF _nb_periodes IS NOT NULL AND _nb_periodes > 0 THEN
    _reel := ROUND(_reel / _nb_periodes, 2);
  ELSE
    _reel := NULL;
  END IF;

  IF c.produit_id IS NOT NULL THEN
    SELECT famille_id INTO _famille_id FROM public.produits WHERE id = c.produit_id;
  END IF;

  SELECT tr.taux, tr.assiette INTO _taux_cab, _assiette_cab
    FROM public.trouver_taux_cabinet(c.compagnie_id, c.produit_id, _famille_id,
                                    COALESCE(c.date_effet, CURRENT_DATE)) tr;

  IF _taux_cab IS NOT NULL AND _cotisation IS NOT NULL THEN
    -- Barème négocié avec la compagnie : taux appliqué à la cotisation de l'échéance.
    _estime := ROUND(_cotisation * _taux_cab, 2);
  ELSIF _branche = 'emprunteur' AND c.economie_realisee IS NOT NULL AND c.economie_realisee > 0 THEN
    _estime := ROUND(c.economie_realisee * 0.05 / GREATEST(1, COALESCE(c.duree_mois, 12)), 2);
  ELSIF _cotisation IS NOT NULL THEN
    _estime := ROUND(_cotisation * 0.05, 2);
  ELSE
    _estime := NULL;
  END IF;

  IF _reel IS NULL AND _estime IS NULL THEN RETURN; END IF;

  IF c.date_effet IS NOT NULL THEN
    _ecoules := GREATEST(0, (EXTRACT(YEAR FROM age(CURRENT_DATE, c.date_effet)) * 12
                + EXTRACT(MONTH FROM age(CURRENT_DATE, c.date_effet)))::integer);
    _offset := GREATEST(0, (date_part('year', c.date_effet) - date_part('year', CURRENT_DATE)) * 12
               + (date_part('month', c.date_effet) - date_part('month', CURRENT_DATE)))::integer;
  ELSE
    _ecoules := 0;
  END IF;

  _restants := CASE WHEN c.duree_mois IS NULL THEN NULL
                    ELSE GREATEST(0, c.duree_mois - _ecoules) END;

  IF _dernier_mois IS NOT NULL THEN
    _offset := GREATEST(_offset,
      GREATEST(0, ((date_part('year', _dernier_mois) - date_part('year', CURRENT_DATE)) * 12
                  + (date_part('month', _dernier_mois) - date_part('month', CURRENT_DATE)) + 1))::integer);
  END IF;

  -- Contrat sans terme connu (santé, prévoyance...) : commission récurrente,
  -- valorisée sur un horizon glissant de 12 mois.
  _echeances := CASE WHEN _restants IS NULL THEN CASE WHEN _periodicite = 'annuelle' THEN 1 ELSE 12 END
                     WHEN _periodicite = 'annuelle' THEN CEIL(_restants::numeric / 12)::integer
                     ELSE _restants END;

  SELECT * INTO _prev FROM public.commission_previsions
   WHERE contrat_id = _contrat_id
      OR (c.dossier_id IS NOT NULL AND dossier_id = c.dossier_id)
   ORDER BY (contrat_id = _contrat_id) DESC
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.commission_previsions
       SET contrat_id = _contrat_id,
           compagnie_id = COALESCE(compagnie_id, c.compagnie_id),
           branche = COALESCE(branche, _branche),
           periodicite = _periodicite,
           montant_mensuel_reel = COALESCE(_reel, montant_mensuel_reel),
           montant_mensuel_estime = CASE WHEN confirme_le IS NOT NULL THEN montant_mensuel_estime
                                         ELSE COALESCE(_estime, montant_mensuel_estime) END,
           mois_restants_initial = COALESCE(mois_restants_initial, _restants),
           mois_restants_actuels = _restants,
           mois_debut_offset = _offset,
           montant_previsionnel_total = ROUND(COALESCE(_reel, CASE WHEN confirme_le IS NOT NULL THEN montant_mensuel_estime ELSE _estime END, 0) * _echeances, 2),
           statut = CASE WHEN _reel IS NOT NULL THEN 'actualise' ELSE statut END,
           updated_at = now()
     WHERE id = _prev.id;
  ELSE
    INSERT INTO public.commission_previsions (
      dossier_id, contrat_id, branche, compagnie_id, periodicite,
      montant_mensuel_estime, montant_mensuel_reel,
      mois_restants_initial, mois_restants_actuels, mois_debut_offset,
      montant_previsionnel_total, date_estimation, statut
    ) VALUES (
      c.dossier_id, _contrat_id, _branche, c.compagnie_id, _periodicite,
      _estime, _reel,
      _restants, _restants, _offset,
      ROUND(COALESCE(_reel, _estime, 0) * _echeances, 2),
      CURRENT_DATE,
      CASE WHEN _reel IS NOT NULL THEN 'actualise' ELSE 'estimee' END
    );
  END IF;
END;
$function$;