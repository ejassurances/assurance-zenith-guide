-- Prime nette distincte de la prime totale et utilisation comme assiette de commissionnement.
-- Les contrats existants restent NULL sur prime_nette_annuelle tant que la donnée
-- n'est pas renseignée explicitement.

ALTER TABLE public.contrats
  ADD COLUMN IF NOT EXISTS prime_nette_annuelle numeric;

-- Recalcul des échéances : prime_periode reste la prime totale du contrat,
-- mais la commission cabinet et les rétrocessions assises sur la prime utilisent
-- exclusivement prime_nette_annuelle.
CREATE OR REPLACE FUNCTION public.recalculer_echeances_contrat(_contrat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c            public.contrats%ROWTYPE;
  produit_row  public.produits%ROWTYPE;
  annees       integer;
  y            integer;
  d_start      date;
  d_end        date;
  capital      numeric(14,2);
  crd_debut   numeric(14,2);
  crd_fin     numeric(14,2);
  base         numeric(14,2);
  prime        numeric(14,2);
  base_commission numeric(14,2);
  comm_cab     numeric(14,2);
  taux_m       numeric;
  assiette_m   text;
  taux_p       numeric;
  assiette_p   text;
  comm_m       numeric(14,2);
  comm_p       numeric(14,2);
  base_partenaire numeric(14,2);
  mensualite   numeric(14,2);
  i_mens       numeric;
  n_mens       integer;
  tx_ass       numeric;
  tx_pret      numeric;
  _nb_existantes integer;
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'EXECUTE', 'function:recalculer_echeances_contrat', _contrat_id::text, NULL);

  SELECT * INTO c FROM public.contrats WHERE id = _contrat_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF c.statut IN ('resilie', 'annule', 'cloture') THEN
    SELECT COUNT(*) INTO _nb_existantes FROM public.contrat_echeances WHERE contrat_id = _contrat_id;
    IF _nb_existantes > 0 THEN RETURN; END IF;
  END IF;

  DELETE FROM public.contrat_echeances WHERE contrat_id = _contrat_id;

  IF c.date_effet IS NULL THEN RETURN; END IF;

  tx_ass := COALESCE(c.taux_assurance_annuel, 0);
  IF tx_ass > 0.05 THEN tx_ass := tx_ass / 100; END IF;
  tx_pret := COALESCE(c.taux_pret, 0);
  IF tx_pret > 0.2 THEN tx_pret := tx_pret / 100; END IF;

  IF c.duree_mois IS NOT NULL THEN
    annees := GREATEST(1, CEIL(c.duree_mois::numeric / 12));
  ELSE
    annees := 1;
  END IF;

  IF c.produit_id IS NOT NULL THEN
    SELECT * INTO produit_row FROM public.produits WHERE id = c.produit_id;
  END IF;

  capital := COALESCE(c.capital_initial, 0);
  n_mens := COALESCE(c.duree_mois, annees * 12);
  IF c.is_emprunteur AND capital > 0 AND n_mens > 0 THEN
    IF tx_pret > 0 THEN
      i_mens := tx_pret / 12;
      mensualite := capital * i_mens / (1 - power(1 + i_mens, -n_mens));
    ELSE
      mensualite := capital / n_mens;
    END IF;
  ELSE
    mensualite := 0;
  END IF;

  crd_debut := capital;

  FOR y IN 1..annees LOOP
    d_start := (c.date_effet + ((y - 1) || ' years')::interval)::date;
    d_end   := (c.date_effet + (y || ' years')::interval - INTERVAL '1 day')::date;

    IF c.is_emprunteur AND capital > 0 AND n_mens > 0 THEN
      IF tx_pret > 0 THEN
        crd_fin := crd_debut * power(1 + i_mens, 12)
                 - mensualite * ((power(1 + i_mens, 12) - 1) / i_mens);
        IF crd_fin < 0 THEN crd_fin := 0; END IF;
      ELSE
        crd_fin := GREATEST(0, crd_debut - mensualite * 12);
      END IF;
    ELSE
      crd_fin := crd_debut;
    END IF;

    IF c.is_emprunteur AND capital > 0 THEN
      IF c.assiette = 'capital_restant_du' THEN
        base := crd_debut;
      ELSE
        base := capital;
      END IF;
      prime := base * tx_ass * (COALESCE(c.quotite, 100) / 100.0);
      IF prime = 0 THEN prime := COALESCE(c.prime_annuelle, 0); END IF;
    ELSE
      IF c.mode_commissionnement = 'precompte' AND y > 1 THEN
        prime := 0;
      ELSE
        prime := COALESCE(c.prime_annuelle, 0);
      END IF;
    END IF;

    -- La commission sur prime est calculée uniquement sur la prime nette.
    -- Si la prime nette n'est pas renseignée, aucune commission sur prime
    -- n'est inventée à partir de la prime totale.
    IF c.mode_commissionnement = 'precompte' AND y > 1 THEN
      base_commission := 0;
    ELSE
      base_commission := COALESCE(c.prime_nette_annuelle, 0);
    END IF;
    comm_cab := base_commission * COALESCE(c.commission_cabinet_taux, 0);
    comm_m := 0;
    comm_p := 0;

    IF c.mandataire_id IS NOT NULL THEN
      SELECT tr.taux, tr.assiette INTO taux_m, assiette_m
      FROM public.trouver_taux_regle(
        c.mandataire_id, 'mandataire', c.compagnie_id, c.produit_id,
        produit_row.famille_id, d_start
      ) tr;
      IF taux_m IS NOT NULL THEN
        base_partenaire := CASE WHEN assiette_m = 'prime_ht' THEN base_commission ELSE comm_cab END;
        comm_m := base_partenaire * taux_m;
      END IF;
    END IF;

    IF c.prescripteur_id IS NOT NULL THEN
      SELECT tr.taux, tr.assiette INTO taux_p, assiette_p
      FROM public.trouver_taux_regle(
        c.prescripteur_id, 'prescripteur', c.compagnie_id, c.produit_id,
        produit_row.famille_id, d_start
      ) tr;
      IF taux_p IS NOT NULL THEN
        base_partenaire := CASE WHEN assiette_p = 'prime_ht' THEN base_commission ELSE comm_cab END;
        comm_p := base_partenaire * taux_p;
      END IF;
    END IF;

    INSERT INTO public.contrat_echeances (
      contrat_id, annee, date_debut_periode, date_fin_periode,
      capital_restant_du_debut, prime_periode,
      commission_cabinet_periode, commission_mandataire_periode, commission_prescripteur_periode,
      mandataire_id, prescripteur_id, statut
    ) VALUES (
      _contrat_id, y, d_start, d_end,
      crd_debut, ROUND(prime, 2),
      ROUND(comm_cab, 2), ROUND(comm_m, 2), ROUND(comm_p, 2),
      c.mandataire_id, c.prescripteur_id, 'previsionnel'
    );

    crd_debut := crd_fin;
  END LOOP;
END;
$function$;

-- Prévision de commission : toute assiette prime utilise la prime nette.
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
    WHEN c.prime_nette_annuelle IS NULL THEN NULL
    WHEN _periodicite = 'annuelle' THEN c.prime_nette_annuelle
    ELSE c.prime_nette_annuelle / 12
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
           mois_restants_actuels = _echeances,
           mois_restants_initial = COALESCE(mois_restants_initial, _echeances),
           montant_previsionnel_total = CASE
             WHEN COALESCE(_reel, _estime) IS NOT NULL
               THEN ROUND(COALESCE(_reel, _estime) * GREATEST(_echeances, 0), 2)
             ELSE montant_previsionnel_total END,
           mois_debut_offset = _offset,
           updated_at = now()
     WHERE id = _prev.id;
  ELSE
    INSERT INTO public.commission_previsions
      (contrat_id, dossier_id, compagnie_id, branche, periodicite,
       montant_mensuel_reel, montant_mensuel_estime, mois_restants_actuels,
       mois_restants_initial, montant_previsionnel_total, mois_debut_offset,
       date_estimation, statut)
    VALUES
      (_contrat_id, c.dossier_id, c.compagnie_id, _branche, _periodicite,
       _reel, _estime, _echeances, _echeances,
       CASE WHEN COALESCE(_reel, _estime) IS NOT NULL
            THEN ROUND(COALESCE(_reel, _estime) * GREATEST(_echeances, 0), 2) END,
       _offset, CURRENT_DATE, 'estime');
  END IF;
END;
$function$;

-- Correction tracée d'un contrat verrouillé : la prime nette fait partie des
-- champs contractuels autorisés et de l'audit avant/après.
CREATE OR REPLACE FUNCTION public.corriger_contrat_actif(_contrat_id uuid, _champs jsonb, _motif text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _avant jsonb;
  _apres jsonb;
  _autorises text[] := ARRAY['numero','assureur','produit','compagnie_id','produit_id','date_effet',
    'date_echeance','duree_mois','prime_annuelle','prime_nette_annuelle','fractionnement','is_emprunteur','capital_initial',
    'taux_pret','taux_assurance_annuel','quotite','assiette','statut','mode_commissionnement',
    'commission_cabinet_taux','notes','mandataire_id','prescripteur_id'];
  _cle text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Correction réservée aux administrateurs';
  END IF;
  IF _motif IS NULL OR length(btrim(_motif)) < 5 THEN
    RAISE EXCEPTION 'Motif de correction obligatoire';
  END IF;

  FOR _cle IN SELECT jsonb_object_keys(_champs) LOOP
    IF NOT (_cle = ANY(_autorises)) THEN
      RAISE EXCEPTION 'Champ non corrigeable : %', _cle;
    END IF;
  END LOOP;

  SELECT to_jsonb(c) INTO _avant FROM public.contrats c WHERE c.id = _contrat_id;
  IF _avant IS NULL THEN RAISE EXCEPTION 'Contrat introuvable'; END IF;

  PERFORM set_config('app.correction_contrat', 'on', true);
  UPDATE public.contrats c
     SET numero = COALESCE(_champs->>'numero', c.numero),
         assureur = COALESCE(_champs->>'assureur', c.assureur),
         produit = COALESCE(_champs->>'produit', c.produit),
         compagnie_id = COALESCE((_champs->>'compagnie_id')::uuid, c.compagnie_id),
         produit_id = COALESCE((_champs->>'produit_id')::uuid, c.produit_id),
         date_effet = COALESCE((_champs->>'date_effet')::date, c.date_effet),
         date_echeance = COALESCE((_champs->>'date_echeance')::date, c.date_echeance),
         duree_mois = COALESCE((_champs->>'duree_mois')::integer, c.duree_mois),
         prime_annuelle = COALESCE((_champs->>'prime_annuelle')::numeric, c.prime_annuelle),
         prime_nette_annuelle = COALESCE((_champs->>'prime_nette_annuelle')::numeric, c.prime_nette_annuelle),
         fractionnement = COALESCE(_champs->>'fractionnement', c.fractionnement),
         is_emprunteur = COALESCE((_champs->>'is_emprunteur')::boolean, c.is_emprunteur),
         capital_initial = COALESCE((_champs->>'capital_initial')::numeric, c.capital_initial),
         taux_pret = COALESCE((_champs->>'taux_pret')::numeric, c.taux_pret),
         taux_assurance_annuel = COALESCE((_champs->>'taux_assurance_annuel')::numeric, c.taux_assurance_annuel),
         quotite = COALESCE((_champs->>'quotite')::numeric, c.quotite),
         assiette = COALESCE(_champs->>'assiette', c.assiette),
         statut = COALESCE(_champs->>'statut', c.statut),
         mode_commissionnement = COALESCE(_champs->>'mode_commissionnement', c.mode_commissionnement),
         commission_cabinet_taux = COALESCE((_champs->>'commission_cabinet_taux')::numeric, c.commission_cabinet_taux),
         notes = COALESCE(_champs->>'notes', c.notes),
         mandataire_id = COALESCE((_champs->>'mandataire_id')::uuid, c.mandataire_id),
         prescripteur_id = COALESCE((_champs->>'prescripteur_id')::uuid, c.prescripteur_id),
         updated_at = now()
   WHERE c.id = _contrat_id;
  PERFORM set_config('app.correction_contrat', 'off', true);

  SELECT to_jsonb(c) INTO _apres FROM public.contrats c WHERE c.id = _contrat_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, old_data, new_data, metadata)
  VALUES (auth.uid(), 'CORRECTION_CONTRAT_VERROUILLE', 'contrat', _contrat_id::text, _avant, _apres,
          jsonb_build_object('motif', _motif, 'champs', _champs));

  PERFORM public.recalculer_echeances_contrat(_contrat_id);
END;
$function$;

-- Le verrou doit aussi couvrir la prime nette.
CREATE OR REPLACE FUNCTION public.trg_verrouiller_contrat_actif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.statut <> 'actif' THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('app.correction_contrat', true), '') = 'on' THEN RETURN NEW; END IF;

  IF (NEW.numero, NEW.assureur, NEW.produit, NEW.compagnie_id, NEW.produit_id,
      NEW.date_effet, NEW.date_echeance, NEW.duree_mois, NEW.prime_annuelle,
      NEW.prime_nette_annuelle, NEW.fractionnement, NEW.is_emprunteur, NEW.capital_initial, NEW.taux_pret,
      NEW.taux_assurance_annuel, NEW.quotite, NEW.assiette, NEW.statut,
      NEW.mode_commissionnement, NEW.commission_cabinet_taux)
     IS DISTINCT FROM
     (OLD.numero, OLD.assureur, OLD.produit, OLD.compagnie_id, OLD.produit_id,
      OLD.date_effet, OLD.date_echeance, OLD.duree_mois, OLD.prime_annuelle,
      OLD.prime_nette_annuelle, OLD.fractionnement, OLD.is_emprunteur, OLD.capital_initial, OLD.taux_pret,
      OLD.taux_assurance_annuel, OLD.quotite, OLD.assiette, OLD.statut,
      OLD.mode_commissionnement, OLD.commission_cabinet_taux)
  THEN
    RAISE EXCEPTION 'Contrat validé par la compagnie : les données contractuelles sont verrouillées. Utilisez la correction tracée (motif obligatoire).';
  END IF;
  RETURN NEW;
END;
$function$;

-- Les changements de prime nette doivent déclencher les deux recalculs.
DROP TRIGGER IF EXISTS trg_contrats_echeances ON public.contrats;
CREATE TRIGGER trg_contrats_echeances
AFTER INSERT OR UPDATE OF date_effet, duree_mois, prime_annuelle, prime_nette_annuelle,
  capital_initial, taux_pret, taux_assurance_annuel, quotite, assiette,
  mode_commissionnement, commission_cabinet_taux, mandataire_id, prescripteur_id,
  compagnie_id, produit_id, is_emprunteur
ON public.contrats
FOR EACH ROW EXECUTE FUNCTION trg_recalculer_echeances();

DROP TRIGGER IF EXISTS trg_contrats_prevision_commission ON public.contrats;
CREATE TRIGGER trg_contrats_prevision_commission
AFTER INSERT OR UPDATE OF statut, prime_annuelle, prime_nette_annuelle, duree_mois,
  date_effet, fractionnement, economie_realisee, compagnie_id, dossier_id
ON public.contrats
FOR EACH ROW EXECUTE FUNCTION trg_contrat_prevision_commission();
