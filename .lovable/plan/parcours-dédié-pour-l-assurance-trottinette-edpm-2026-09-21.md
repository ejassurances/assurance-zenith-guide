# Parcours dédié pour l'assurance trottinette (EDPM)

**DOMAINE** : Production / dossiers clients
**MODULE** : Dossiers
**SOUS-MODULE** : Parcours par étapes d'un dossier

## OBJECTIF

Donner aux dossiers trottinette le même déroulé par étapes que l'assurance de prêt,
mais avec des étapes et des mots qui parlent de l'engin, pas du crédit.

## ÉTAT ACTUEL

- Le déroulé par étapes (frise numérotée 0 → 11 + onglets Synthèse, Modifier, Info Assuré(s),
  Prêt(s), Banque, Études et devis, Fichiers, Tâches…) n'existe que pour l'assurance de prêt.
- Un dossier trottinette affiche l'ancienne vue : une simple frise de statuts, sans étapes
  guidées ni onglets.
- Les libellés du déroulé existant sont propres au prêt (prêts, prêteur, substitution, quotité).

## MODIFICATION PROPOSÉE

Nouveau déroulé trottinette en 10 étapes, même présentation, mêmes couleurs, mêmes règles
d'avancement que le prêt :

```text
0  Import documents        facture d'achat de l'engin, pièce d'identité, justificatif de domicile
1  Coordonnées             identité et coordonnées de l'assuré
2  Informations personnelles  naissance, profession, permis/âge du conducteur
3  L'engin                 marque, modèle, numéro de série, prix d'achat, date d'achat, vitesse
4  Usage et stationnement  usage (loisir / trajets), lieu de stationnement, antivol
5  Lettre de mission       mission du cabinet, signée par le client
6  Études et devis         devis déposés ou repris, comparatif sur la grille trottinette
7  Devoir de conseil       mise en concurrence, validation humaine, signature
8  Informations adhésion   pièces et informations demandées par l'assureur
9  Souscription            transmission à la compagnie et suivi
10 Analyse et décision     décision de la compagnie et documents reçus
```

Onglets adaptés : « Prêt(s) » et « Banque » remplacés par « L'engin » et « Usage » ;
les onglets Synthèse, Modifier, Info Assuré(s), Configuration, Études et devis, Fichiers,
Tâches, Activité, Pièces sont conservés tels quels.

Pas d'étape « Substitution » ni « Prêteur » : elles n'ont pas de sens hors prêt.

## DÉPENDANCES

- `src/lib/parcours-emprunteur.ts` devient une carte de parcours par branche (prêt + trottinette),
  sans changer les statuts métier existants.
- `src/components/parcours-emprunteur-nav.tsx` : titre et nombre d'étapes dynamiques.
- `src/routes/_authenticated/espace.dossiers.$id.tsx` : le déroulé s'active aussi pour la
  trottinette, avec les onglets adaptés.
- Les écrans réutilisés (recueil, devis, devoir de conseil, pièces, souscription) sont déjà
  génériques : ils suivent la branche du dossier.

## IMPACT

Interface et navigation uniquement. Aucun changement de base de données, de statut métier,
de calcul de commission, de document PDF, de conformité ni du système e-mail. Les dossiers
d'assurance de prêt restent strictement identiques.

## TESTS

- Vérification technique du projet.
- Contrôle à l'écran sur le dossier trottinette réel EJ-2026-TRO-0002 : frise 0 → 10, libellés
  engin/usage, aucune mention de prêt, de prêteur ni de substitution.
- Contrôle à l'écran sur un dossier d'assurance de prêt : déroulé inchangé.
- Captures d'écran des deux cas.

## VALEUR PRODUITE

Un dossier trottinette se traite avec le même guidage pas à pas que l'assurance de prêt,
sans champs ni mots inadaptés — moins d'erreurs de saisie et un déroulé réutilisable pour
les autres branches à venir.
