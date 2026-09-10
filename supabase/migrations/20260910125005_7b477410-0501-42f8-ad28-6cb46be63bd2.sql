ALTER TABLE public.dossier_devis
  ADD COLUMN IF NOT EXISTS taux_commission numeric;

COMMENT ON COLUMN public.dossier_devis.taux_commission IS
  'Taux de commission cabinet (%) applicable a ce devis : repris sur le contrat et la commission previsionnelle.';

-- Le taux negocie porte sur le contrat prime sur le bareme generique lorsqu'il
-- est renseigne (devis retenu).
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

  IF c.commission_cabinet_taux IS NOT NULL AND c.commission_cabinet_taux > 0 THEN
    _taux_cab := CASE WHEN c.commission_cabinet_taux > 1 THEN c.commission_cabinet_taux / 100
                      ELSE c.commission_cabinet_taux END;
  ELSE
    SELECT tr.taux, tr.assiette INTO _taux_cab, _assiette_cab
      FROM public.trouver_taux_cabinet(c.compagnie_id, c.produit_id, _famille_id,
                                      COALESCE(c.date_effet, CURRENT_DATE)) tr;
  END IF;

  IF _taux_cab IS NOT NULL AND _cotisation IS NOT NULL THEN
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
           montant_mensuel_estime = COALESCE(_estime, montant_mensuel_estime),
           nb_echeances = _echeances,
           mois_offset = _offset,
           updated_at = now()
     WHERE id = _prev.id;
  ELSE
    INSERT INTO public.commission_previsions
      (contrat_id, dossier_id, compagnie_id, branche, periodicite,
       montant_mensuel_reel, montant_mensuel_estime, nb_echeances, mois_offset)
    VALUES
      (_contrat_id, c.dossier_id, c.compagnie_id, _branche, _periodicite,
       _reel, _estime, _echeances, _offset);
  END IF;
END;
$function$;