# Refonte du parcours Devis Assurance Emprunteur — 12 étapes

## DOMAINE / MODULE
Domaine 3 (Production & Souscription) — Module Dossiers emprunteur, sous-module Parcours dossier.

## OBJECTIF
Un parcours unique, séquentiel et lisible en 12 étapes (0 → 11), inspiré de la logique d'interface des captures Kereis/Sesame mais entièrement rendu dans notre charte marine / doré : barre d'étapes horizontale, colonnes par emprunteur, panneau de synthèse à droite, codes de statut.

## ÉTAT ACTUEL (audit lecture seule)
- Les étapes vivent dans `src/lib/pipeline-dossier.ts` (12 statuts métier, dont 2 hors parcours) et sont affichées par `dossier-pipeline.tsx` regroupées en 4 phases client.
- La page dossier (`espace.dossiers.$id.tsx`) choisit les panneaux par `switch (step)`. Tous les blocs existent déjà :
  - recueil pas-à-pas (`recueil-workflow.tsx`, `recueil-dossier-panel.tsx`) avec sections emprunteur : Le prêt / Assurés / Tarification / Besoins ;
  - import et analyse IA des documents de prêt (`documents-pret-panel.tsx`, `recueil-documents.functions.ts`, `offre-pret-analyse.server.ts`, création de dossier depuis une offre) ;
  - lettre de mission (`LettreMissionPanel` + `lettres-mission.functions.ts`) ;
  - devis / propositions par assuré (`dossier-devis-panel.tsx`, import de devis IA, classement, recommandation) ;
  - devoir de conseil + signature interne (`devoir-conseil-panel.tsx`, `devoir-conseil-assures.server.ts`) ;
  - souscription, pièces requises, documents (`souscription-panel.tsx`, `dossier-pieces-panel.tsx`).
- Manque : la mise en scène unifiée. Les 4 points demandés existent techniquement mais ne sont pas exposés comme étapes du parcours, l'import initial n'est pas une étape 0, et « Analyse et décision » n'a pas de zone dédiée aux documents reçus de l'assureur.

## MODIFICATION PROPOSÉE
1. **Nouvelle carte de parcours (présentation)** — `src/lib/parcours-emprunteur.ts` : 12 étapes (Import documents, Coordonnées, Informations personnelles, Prêts, Prêteur, Lettre de mission, Simulations, Devoir de conseil, Informations adhésion, Substitution, Souscription, Analyse et décision), chacune reliée au statut métier existant. Aucun statut de base n'est créé ni renommé : la granularité interne et la traçabilité ACPR restent identiques.
2. **Barre d'étapes horizontale** — nouveau composant `parcours-emprunteur-nav.tsx` (marine `#0A192F`, accent doré, coche pour étape franchie, point pour étape à venir), affichée en tête du dossier emprunteur à la place du bloc 4 phases. Le bloc phases reste utilisé pour les autres branches.
3. **Étape 0 — Import documents** : panneau de dépôt de l'offre de prêt / tableau d'amortissement branché sur l'analyse IA existante, avec restitution des champs lus (capital, taux, durée, prêteur, emprunteurs, quotités) et rapprochement de la fiche client existante. Le document importé fait foi, les valeurs saisies divergentes sont corrigées et tracées.
4. **Étape 5 — Lettre de mission** : le panneau existant devient une étape du parcours, avec objectif fixe affiché « faire des économies en conservant l'équivalence des garanties » et rappel des infos client + prêt utilisées.
5. **Étape 7 — Devoir de conseil** : regroupe l'import des devis (PDF ou API selon branche), la sélection des 3 devis mis en concurrence, la génération par l'agent, la validation humaine bloquante puis l'envoi à la signature. L'étape 8 reste inaccessible tant que la signature n'est pas enregistrée (garde-fou déjà présent côté serveur, rendu explicite dans l'interface).
6. **Étape 11 — Analyse et décision** : zone de dépôt des documents reçus de l'assureur (devis final, lettre de mission signée, devoir de conseil signé) avec classement automatique et validation de la pièce requise correspondante.
7. **Colonnes par emprunteur et panneau de synthèse** : réutilisation du rendu deux colonnes déjà en place sur les devis, étendu aux étapes Informations personnelles, Adhésion et Souscription ; synthèse à droite (coût total, économies, quotités, statut Lemoine).

## DÉPENDANCES
`pipeline-dossier.ts`, `espace.dossiers.$id.tsx`, `recueil-*`, `documents-pret-panel`, `lettres-mission`, `devoir-conseil-*`, `dossier-devis-panel`, `souscription-panel`, `dossier-pieces-panel`. Aucune migration de base n'est nécessaire.

## IMPACT
Interface et présentation uniquement. Aucune règle métier modifiée : validation humaine obligatoire, primauté des documents importés, comparatif limité aux grilles validées, signature interne, blocage des étapes réglementaires.

## TESTS
Typecheck, tests ciblés existants (échéancier, scoring, préremplissage), puis vérification visuelle par capture d'écran de l'interface réelle.

## LIVRAISON — un point à la fois
Livraison et confirmation séquentielles, avec capture d'écran de l'interface réelle à chaque point, et attente de votre vérification avant le suivant :
1. Étape 0 — Import documents (inclut la barre d'étapes et la carte de parcours).
2. Étape 5 — Lettre de mission.
3. Étape 7 — Devoir de conseil (devis, sélection, validation, signature bloquante).
4. Étape 11 — Analyse et décision (documents reçus de l'assureur).

## VALEUR PRODUITE
Un parcours emprunteur lisible de bout en bout, sans double saisie : le document importé alimente le recueil, la lettre de mission, l'étude puis le devoir de conseil, avec des blocages réglementaires visibles.
