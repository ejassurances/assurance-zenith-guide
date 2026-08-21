-- 1) Prévisions de commission : une ligne par contrat, calculable rétroactivement.
ALTER TABLE public.commission_previsions ALTER COLUMN dossier_id DROP NOT NULL;
ALTER TABLE public.commission_previsions
  ADD COLUMN IF NOT EXISTS mois_debut_offset integer NOT NULL DEFAULT 0;
ALTER TABLE public.commission_previsions DROP CONSTRAINT IF EXISTS commission_previsions_statut_check;
ALTER TABLE public.commission_previsions
  ADD CONSTRAINT commission_previsions_statut_check CHECK (statut IN ('estime','estimee','actualise'));
CREATE UNIQUE INDEX IF NOT EXISTS commission_previsions_contrat_uniq
  ON public.commission_previsions (contrat_id) WHERE contrat_id IS NOT NULL;

-- Calcul / actualisation de la prévision d'un contrat, applicable à tout moment.
CREATE OR REPLACE FUNCTION public.recalculer_prevision_contrat(_contrat_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  SELECT * INTO c FROM public.contrats WHERE id = _contrat_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF c.statut NOT IN ('actif','signe','contrat_actif','contrat_valide') THEN RETURN; END IF;

  _branche := public.branche_contrat(_contrat_id);
  _periodicite := CASE WHEN lower(COALESCE(c.fractionnement,'')) LIKE 'annuel%' THEN 'annuelle' ELSE 'mensuelle' END;

  -- Cotisation d'une échéance de commissionnement.
  _cotisation := CASE
    WHEN c.prime_annuelle IS NULL THEN NULL
    WHEN _periodicite = 'annuelle' THEN c.prime_annuelle
    ELSE c.prime_annuelle / 12
  END;

  -- Montant réel observé : moyenne des commissions déjà versées.
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

  -- Estimation du barème : emprunteur = 5 % de l'économie réalisée si connue,
  -- sinon 5 % de la cotisation de l'échéance (défaut cabinet).
  IF _branche = 'emprunteur' AND c.economie_realisee IS NOT NULL AND c.economie_realisee > 0 THEN
    _estime := ROUND(c.economie_realisee * 0.05 / GREATEST(1, COALESCE(c.duree_mois, 12)), 2);
  ELSIF _cotisation IS NOT NULL THEN
    _estime := ROUND(_cotisation * 0.05, 2);
  ELSE
    _estime := NULL;
  END IF;

  IF _reel IS NULL AND _estime IS NULL THEN RETURN; END IF;

  -- Mois restants et premier mois encore à encaisser.
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

  _echeances := CASE WHEN _restants IS NULL THEN NULL
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
           -- une estimation confirmée manuellement n'est jamais écrasée
           montant_mensuel_estime = CASE WHEN confirme_le IS NOT NULL THEN montant_mensuel_estime
                                         ELSE COALESCE(_estime, montant_mensuel_estime) END,
           mois_restants_initial = COALESCE(mois_restants_initial, _restants),
           mois_restants_actuels = _restants,
           mois_debut_offset = _offset,
           montant_previsionnel_total = CASE
             WHEN _echeances IS NULL THEN montant_previsionnel_total
             ELSE ROUND(COALESCE(_reel, CASE WHEN confirme_le IS NOT NULL THEN montant_mensuel_estime ELSE _estime END, 0) * _echeances, 2)
           END,
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
      CASE WHEN _echeances IS NULL THEN NULL ELSE ROUND(COALESCE(_reel, _estime, 0) * _echeances, 2) END,
      CURRENT_DATE,
      CASE WHEN _reel IS NOT NULL THEN 'actualise' ELSE 'estimee' END
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculer_prevision_contrat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculer_prevision_contrat(uuid) TO authenticated, service_role;

-- Le contrat lui-même déclenche le calcul (création, activation, correction).
CREATE OR REPLACE FUNCTION public.trg_contrat_prevision_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculer_prevision_contrat(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrats_prevision_commission ON public.contrats;
CREATE TRIGGER trg_contrats_prevision_commission
AFTER INSERT OR UPDATE OF statut, prime_annuelle, duree_mois, date_effet, fractionnement, economie_realisee, compagnie_id, dossier_id
ON public.contrats
FOR EACH ROW EXECUTE FUNCTION public.trg_contrat_prevision_commission();

-- Un versement crée la prévision si elle manque (contrats importés).
CREATE OR REPLACE FUNCTION public.trg_actualiser_prevision_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.contrat_id IS NOT NULL THEN
    PERFORM public.recalculer_prevision_contrat(NEW.contrat_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_actualiser_prevision ON public.commissions;
CREATE TRIGGER trg_commissions_actualiser_prevision
AFTER INSERT OR UPDATE OF montant, statut, date_versement ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.trg_actualiser_prevision_commission();

-- 2) Verrou d'un contrat validé par la compagnie.
CREATE OR REPLACE FUNCTION public.trg_verrouiller_contrat_actif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.statut <> 'actif' THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('app.correction_contrat', true), '') = 'on' THEN RETURN NEW; END IF;

  IF (NEW.numero, NEW.assureur, NEW.produit, NEW.compagnie_id, NEW.produit_id,
      NEW.date_effet, NEW.date_echeance, NEW.duree_mois, NEW.prime_annuelle,
      NEW.fractionnement, NEW.is_emprunteur, NEW.capital_initial, NEW.taux_pret,
      NEW.taux_assurance_annuel, NEW.quotite, NEW.assiette, NEW.statut,
      NEW.mode_commissionnement, NEW.commission_cabinet_taux)
     IS DISTINCT FROM
     (OLD.numero, OLD.assureur, OLD.produit, OLD.compagnie_id, OLD.produit_id,
      OLD.date_effet, OLD.date_echeance, OLD.duree_mois, OLD.prime_annuelle,
      OLD.fractionnement, OLD.is_emprunteur, OLD.capital_initial, OLD.taux_pret,
      OLD.taux_assurance_annuel, OLD.quotite, OLD.assiette, OLD.statut,
      OLD.mode_commissionnement, OLD.commission_cabinet_taux)
  THEN
    RAISE EXCEPTION 'Contrat validé par la compagnie : les données contractuelles sont verrouillées. Utilisez la correction tracée (motif obligatoire).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrats_verrou_actif ON public.contrats;
CREATE TRIGGER trg_contrats_verrou_actif
BEFORE UPDATE ON public.contrats
FOR EACH ROW EXECUTE FUNCTION public.trg_verrouiller_contrat_actif();

-- Correction explicite et tracée d'un contrat verrouillé (admin uniquement).
CREATE OR REPLACE FUNCTION public.corriger_contrat_actif(_contrat_id uuid, _champs jsonb, _motif text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _avant jsonb;
  _apres jsonb;
  _autorises text[] := ARRAY['numero','assureur','produit','compagnie_id','produit_id','date_effet',
    'date_echeance','duree_mois','prime_annuelle','fractionnement','is_emprunteur','capital_initial',
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
$$;

REVOKE ALL ON FUNCTION public.corriger_contrat_actif(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corriger_contrat_actif(uuid, jsonb, text) TO authenticated, service_role;

-- 3) Le dossier suit l'activation du contrat.
CREATE OR REPLACE FUNCTION public.trg_dossier_suit_contrat_actif()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ancien text;
BEGIN
  IF NEW.dossier_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.statut NOT IN ('actif','contrat_actif') THEN RETURN NEW; END IF;

  SELECT statut INTO _ancien FROM public.dossiers WHERE id = NEW.dossier_id;
  IF _ancien IS NULL OR _ancien IN ('contrat_actif','cloture','perdu') THEN RETURN NEW; END IF;

  UPDATE public.dossiers SET statut = 'contrat_actif', updated_at = now() WHERE id = NEW.dossier_id;
  INSERT INTO public.dossier_etapes_historique (dossier_id, ancienne_etape, nouvelle_etape, commentaire, par)
  VALUES (NEW.dossier_id, _ancien, 'contrat_actif', 'Contrat actif au portefeuille (synchronisation automatique)', auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrats_dossier_actif ON public.contrats;
CREATE TRIGGER trg_contrats_dossier_actif
AFTER INSERT OR UPDATE OF statut, dossier_id ON public.contrats
FOR EACH ROW EXECUTE FUNCTION public.trg_dossier_suit_contrat_actif();