# Étude et devis : import direct + reprise des devis déjà au dossier

**DOMAINE** — Production emprunteur
**MODULE** — Parcours emprunteur
**SOUS-MODULE** — Étape 6 « Étude et devis » / Étape 7 « Devoir de conseil »

## OBJECTIF
Pouvoir, depuis l'étape Étude et devis : déposer un devis reçu (PDF/photo) sans passer par un produit du catalogue, ou reprendre un devis déjà présent dans le dossier (reçu par e-mail, scanné). Et confirmer que l'étape suivante, Devoir de conseil, s'appuie bien sur ces devis.

## ÉTAT ACTUEL
- L'import d'un devis existe déjà, mais il est caché : il n'apparaît que dans la fenêtre « Ajouter le prix de ce produit », donc uniquement quand on part d'un produit du catalogue.
- Aucun moyen de désigner comme devis une pièce déjà déposée sur le dossier : il faut re-téléverser le même fichier.
- L'étape Devoir de conseil existe déjà (étape 7, juste après l'étude et les devis) et reprend les devis du dossier ainsi que l'offre retenue, avec validation humaine puis signature. Rien à créer de ce côté.

## MODIFICATION PROPOSÉE
1. Bloc « Ajouter un devis » visible en haut de l'étape Étude et devis, avec deux entrées :
   - **Déposer un devis** (PDF ou photo) : lecture automatique, puis le formulaire de vérification s'ouvre prérempli.
   - **Reprendre un devis du dossier** : liste des pièces du dossier qui ressemblent à des devis (nom de fichier ou classement), avec date et origine ; un clic lance la lecture et ouvre le même formulaire prérempli.
2. Dans les deux cas : rien n'est enregistré sans votre validation, le fichier reste rattaché au devis comme justificatif, et la pièce déjà au dossier n'est jamais dupliquée.
3. Étape Devoir de conseil : ajout d'un rappel visible quand aucun devis n'est encore enregistré, et bouton de reprise des devis déjà présent conservé. Aucun changement de règle, de signature ni de PDF.

## DÉPENDANCES
Écran de l'étape 6 (`dossier-devis-panel.tsx`), lecture IA existante (`devis-import`), pièces du dossier (`documents`), écran devoir de conseil.

## IMPACT
Interface uniquement. Aucune modification de base de données, de calcul de commission, de conformité, de document PDF ni du système e-mail. Les devis déjà enregistrés restent inchangés.

## TESTS
Vérification typée du projet, puis contrôle à l'écran sur un dossier emprunteur réel : bloc visible, liste des pièces candidates, lecture d'une pièce existante, formulaire prérempli, puis passage à l'étape Devoir de conseil avec le devis repris. Captures fournies.

## VALEUR PRODUITE
Un devis reçu par e-mail devient exploitable en deux clics, sans re-téléversement ni détour par le catalogue, et alimente directement le devoir de conseil.
