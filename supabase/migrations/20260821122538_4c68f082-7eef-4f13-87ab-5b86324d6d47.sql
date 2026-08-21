-- =====================================================================
-- SPRINT 1 — Conformité DDA & traçabilité ACPR
-- =====================================================================

-- 1) DEVIS PAR TÊTE (co-emprunteurs) -----------------------------------
ALTER TABLE public.dossier_devis
  ADD COLUMN IF NOT EXISTS assure_rang smallint,
  ADD COLUMN IF NOT EXISTS assure_personne_id text;

COMMENT ON COLUMN public.dossier_devis.assure_rang IS
  'Rang de l''assuré couvert par ce devis (1 = assuré principal, 2 = co-emprunteur). Un devis = une tête.';
COMMENT ON COLUMN public.dossier_devis.assure_personne_id IS
  'Identifiant de la personne assurée dans recueil_besoins.assures (rang - 1 par défaut).';

UPDATE public.dossier_devis SET assure_rang = 1 WHERE assure_rang IS NULL;

CREATE OR REPLACE FUNCTION public.nb_assures_emprunteur(_dossier_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_array_length(d.recueil_besoins -> 'assures'), 0)
  FROM public.dossiers d
  WHERE d.id = _dossier_id AND d.type_assurance = 'emprunteur'
$$;

CREATE OR REPLACE FUNCTION public.trg_devis_une_tete_par_devis()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _nb integer;
  _score integer;
  _client uuid;
BEGIN
  _nb := public.nb_assures_emprunteur(NEW.dossier_id);

  IF _nb >= 2 THEN
    IF NEW.assure_rang IS NULL THEN
      RAISE EXCEPTION 'DDA : ce dossier comporte % assurés. Chaque devis doit viser une seule tête (assure_rang 1 = assuré principal, 2 = co-emprunteur). Le devis combiné unique est interdit.', _nb;
    END IF;
    IF NEW.assure_rang < 1 OR NEW.assure_rang > _nb THEN
      RAISE EXCEPTION 'DDA : assure_rang invalide (%). Valeurs autorisées : 1 à %.', NEW.assure_rang, _nb;
    END IF;
  ELSE
    NEW.assure_rang := COALESCE(NEW.assure_rang, 1);
  END IF;

  NEW.assure_personne_id := COALESCE(NEW.assure_personne_id, (NEW.assure_rang - 1)::text);

  -- Blocage KYC : pas de devis si le score de conformité client est < 50 %.
  SELECT d.client_id INTO _client FROM public.dossiers d WHERE d.id = NEW.dossier_id;
  IF TG_OP = 'INSERT' AND _client IS NOT NULL THEN
    _score := public.calculer_score_conformite_client(_client);
    IF _score IS NOT NULL AND _score < 50 THEN
      RAISE EXCEPTION 'Blocage KYC : score de conformité client à % %% (< 50 %%). Complétez le KYC avant toute génération de devis.', _score;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_devis_une_tete ON public.dossier_devis;
CREATE TRIGGER trg_devis_une_tete
  BEFORE INSERT OR UPDATE ON public.dossier_devis
  FOR EACH ROW EXECUTE FUNCTION public.trg_devis_une_tete_par_devis();

-- 2) EXCLUSION STRICTE DU QUESTIONNAIRE MÉDICAL (liste blanche) --------
CREATE OR REPLACE FUNCTION public.trg_recueil_emprunteur_sans_sante()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _autorisees text[] := ARRAY[
    -- champs du recueil emprunteur
    'banque','objet_pret','capital','duree_mois','capital_restant_du','mois_restants',
    'taux_pret','assures','tarif_montant_total','tarif_cotisation_mensuelle',
    'tarif_cotisation_annuelle','tarif_nb_annees','tarif_taux_commission',
    'priorite','garanties_souhaitees',
    -- champs historiques (reprise de contrat existant)
    'assureur','capital_emprunte','contrat_numero','cotisation_mensuelle','date_effet',
    'fractionnement','garanties_acceptees','notes_contrat','origine','produit','quotite'
  ];
  _interdites text[] := ARRAY[
    'lien','date_naissance','quotite_pct','csp','fumeur'
  ];
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
    IF NOT (_cle = ANY(_autorisees)) THEN
      RAISE EXCEPTION 'Recueil emprunteur : clé « % » refusée (liste blanche stricte, loi Lemoine — aucune donnée de santé ne peut être collectée).', _cle;
    END IF;
  END LOOP;

  -- Nettoyage des assurés : seules les clés non médicales sont conservées.
  _assures := NEW.recueil_besoins -> 'assures';
  IF _assures IS NOT NULL AND jsonb_typeof(_assures) = 'array' THEN
    FOR _a IN SELECT * FROM jsonb_array_elements(_assures) LOOP
      _b := '{}'::jsonb;
      IF jsonb_typeof(_a) = 'object' THEN
        FOR _k IN SELECT jsonb_object_keys(_a) LOOP
          IF _k = ANY(_interdites) THEN
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
$$;

DROP TRIGGER IF EXISTS trg_recueil_sans_sante ON public.dossiers;
CREATE TRIGGER trg_recueil_sans_sante
  BEFORE INSERT OR UPDATE OF recueil_besoins, type_assurance ON public.dossiers
  FOR EACH ROW EXECUTE FUNCTION public.trg_recueil_emprunteur_sans_sante();

-- 3) TRAÇABILITÉ IMMUABLE (append-only) --------------------------------
ALTER TABLE public.devoirs_conseil ADD COLUMN IF NOT EXISTS archive_le timestamptz;
ALTER TABLE public.lettres_mission ADD COLUMN IF NOT EXISTS archive_le timestamptz;
ALTER TABLE public.dossier_devis   ADD COLUMN IF NOT EXISTS archive_le timestamptz;
ALTER TABLE public.documents       ADD COLUMN IF NOT EXISTS archive_le timestamptz;

DROP POLICY IF EXISTS "Supprimer son document ou admin" ON public.documents;
DROP POLICY IF EXISTS "Staff supprime un devis" ON public.dossier_devis;

REVOKE DELETE ON public.devoirs_conseil FROM authenticated, anon;
REVOKE DELETE ON public.lettres_mission FROM authenticated, anon;
REVOKE DELETE ON public.dossier_devis   FROM authenticated, anon;
REVOKE DELETE ON public.documents       FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.trg_bloquer_suppression_dda()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Traçabilité ACPR : la suppression est interdite sur % (conservation de la preuve). Utilisez la colonne archive_le pour masquer la ligne.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_delete ON public.devoirs_conseil;
CREATE TRIGGER trg_no_delete BEFORE DELETE ON public.devoirs_conseil
  FOR EACH ROW EXECUTE FUNCTION public.trg_bloquer_suppression_dda();
DROP TRIGGER IF EXISTS trg_no_delete ON public.lettres_mission;
CREATE TRIGGER trg_no_delete BEFORE DELETE ON public.lettres_mission
  FOR EACH ROW EXECUTE FUNCTION public.trg_bloquer_suppression_dda();
DROP TRIGGER IF EXISTS trg_no_delete ON public.dossier_devis;
CREATE TRIGGER trg_no_delete BEFORE DELETE ON public.dossier_devis
  FOR EACH ROW EXECUTE FUNCTION public.trg_bloquer_suppression_dda();
DROP TRIGGER IF EXISTS trg_no_delete ON public.documents;
CREATE TRIGGER trg_no_delete BEFORE DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.trg_bloquer_suppression_dda();