# Correction de l’étape Prêts

## DOMAINE
Relation & Développement Commercial

## MODULE
Dossiers — Assurance emprunteur

## SOUS-MODULE
Parcours emprunteur, étape 3 « Prêts »

## OBJECTIF
Rendre effectifs l’enregistrement automatique et l’affichage des quatre valeurs attendues : capital restant dû, échéances déjà payées, coût total de l’assurance bancaire et coût restant.

## ÉTAT ACTUEL
- Le bouton interne enregistre, mais le menu principal des 12 étapes change de vue directement : il contourne l’enregistrement ajouté au formulaire.
- Le capital restant dû et les échéances écoulées sont calculés uniquement dans le panneau latéral ; ils ne sont ni reportés automatiquement ni affichés clairement dans la partie principale.
- Le coût total et le coût restant de l’assurance sont également limités au panneau latéral.
- Quand la première échéance manque, l’écran utilise la date d’import du fichier au lieu de la date d’édition extraite du document. Cela produit notamment 0 échéance écoulée et un capital restant dû erroné.

## MODIFICATION PROPOSÉE
1. Enregistrer automatiquement les valeurs modifiées après une courte temporisation, sans attendre un changement d’étape ni recharger la page.
2. Recalculer automatiquement la situation du prêt dès qu’une donnée utile change.
3. Afficher dans la partie principale de l’étape :
   - capital restant dû calculé ;
   - échéances déjà payées ;
   - échéances restantes ;
   - cotisation mensuelle ;
   - coût total de l’assurance ;
   - cotisation totale restante.
4. Enregistrer le capital restant dû et les mois restants calculés dans le recueil, sans bouton « Reporter ».
5. Utiliser d’abord la date de première échéance, sinon `date_edition_document` extraite par l’IA ; ne plus prendre la date d’import comme date d’édition.
6. Afficher un état visible « Enregistrement… », puis « Enregistré » ou l’erreur exacte.

## DÉPENDANCES
Aucune nouvelle table ni nouveau service. Les calculs existants sont conservés et raccordés correctement à l’écran et à l’enregistrement.

## IMPACT
Correction limitée à l’étape Prêts du parcours emprunteur. Aucun changement sur les emails, commissions, KYC ou autres modules.

## TESTS
- Modifier un montant et quitter l’étape immédiatement : vérifier sa persistance au retour.
- Vérifier les calculs avec une première échéance connue.
- Vérifier le repli sur la date d’édition extraite quand la première échéance est absente.
- Vérifier les six valeurs visibles dans la partie principale.
- Vérifier qu’une erreur d’enregistrement est affichée et non silencieuse.
- Exécuter les tests ciblés et la vérification TypeScript.

## VALEUR PRODUITE
Les données saisies ne se perdent plus et le conseiller voit immédiatement, au même endroit, les chiffres indispensables à l’étude de substitution.
