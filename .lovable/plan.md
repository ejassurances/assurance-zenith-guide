# Parcours emprunteur : coches vertes incohérentes avec le gel KYC

## Résultat de l'audit (lecture seule, aucune modification)

Conclusion : **c'est un problème d'affichage, pas une violation de conformité.**

Constats vérifiés sur EJ-2026-EMP-0005 (Sabrina ZIANE) :

- Le dossier porte le statut « contrat actif » (portefeuille repris), et l'historique
  ne contient que deux lignes : création puis « contrat actif ». Aucune étape
  réglementaire n'a donc été franchie une par une.
- **Aucune lettre de mission** et **aucun devoir de conseil** n'existent pour ce
  dossier. Aucun devis non plus. Les étapes affichées « validées » ne correspondent
  à aucun acte réellement produit.
- Les deux contrats rattachés sont marqués « repris de l'existant » (import de
  portefeuille) et datent du 14/08/2026 ; le garde-fou serveur qui interdit la
  création d'un contrat sous 50 % de conformité n'a donc pas été contourné.
- Le score du client est bien 0 % (aucune pièce KYC enregistrée) : le gel affiché
  est correct.

Cause : la frise du parcours coche une étape uniquement d'après le statut global du
dossier. Un statut avancé (repris de l'existant) fait donc apparaître les 11 étapes
comme terminées, y compris devoir de conseil et souscription.

## Proposition de correction

**DOMAINE** : Distribution et conformité
**MODULE** : Parcours assurance emprunteur
**SOUS-MODULE** : Frise des 12 étapes (présentation)
**OBJECTIF** : Ne cocher une étape que si l'acte correspondant existe réellement, et
rendre le gel KYC visible dans la frise.
**ÉTAT ACTUEL** : Coche = statut du dossier ≥ statut de l'étape. Aucune vérification
des pièces réelles ; aucun rappel du gel dans la frise.
**MODIFICATION PROPOSÉE** :
1. La frise reçoit des « preuves » (DER envoyé/signé, lettre de mission signée,
   devis enregistrés, devoir de conseil signé, contrats existants). Trois états
   affichés : *terminée* (preuve présente), *reprise de l'existant* (statut avancé
   mais aucune preuve, pastille neutre + info-bulle « dossier repris, acte non
   produit dans le logiciel »), *à faire*.
2. Bandeau rouge court dans la frise quand le dossier est gelé : « Dossier gelé —
   les étapes réglementaires restent bloquées ».
3. Aucun changement de statut, de règle métier, de PDF ni de blocage serveur.

**DÉPENDANCES** : `src/components/parcours-emprunteur-nav.tsx`,
`src/lib/parcours-emprunteur.ts`, `src/routes/_authenticated/espace.dossiers.$id.tsx`
(lecture des preuves, en réutilisant les lectures déjà faites pour la complétude).
**IMPACT** : Affichage uniquement. Les dossiers repris du portefeuille n'afficheront
plus de fausses validations. Aucun impact e-mail, commissions, comptabilité.
**TESTS** : test unitaire de la fonction d'état d'étape (terminée / reprise / à faire) ;
vérification réelle en navigation sur EJ-2026-EMP-0005 (gelé, aucun acte) et sur un
dossier conforme avec lettre de mission et devoir de conseil signés ; capture d'écran.
**VALEUR PRODUITE** : la frise devient une preuve fiable de ce qui a été réellement
produit — indispensable en contrôle ACPR — et supprime l'ambiguïté entre « dossier
repris » et « étapes réalisées ».
