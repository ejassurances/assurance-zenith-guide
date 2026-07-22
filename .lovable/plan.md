# Plan — Espace Comptabilité & moteur de commissions

Objectif : donner à l'admin **et** à chaque mandataire un vrai espace comptable, alimenté automatiquement par les contrats. Focus particulier sur l'assurance emprunteur où primes et commissions se calculent année par année pendant toute la durée du prêt.

## 1. Modèle de commissions (règles paramétrables)

Nouvelle table `commission_regles` :
- portée : `mandataire` (rétrocession du cabinet vers un mandataire) ou `prescripteur` (apport d'affaires).
- cible : global, par produit, par famille de produits, ou par compagnie.
- assiette : `commission_cabinet` (% de ce que touche le cabinet) ou `prime_ht` (% de la prime).
- taux (%) et éventuellement palier (paliers de CA annuel).
- date d'effet / fin.

Effet : chaque contrat rattaché à un mandataire ou prescripteur applique la règle la plus spécifique en vigueur.

## 2. Enrichissement du modèle contrats

Ajouts sur `contrats` :
- `mandataire_id`, `prescripteur_id` (nullable).
- `mode_commissionnement` : `precompte` (payé une fois à la signature), `lineaire` (chaque année), `degressif` (typique emprunteur).
- `duree_mois`, `date_debut`, `date_fin`.
- Champs emprunteur : `capital_initial`, `duree_pret_mois`, `taux_pret`, `type_taux` (fixe / mixte), `assiette` (`capital_initial` / `capital_restant_du`), `taux_assurance_annuel` (%), `part_assuree` (%), `co_emprunteur` (jsonb).
- `commission_cabinet_taux` (% payé par la compagnie au cabinet) et `commission_cabinet_annuelle` calculée.

Nouvelle table `contrat_echeances` (une ligne par période — année ou mois selon le contrat) :
- `contrat_id`, `annee`, `date_debut_periode`, `date_fin_periode`.
- `capital_restant_du_debut`, `prime_periode`.
- `commission_cabinet_periode`, `commission_mandataire_periode`, `commission_prescripteur_periode`.
- `statut` : `previsionnel`, `emise`, `payee`, `annulee`.
- `bordereau_id` (nullable).

Générées automatiquement à la création/modification d'un contrat par une fonction serveur `recalculerEcheances(contrat_id)` :

Pour un contrat emprunteur :
```text
Chaque année n de 1 à durée :
  CRD_n = amortissement linéaire du capital (approx.) ou table exacte si fournie
  base_n = capital_initial si assiette = capital_initial
         = CRD_n si assiette = capital_restant_du
  prime_n = base_n * taux_assurance_annuel * part_assuree
  commission_cabinet_n = prime_n * commission_cabinet_taux
  commission_mandataire_n = commission_cabinet_n * taux_regle_mandataire
  commission_prescripteur_n = commission_cabinet_n * taux_regle_prescripteur
```

Les échéances sont recalculées à chaque changement de contrat ou de règle applicable (via trigger + bouton "Recalculer" côté UI).

## 3. Encaissements & réconciliation

Nouvelle table `encaissements_compagnie` : bordereaux reçus des compagnies (compagnie, période, montant, fichier importé). Une entrée d'échéance peut être pointée à un encaissement pour passer `previsionnel → emise → payee`.

Nouvelle table `paiements_partenaires` : versements réels aux mandataires / prescripteurs (période, montant, moyen, référence).

## 4. Espace Comptabilité — Admin

Route `/espace/comptabilite` avec onglets :
- **Vue d'ensemble** : chiffres du mois / trimestre / année (commissions cabinet encaissées, à recevoir, prévisionnel N+1..N+5, top compagnies, top mandataires, MRR emprunteur).
- **Prévisionnel** : liste des échéances futures filtrable (compagnie, produit, mandataire, année). Export CSV.
- **Encaissements compagnies** : import de bordereaux, saisie manuelle, rapprochement (matching automatique par contrat + période, correction manuelle possible).
- **Rétrocessions** : par mandataire — solde dû, historique versements, génération de bordereau mensuel (PDF).
- **Prescripteurs** : mêmes fonctions que rétrocessions.
- **Règles de commissionnement** : CRUD sur `commission_regles`.

## 5. Espace Comptabilité — Mandataire

Route `/espace/comptabilite` visible pour le rôle mandataire (mêmes URL, contenu filtré par `mandataire_id = auth.uid()` via RLS) :
- Ses clients rattachés.
- Ses commissions : émises, encaissées, prévisionnelles (par année).
- Ses bordereaux reçus (PDF téléchargeables).
- Détail par contrat : prime annuelle, commission cabinet, sa part.
- Export CSV pour sa propre comptabilité.
- Aucun accès aux données des autres mandataires ni aux marges cabinet globales.

## 6. Intégration côté fiche client

Sur la fiche `clients/$id` :
- Nouvel onglet **Contrats emprunteur** : création d'un contrat avec les champs prêt (capital, durée, taux, assurance), sélection de la compagnie/produit, rattachement au mandataire, aperçu immédiat du tableau d'échéances (année, CRD, prime, commissions) avec totaux.
- Une action « Recalculer » disponible si les paramètres du prêt ou la règle de commission changent.
- Le rattachement d'un client à un mandataire (`commercial_id` déjà présent) déclenche automatiquement le calcul de sa commission sur tous ses contrats.

## 7. Sécurité (RLS)

- `commission_regles` : lecture admin uniquement, écriture admin.
- `contrat_echeances` : admin voit tout ; mandataire voit uniquement les échéances où `mandataire_id = auth.uid()` (ou contrats de ses clients) ; prescripteur idem sur ses lignes ; client voit ses primes mais pas les commissions.
- `encaissements_compagnie` et `paiements_partenaires` : admin uniquement (le mandataire voit seulement les paiements le concernant).
- Toutes les fonctions de recalcul et rapprochement passent par des server functions `requireSupabaseAuth` avec vérification `has_role`.

## Détails techniques

- Recalcul des échéances via une fonction SQL `public.recalculer_echeances_contrat(uuid)` idempotente (DELETE puis INSERT), appelée depuis un server fn admin ou un trigger `AFTER INSERT/UPDATE` sur `contrats`.
- Amortissement : formule d'amortissement classique quand `taux_pret` fourni, sinon amortissement linéaire. Support co-emprunteur (2 assurés, quotités).
- Rôles : ajouter `prescripteur` à `app_role` s'il n'est pas déjà utilisé pour ces règles.
- Imports bordereaux : upload CSV/XLSX + parseur côté serveur (pas d'IA nécessaire au départ, mapping manuel des colonnes sauvegardable par compagnie).
- Génération PDF des bordereaux mandataires : rendu React → HTML → PDF via `@react-pdf/renderer` côté serveur (déjà compatible Cloudflare Workers).

## Découpage de livraison recommandé

1. **Étape A — Fondations** : tables `commission_regles`, extension `contrats`, `contrat_echeances`, fonction de recalcul, UI de saisie contrat emprunteur + aperçu échéances sur la fiche client.
2. **Étape B — Espace comptabilité admin** : dashboard, prévisionnel, encaissements, règles.
3. **Étape C — Espace mandataire + prescripteur** : vue filtrée, bordereaux PDF, exports.

Confirmez-moi si vous voulez que je démarre directement par l'**étape A**, ou si un point du modèle (mode d'amortissement, assiette, mode de commissionnement) doit être ajusté avant.
