# Rattacher devis et contrats au référentiel compagnies / produits

## Constat vérifié

- `contrats` possède **déjà** `compagnie_id` et `produit_id` (FK vers `compagnies` / `produits`), en plus des champs texte `assureur` et `produit`. La fiche contrat (`espace.contrats.$id.tsx`) affiche déjà deux listes déroulantes compagnie/produit, mais : les compagnies ne sont **pas filtrées sur le statut actif**, les produits sont filtrés **uniquement par compagnie** (pas par famille), et les champs texte libres `assureur` / `produit` restent éditables et servent d'affichage principal (titre de la fiche, colonnes de `contrats-tab.tsx`).
- `dossiers` n'a **aucun** rattachement : seulement `type_assurance` (valeurs `emprunteur`, `prevoyance_sante`, `epargne_retraite`, `iard`, `trottinette`).
- `produit_familles` contient 7 familles : `emprunteur`, `auto`, `moto`, `mrh`, `sante`, `prevoyance`, `pro`. Il n'y a donc **pas** de correspondance 1:1 avec les branches du recueil : une branche correspond à un ensemble de familles, et `epargne_retraite` n'a aujourd'hui aucune famille correspondante.
- `produit_documents` (types `ipid`, `conditions_generales`, `fiche_produit`, `tarifs`, `autre`) est déjà géré dans la fiche compagnie, avec URL signée depuis le bucket `produits-documents`.

## 1. Migration

- `dossiers` : ajout de `compagnie_id uuid references public.compagnies(id)` et `produit_id uuid references public.produits(id)`, tous deux nullables (un devis peut démarrer sans produit retenu), plus index sur ces colonnes.
- `contrats` : les FK existent — on garde `assureur` / `produit` en **libellés dénormalisés** (historique des contrats déjà saisis, et trace du nom au moment de la signature), mais ils deviennent **non éditables** et recalculés depuis la sélection.
- Ajout d'un mapping branche → familles côté base : nouvelle colonne `produit_familles.branches text[]` (valeurs parmi les branches du recueil), renseignée dans la même migration :
  - `emprunteur` → `{emprunteur}`
  - `prevoyance`, `sante` → `{prevoyance_sante}`
  - `auto`, `moto`, `mrh`, `pro` → `{iard}` (+ `trottinette` pour `moto`)
  - `epargne_retraite` : aucune famille pour l'instant — le sélecteur affichera un message explicite invitant l'admin à créer la famille.
  Ce choix garde la règle métier en base, modifiable sans redéploiement, plutôt que codée en dur.
- Aucune nouvelle table, aucun changement de RLS (les politiques existantes sur `dossiers`, `contrats`, `produits`, `compagnies`, `produit_documents` suffisent).

## 2. Sélecteur compagnie / produit réutilisable

Nouveau composant `src/components/compagnie-produit-picker.tsx`, utilisé à la fois par les dossiers et les contrats :
- Liste des compagnies **filtrée sur `statut = 'actif'`** (les compagnies inactives déjà rattachées restent affichées pour ne pas casser l'historique).
- Liste des produits filtrée par compagnie **et** par famille autorisée pour la branche (`produit_familles.branches` contient le `type_assurance`), statut `actif` ou `en_test`.
- Changement de compagnie → réinitialisation du produit ; famille affichée en libellé sous le produit sélectionné.
- Message clair quand aucun produit n'est disponible pour la branche.
- Charte existante conservée (mêmes classes de champ que les formulaires actuels, tokens de marque inchangés).

## 3. Documents du produit

Nouveau composant `src/components/produit-documents-link.tsx` : dès qu'un produit est sélectionné, affiche la liste de ses documents (`produit_documents`, hors documents internes pour les rôles non admin/mandataire) avec ouverture via URL signée — même logique que la fiche compagnie — plus un lien « Voir la fiche produit » vers `/espace/compagnies/$id`.

## 4. Impact sur les formulaires existants

- **Création de dossier** (`espace.dossiers.index.tsx`, formulaire `NewDossierForm`, également accessible depuis la fiche client) : après le choix du type d'assurance, ajout du sélecteur compagnie/produit (optionnel à cette étape) ; enregistrement de `compagnie_id` / `produit_id`.
- **Fiche dossier** (`espace.dossiers.$id.tsx`) : bloc « Compagnie et produit » modifiable par admin/mandataire/prescripteur, avec les documents du produit ; lecture seule pour le client.
- **Fiche contrat** (`espace.contrats.$id.tsx`) : remplacement des deux `select` actuels par le nouveau sélecteur (filtre statut actif + famille déduite de `is_emprunteur` / du dossier d'origine) ; `assureur` et `produit` passent en lecture seule et sont renseignés automatiquement à l'enregistrement depuis les libellés sélectionnés ; ajout du bloc documents produit.
- **Création de contrat depuis la fiche client** (`contrats-tab.tsx`) : les valeurs de remplissage actuelles (« À définir » / « Nouveau contrat ») sont conservées à la création, puis remplacées dès la sélection dans la fiche ; la colonne « Assureur » affiche le nom de la compagnie rattachée quand elle existe.
- Reprise des données existantes : pas de migration automatique du texte libre vers les FK (risque d'appariement erroné) ; un indicateur « produit non rattaché » signale les contrats à compléter manuellement.

## Détails techniques

- Une seule migration : 2 colonnes sur `dossiers`, 1 colonne sur `produit_familles` + mise à jour des valeurs, index.
- `src/lib/produit-familles.ts` : helper de résolution branche → familles côté client (lecture de `produit_familles.branches`) et libellés.
- Aucun impact sur le calcul des commissions ni sur `recalculer_echeances_contrat`, qui utilisent déjà `produit_id` / `famille_id` quand ils sont renseignés — le rattachement améliore d'ailleurs la recherche de règle de commission (`trouver_taux_regle`).

## Point à confirmer

Faut-il créer dès maintenant une famille de produits « Épargne / Retraite » pour que la branche `epargne_retraite` soit sélectionnable, ou la laisser sans produit rattachable pour l'instant ?
