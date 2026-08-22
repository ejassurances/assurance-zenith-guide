-- 1) Generali Kereis : 7357 (cotisations fixes / CI) vs 7358 (cotisations variables / CRD)
UPDATE public.produits
SET nom = 'Kredit Assur Generali (Kereis) — CI',
    reference_contrat = 'Convention n° 7357 (cotisations fixes — capital initial)'
WHERE id = '0475e5bc-0d39-44e2-bfbe-a8c2222a66a1';

INSERT INTO public.produits (
  compagnie_id, famille_id, nom, code_produit, description, statut, caracteristiques,
  points_forts, points_vigilance, cible, commission_taux, created_by,
  produit_requis_id, famille_requise_id, couplage_message, image_url,
  mode_tarification, assureur_porteur, reference_contrat, periodicite_cotisation, contrat_star
)
SELECT compagnie_id, famille_id, 'Kredit Assur Generali (Kereis) — CRD', code_produit, description, statut, caracteristiques,
       points_forts, points_vigilance, cible, commission_taux, created_by,
       produit_requis_id, famille_requise_id, couplage_message, image_url,
       mode_tarification, assureur_porteur,
       'Convention n° 7358 (cotisations variables — capital restant dû)', periodicite_cotisation, contrat_star
FROM public.produits WHERE id = '0475e5bc-0d39-44e2-bfbe-a8c2222a66a1';

-- documents propres au 7358 -> fiche CRD
UPDATE public.produit_documents d
SET produit_id = (SELECT id FROM public.produits WHERE nom = 'Kredit Assur Generali (Kereis) — CRD')
WHERE d.produit_id = '0475e5bc-0d39-44e2-bfbe-a8c2222a66a1' AND d.nom LIKE '%7358%';

-- documents communs (fiche CCSF 7357 et 7358) -> dupliqués sur la fiche CRD
INSERT INTO public.produit_documents (
  produit_id, type, nom, version, date_effet, storage_path, taille_bytes, mime_type, interne,
  uploaded_by, drive_file_id, drive_url, drive_chemin
)
SELECT (SELECT id FROM public.produits WHERE nom = 'Kredit Assur Generali (Kereis) — CRD'),
       type, nom, version, date_effet, storage_path, taille_bytes, mime_type, interne,
       uploaded_by, drive_file_id, drive_url, drive_chemin
FROM public.produit_documents
WHERE produit_id = '0475e5bc-0d39-44e2-bfbe-a8c2222a66a1'
  AND nom LIKE '%7357_et_7358%';

-- 2) MNCAP Kereis : la fiche CI (441067CI) manquait
UPDATE public.produits
SET reference_contrat = 'IASSURE n° 441066CRD (capital restant dû)'
WHERE id = '71125071-3b1e-4d7b-baa7-a1057d000c10';

INSERT INTO public.produits (
  compagnie_id, famille_id, nom, code_produit, description, statut, caracteristiques,
  points_forts, points_vigilance, cible, commission_taux, created_by,
  produit_requis_id, famille_requise_id, couplage_message, image_url,
  mode_tarification, assureur_porteur, reference_contrat, periodicite_cotisation, contrat_star
)
SELECT compagnie_id, famille_id, 'Emprunteur Groupe MNCAP (Kereis) — CI', code_produit, description, statut, caracteristiques,
       points_forts, points_vigilance, cible, commission_taux, created_by,
       produit_requis_id, famille_requise_id, couplage_message, image_url,
       mode_tarification, assureur_porteur,
       'IASSURE n° 441067CI (capital initial)', periodicite_cotisation, contrat_star
FROM public.produits WHERE id = '71125071-3b1e-4d7b-baa7-a1057d000c10';

-- documents communs aux deux conventions -> aussi sur la fiche CI
INSERT INTO public.produit_documents (
  produit_id, type, nom, version, date_effet, storage_path, taille_bytes, mime_type, interne,
  uploaded_by, drive_file_id, drive_url, drive_chemin
)
SELECT (SELECT id FROM public.produits WHERE nom = 'Emprunteur Groupe MNCAP (Kereis) — CI'),
       type, nom, version, date_effet, storage_path, taille_bytes, mime_type, interne,
       uploaded_by, drive_file_id, drive_url, drive_chemin
FROM public.produit_documents
WHERE produit_id = '71125071-3b1e-4d7b-baa7-a1057d000c10'
  AND (nom LIKE '%441066CRD_et_441067CI%' OR type = 'fiche_produit');

-- 3) Cardif Clé (Kereis) : une seule convention par variante
UPDATE public.produits
SET reference_contrat = 'Convention n° 2827/736 (cotisations fixes — capital initial)'
WHERE id = '107207e3-d7f1-426f-8599-13ecafdb4533';

UPDATE public.produits
SET reference_contrat = 'Convention n° 2828/737 (cotisations variables — capital restant dû)'
WHERE id = '19e899e5-d5c6-4dc9-a23a-9f7cc56601be';
