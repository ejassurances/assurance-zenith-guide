# Étude et devis : adapter l'écran à la branche du dossier (trottinette / EDPM)

## DOMAINE
Production et distribution — parcours dossier.

## MODULE
Dossiers / Étude et devis.

## SOUS-MODULE
Saisie, import et comparatif des devis.

## OBJECTIF
Sur un dossier trottinette (EDPM), l'écran des devis doit parler de la trottinette,
pas d'un prêt : plus de coût « sur la durée du prêt », de quotité, de cotisation
dégressive, ni d'économie face à la banque ; le comparatif des garanties doit
utiliser la grille EDPM du CRM.

## ÉTAT ACTUEL (audit lecture seule, aucune modification)
- Le tableau de rapprochement des devis est appelé avec la branche **écrite en dur
  « emprunteur »**, donc il compare des garanties de prêt même sur un autre dossier.
- Dans la liste des devis, affichés quelle que soit la branche :
  - « … € au total sur la durée du prêt »,
  - « CI — cotisation constante sur le capital initial » / « CRD — dégressive »,
  - l'étiquette « Quotité … % »,
  - le bloc « économie / différentiel face à la banque ».
- Dans le formulaire de saisie : champ « Montant total de l'assurance sur la durée
  du prêt », mode de cotisation CI/CRD, quotité, et assiette de commission
  proposée par défaut sur « Économie réalisée ».
- Une grille de garanties EDPM existe déjà dans le CRM et n'est jamais utilisée ici.

## MODIFICATION PROPOSÉE (interface uniquement)
1. Le comparatif de garanties utilise la branche réelle du dossier (EDPM pour une
   trottinette) au lieu de « emprunteur ».
2. Les lignes et libellés propres au prêt (coût sur 8 ans, économie face à la
   banque, capital restant dû, quotité, cotisation dégressive) n'apparaissent plus
   hors assurance emprunteur ; à la place : cotisation mensuelle, cotisation
   annuelle, coût sur un an.
3. Formulaire de saisie hors emprunteur : le montant total devient « Montant total
   annuel de la cotisation », les champs mode de cotisation CI/CRD et quotité sont
   masqués, et l'assiette de commission est proposée sur « Cotisation ».
4. Import d'un devis : inchangé (déjà générique) ; seuls les libellés affichés
   suivent la branche.

## DÉPENDANCES
`src/components/dossier-devis-panel.tsx`, `src/components/devis-comparatif-table.tsx`,
grilles `src/lib/garanties-grille.ts` (lecture seule).

## IMPACT
Aucun changement de base de données, de calcul de commission, de devoir de conseil,
de PDF, de règle de conformité ni du système e-mail. Les dossiers emprunteur gardent
exactement l'écran actuel.

## TESTS
Vérification typée, puis contrôle à l'écran : un dossier trottinette (libellés EDPM,
aucune mention de prêt) et un dossier emprunteur existant (inchangé), avec captures.

## VALEUR PRODUITE
Un devis trottinette se saisit et se compare avec les bons termes, ce qui évite les
erreurs de saisie et un devoir de conseil incohérent avec le risque assuré.
