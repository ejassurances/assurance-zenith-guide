# Devis emprunteur : catalogue noté, tarif saisi, classement par prix et économies

## DOMAINE
Relation & développement commercial — production emprunteur.

## MODULE / SOUS-MODULE
Dossiers → Recueil des besoins, étape 4 « Tarification » → panneau « Devis et valorisation ».

## OBJECTIF
Sur la branche emprunteur, ne plus passer par les tarificateurs automatiques des
partenaires. Le conseiller part du catalogue du cabinet, voit les produits notés
selon la situation du prospect, saisit le prix obtenu pour chaque produit, et le
logiciel classe les offres du moins cher au plus cher avec l'économie réalisée.

## ÉTAT ACTUEL
- Le panneau affiche trois blocs de tarification automatique (Néoliane, UGIP,
  Simulassur) qui créent des devis directement en base.
- Les produits du catalogue ne sont visibles que dans une liste déroulante du
  formulaire de saisie : aucune note, aucune vue d'ensemble.
- Le classement existant est un classement IA ponctuel (route prix / route
  adéquation) à lancer manuellement ; l'économie est calculée mais affichée
  devis par devis, sans tri.

## MODIFICATION PROPOSÉE
1. Retrait, pour la branche emprunteur uniquement, des trois blocs de
   tarification automatique et des appels correspondants (les autres branches,
   par exemple la santé Néoliane, ne changent pas).
2. Nouveau bloc « Produits du catalogue et adéquation » (emprunteur) : liste des
   produits emprunteur du catalogue, chacun avec
   - une note sur 100 calculée à partir de la grille de garanties validée du
     produit et de la situation lue dans le recueil (TNS, senior, rachat
     d'exclusions, garanties souhaitées) ;
   - les points forts / points faibles retenus pour cette note ;
   - la mention « grille non validée : produit non notable » quand la grille
     n'existe pas (aucune valeur déduite) ;
   - un bouton « Ajouter le prix de ce produit » qui pré-remplit le formulaire de
     devis (partenaire, produit, tête assurée).
3. Nouveau tableau « Classement des offres » : les devis du dossier triés du
   moins cher au plus cher (coût total sur la période restante), avec cotisation
   mensuelle, coût total, économie en euros et en %, note d'adéquation, et le
   bouton « Recommander ce devis » déjà existant.
4. Le classement IA reste disponible sur les autres branches ; sur emprunteur, le
   tri prix + note remplace le lancement manuel.

## DÉPENDANCES
`dossier_devis`, `produits`, `produit_familles`, `produit_garanties` (grilles
validées), `assurance-initiale.ts`, `emprunteur-notebook.ts`. Aucune migration.
Aucune suppression de données : les devis déjà créés par API restent visibles.

## IMPACT
- Fichiers touchés : `src/components/dossier-devis-panel.tsx`, nouveau
  `src/lib/emprunteur-scoring-produits.ts` (fonction pure + tests).
- Les modules de tarification partenaires restent en place pour les autres
  branches ; seul l'accès depuis l'emprunteur disparaît.

## TESTS
- Tests unitaires du scoring (grille absente, profil TNS, profil senior).
- Typecheck complet.
- Vérification sur un dossier emprunteur réel à deux têtes : catalogue noté,
  ajout d'un prix, classement croissant et économies affichées.

## VALEUR PRODUITE
Un seul chemin de tarification, conforme à la méthode d'origine : catalogue +
situation du prospect + prix négociés, avec un classement lisible pour le devoir
de conseil et l'économie chiffrée pour le client.
