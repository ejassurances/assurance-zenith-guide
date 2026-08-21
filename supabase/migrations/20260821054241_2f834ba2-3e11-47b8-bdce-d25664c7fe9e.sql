-- Scission des produits emprunteur combinant CI (capital initial) et CRD (capital restant dû)
-- Un produit = une seule mécanique de tarification.
DO $$
DECLARE
  v RECORD;
  new_ci uuid;
  new_crd uuid;
  d RECORD;
  is_ci boolean;
  is_crd boolean;
  paires jsonb := '[]'::jsonb;
BEGIN
  FOR v IN
    SELECT * FROM public.produits
    WHERE id IN (
      '907b19f5-2e51-47a9-af3c-fe0d35ff1fda', -- Emprunteur Cardif Clé (Kereis)
      '2f0b3efc-a2af-4b3c-bf8d-187ebdc7e510', -- Emprunteur Groupe MNCAP (Kereis)
      'f89152dc-25ec-4bc1-815d-e571b6151435', -- Cardif Libertés Emprunteur CRD et CI (SimulAssur)
      '4f32f31a-1014-4512-a841-adc41b11ea14', -- Elite Emprunteur CRD et CI
      '86c7dbe7-7682-45f2-9323-e631a701d244', -- Meros Emprunteur CRD et CI
      'ce52b1a7-d638-4c9a-a074-95d4f94ba585', -- NovaSérénité CI et CRD
      'c6c6ba61-48a1-4b5f-80a8-138b4b7c8f5c', -- Safi Emprunteur CRD et CI
      '61f7b212-29d1-4a74-93f4-67e689984650'  -- Spiti Emprunteur CRD et CI
    )
  LOOP
    new_ci := gen_random_uuid();
    new_crd := gen_random_uuid();

    INSERT INTO public.produits (
      id, nom, compagnie_id, famille_id, statut, description, assureur_porteur,
      reference_contrat, code_produit, caracteristiques, cible, commission_taux,
      couplage_message, famille_requise_id, image_url, mode_tarification,
      periodicite_cotisation, points_forts, points_vigilance, produit_requis_id, created_by
    )
    SELECT new_ci,
      regexp_replace(
        regexp_replace(v.nom, '\s*(CRD et CI|CI et CRD)\s*', ' ', 'i'),
        '\s+', ' ', 'g') || ' — CI',
      v.compagnie_id, v.famille_id, v.statut,
      coalesce(v.description || E'\n\n', '') ||
      'Variante CI : cotisation assise sur le capital initial (cotisation fixe/constante sur toute la durée du prêt).',
      v.assureur_porteur, v.reference_contrat, v.code_produit, v.caracteristiques, v.cible,
      v.commission_taux, v.couplage_message, v.famille_requise_id, v.image_url,
      v.mode_tarification, v.periodicite_cotisation, v.points_forts, v.points_vigilance,
      v.produit_requis_id, v.created_by;

    INSERT INTO public.produits (
      id, nom, compagnie_id, famille_id, statut, description, assureur_porteur,
      reference_contrat, code_produit, caracteristiques, cible, commission_taux,
      couplage_message, famille_requise_id, image_url, mode_tarification,
      periodicite_cotisation, points_forts, points_vigilance, produit_requis_id, created_by
    )
    SELECT new_crd,
      regexp_replace(
        regexp_replace(v.nom, '\s*(CRD et CI|CI et CRD)\s*', ' ', 'i'),
        '\s+', ' ', 'g') || ' — CRD',
      v.compagnie_id, v.famille_id, v.statut,
      coalesce(v.description || E'\n\n', '') ||
      'Variante CRD : cotisation assise sur le capital restant dû (cotisation dégressive dans le temps).',
      v.assureur_porteur, v.reference_contrat, v.code_produit, v.caracteristiques, v.cible,
      v.commission_taux, v.couplage_message, v.famille_requise_id, v.image_url,
      v.mode_tarification, v.periodicite_cotisation, v.points_forts, v.points_vigilance,
      v.produit_requis_id, v.created_by;

    -- Répartition des documents selon la variante réellement décrite
    FOR d IN SELECT * FROM public.produit_documents WHERE produit_id = v.id LOOP
      is_ci  := lower(d.nom) ~ '(^|[^a-z])ci([^a-z]|$)|fixe|2827|441067';
      is_crd := lower(d.nom) ~ 'crd|variable|2828|441066';
      IF is_ci = is_crd THEN
        is_ci := true; is_crd := true; -- couvre les deux variantes (ou indéterminé) => dupliqué
      END IF;

      IF is_ci THEN
        INSERT INTO public.produit_documents (produit_id, type, nom, storage_path, mime_type, taille_bytes, version, date_effet, interne, uploaded_by)
        VALUES (new_ci, d.type, d.nom, d.storage_path, d.mime_type, d.taille_bytes, d.version, d.date_effet, d.interne, d.uploaded_by);
      END IF;
      IF is_crd THEN
        INSERT INTO public.produit_documents (produit_id, type, nom, storage_path, mime_type, taille_bytes, version, date_effet, interne, uploaded_by)
        VALUES (new_crd, d.type, d.nom, d.storage_path, d.mime_type, d.taille_bytes, d.version, d.date_effet, d.interne, d.uploaded_by);
      END IF;
    END LOOP;

    paires := paires || jsonb_build_object('ancien', v.id, 'nom', v.nom, 'ci', new_ci, 'crd', new_crd);
  END LOOP;

  CREATE TEMP TABLE tmp_paires AS SELECT * FROM jsonb_array_elements(paires) AS e(j);
END $$;

-- Table de correspondance temporaire exploitable
CREATE TEMP TABLE map_var AS
SELECT (j->>'ancien')::uuid AS ancien, j->>'nom' AS nom,
       (j->>'ci')::uuid AS ci, (j->>'crd')::uuid AS crd
FROM tmp_paires;

-- ============ MIGRATION DES DONNÉES EXISTANTES ============
-- Cardif Clé (Kereis) : contrats
UPDATE public.contrats c SET produit_id = m.crd
FROM map_var m WHERE m.ancien = '907b19f5-2e51-47a9-af3c-fe0d35ff1fda'
  AND c.id IN ('aede1b17-ce8d-463f-8733-98d42fb8d0e4','750d0aac-3c28-4a46-8af3-c7e5c24c5903');
UPDATE public.contrats c SET produit_id = m.ci
FROM map_var m WHERE m.ancien = '907b19f5-2e51-47a9-af3c-fe0d35ff1fda'
  AND c.id = 'bcac58cb-dddb-403c-8ca9-517a7b2fefa2';

-- MNCAP : contrat 441066 = CRD
UPDATE public.contrats c SET produit_id = m.crd
FROM map_var m WHERE m.ancien = '2f0b3efc-a2af-4b3c-bf8d-187ebdc7e510'
  AND c.id = 'b6600ebe-6507-4021-a6b2-5f8072cf8149';

-- Cardif Libertés (SimulAssur) : cotisations fixes = CI, cotisations variables = CRD
UPDATE public.contrats c SET produit_id = m.ci
FROM map_var m WHERE m.ancien = 'f89152dc-25ec-4bc1-815d-e571b6151435'
  AND c.id = '9edaf447-6846-4cdd-a89d-0c93e90f6de5';
UPDATE public.contrats c SET produit_id = m.crd
FROM map_var m WHERE m.ancien = 'f89152dc-25ec-4bc1-815d-e571b6151435'
  AND c.id = 'fb866956-a621-431d-b38e-bdb51b4acafa';

-- Dossiers
UPDATE public.dossiers ds SET produit_id = m.crd
FROM map_var m WHERE m.ancien = '907b19f5-2e51-47a9-af3c-fe0d35ff1fda'
  AND ds.id IN ('81cfe711-1ad0-4d5d-972f-7a536e0762b5','3992eafd-eff8-480e-84da-e495259a078b','ea618f9c-db25-4715-b17d-8adca6073376');
UPDATE public.dossiers ds SET produit_id = m.ci
FROM map_var m WHERE m.ancien = '907b19f5-2e51-47a9-af3c-fe0d35ff1fda'
  AND ds.id = 'a7051773-2479-4240-9d33-5470bc63f19d';
UPDATE public.dossiers ds SET produit_id = m.crd
FROM map_var m WHERE m.ancien = '2f0b3efc-a2af-4b3c-bf8d-187ebdc7e510'
  AND ds.id = '9ad351a4-b639-4441-b463-002dddb98f8d';
UPDATE public.dossiers ds SET produit_id = m.ci
FROM map_var m WHERE m.ancien = 'f89152dc-25ec-4bc1-815d-e571b6151435'
  AND ds.id = '3a520416-b6d3-4d99-892c-60aadc2d8492';
UPDATE public.dossiers ds SET produit_id = m.crd
FROM map_var m WHERE m.ancien = 'f89152dc-25ec-4bc1-815d-e571b6151435'
  AND ds.id = 'ad805ebb-417e-4cdd-86b6-23ba142073e8';

-- Devis (les deux sont en type_cotisation CRD)
UPDATE public.dossier_devis dd SET produit_id = m.crd
FROM map_var m WHERE m.ancien = '907b19f5-2e51-47a9-af3c-fe0d35ff1fda'
  AND dd.id IN ('7190de46-ae85-42d1-adc1-051b119cae52','f56e0346-4de3-4ea6-94a1-2abba4a34339');

-- Grille de garanties validée (extraite de la notice 2828/737 = CRD)
UPDATE public.produit_garanties g SET produit_id = m.crd
FROM map_var m WHERE m.ancien = '907b19f5-2e51-47a9-af3c-fe0d35ff1fda' AND g.produit_id = m.ancien;

-- Filets de sécurité : rien ne doit rester sur les anciens produits
UPDATE public.contrats c SET produit_id = m.crd FROM map_var m WHERE c.produit_id = m.ancien;
UPDATE public.dossiers ds SET produit_id = m.crd FROM map_var m WHERE ds.produit_id = m.ancien;
UPDATE public.dossier_devis dd SET produit_id = m.crd FROM map_var m WHERE dd.produit_id = m.ancien;
UPDATE public.produit_garanties g SET produit_id = m.crd FROM map_var m WHERE g.produit_id = m.ancien;
UPDATE public.produit_formules f SET produit_id = m.crd FROM map_var m WHERE f.produit_id = m.ancien;
UPDATE public.produit_options o SET produit_id = m.crd FROM map_var m WHERE o.produit_id = m.ancien;
UPDATE public.commission_regles r SET produit_id = m.crd FROM map_var m WHERE r.produit_id = m.ancien;
UPDATE public.produits p SET produit_requis_id = m.crd FROM map_var m WHERE p.produit_requis_id = m.ancien;

-- Propositions de garanties mélangées : supprimées (ré-extraction propre par variante)
DELETE FROM public.formule_garanties_propositions WHERE produit_id IN (SELECT ancien FROM map_var);
DELETE FROM public.produit_garanties_propositions WHERE produit_id IN (SELECT ancien FROM map_var);

-- Documents et anciens produits combinés
DELETE FROM public.produit_documents WHERE produit_id IN (SELECT ancien FROM map_var);
DELETE FROM public.produits WHERE id IN (SELECT ancien FROM map_var);

-- NovaProtect : aucun document CI en base, seule la variante CRD est documentée => renommage (pas de scission)
UPDATE public.produits SET nom = 'NovaProtect Emprunteur — CRD',
  description = coalesce(description || E'\n\n', '') || 'Variante CRD : cotisation assise sur le capital restant dû (cotisation dégressive). La variante CI n''est pas documentée en base.'
WHERE id = '049a27a8-dcb8-4aa7-99f3-00506b676196';
