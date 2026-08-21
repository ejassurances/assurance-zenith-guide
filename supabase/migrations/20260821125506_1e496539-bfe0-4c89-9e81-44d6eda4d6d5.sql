-- 1) Base de calcul du moteur de recommandation Emprunteur : les 14 contrats stars.
ALTER TABLE public.produits
  ADD COLUMN IF NOT EXISTS contrat_star boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.produits.contrat_star IS
  'Contrat « star » : seule base de calcul autorisée du moteur de recommandation (14 produits emprunteur).';

UPDATE public.produits SET contrat_star = false;

-- Les 14 stars (Kereis 6 + Zenioo 8). Le contrat MNCAP Kereis est réactivé.
UPDATE public.produits
SET contrat_star = true, statut = 'actif'
WHERE id IN (
  '3639f571-361a-4338-b735-ae9f5549668f', -- Kereis / Allianz
  '107207e3-d7f1-426f-8599-13ecafdb4533', -- Kereis / Cardif Clé CI
  '19e899e5-d5c6-4dc9-a23a-9f7cc56601be', -- Kereis / Cardif Clé CRD
  '0475e5bc-0d39-44e2-bfbe-a8c2222a66a1', -- Kereis / Kredit Assur Generali
  '24b02fd7-77ea-4ae3-b104-5d102c404451', -- Kereis / SNC Alpha MetLife
  '71125071-3b1e-4d7b-baa7-a1057d000c10', -- Kereis / MNCAP CRD
  '680cddfe-7f65-4d69-b891-a21123cc7007', -- Zenioo / MNCAP 1021 CI
  'f050ecf9-1085-4c85-afbf-3f0eabc9db8a', -- Zenioo / MNCAP 1021 CRD
  '9f2bee89-4c18-4afd-b132-a4eb56132131', -- Zenioo / MNCAP 0124 CRD
  '7fc13a56-feb5-4830-a0f1-8d4301841378', -- Zenioo / MNCAP 0528
  'c1cc9836-ace0-4ebc-9cbe-19a9ff41cb75', -- Zenioo / Harmonie Mutuelle
  'ba9dcdad-3d1c-4fdb-b18e-3f5aa416d8c0', -- Zenioo / MUTLOG 0625 CI
  '2ccca1fd-8e29-440f-a783-f530479b8164', -- Zenioo / AXA 4082 CRD
  '4ea3ecc0-961a-4a33-bcb3-492a36c5c4e4'  -- Zenioo / ADE SWL 1225 CI
);

-- Les autres produits emprunteur (dont la gamme SimulAssur) sortent du moteur :
-- statut retiré, pour supprimer les doublons d'intermédiation.
UPDATE public.produits p
SET statut = 'retire'
FROM public.produit_familles f
WHERE f.id = p.famille_id
  AND f.code = 'emprunteur'
  AND p.contrat_star = false
  AND p.statut <> 'retire';

-- 2) Double route de recommandation : interrupteur manuel de débrayage.
ALTER TABLE public.dossiers
  ADD COLUMN IF NOT EXISTS mode_recommandation text NOT NULL DEFAULT 'auto';
ALTER TABLE public.dossiers DROP CONSTRAINT IF EXISTS dossiers_mode_recommandation_chk;
ALTER TABLE public.dossiers
  ADD CONSTRAINT dossiers_mode_recommandation_chk
  CHECK (mode_recommandation IN ('auto', 'A', 'B'));
COMMENT ON COLUMN public.dossiers.mode_recommandation IS
  'auto = détection par le recueil ; A = classement par prix ; B = classement par score d''adéquation technique.';

-- 3) Traçabilité DDA de la route utilisée.
ALTER TABLE public.dossier_devis_classements
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS profils_specifiques text[],
  ADD COLUMN IF NOT EXISTS scores jsonb;
COMMENT ON COLUMN public.dossier_devis_classements.route IS
  'A = prix croissant (aucune spécificité déclarée) ; B = score d''adéquation technique (Notebook Emprunteur).';

-- 4) Recueil emprunteur : le besoin de rachat d'exclusions est une garantie
-- demandée, pas une donnée de santé. Ajout à la liste blanche stricte.
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