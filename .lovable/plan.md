# Grille de garanties produit — extraction IA des CG/IPID avec validation humaine

Objectif : que le devoir de conseil ne cite que les garanties réellement couvertes par le produit sélectionné (cas E-Trottinette April/Allianz : ni vol ni dommages), à partir d'une grille standardisée par typologie, alimentée par une proposition IA issue des CG/IPID et **validée à la main** avant tout usage.

## 1. La grille standardisée (structure) vit dans le code

Nouveau fichier `src/lib/garanties-grille.ts` : pour chaque famille de produit (emprunteur, auto, moto, MRH, santé, prévoyance, pro, épargne, EDPM/trottinette), la liste ordonnée des garanties attendues avec un code stable, un libellé, une nature (garantie / franchise / plafond global) et un caractère obligatoire ou non.

Exemple EDPM/trottinette (grille de référence du chantier) : `rc_obligatoire`, `vol`, `dommages_bris`, `defense_penale_recours`, `garantie_mobilite`, `protection_corporelle_conducteur`, `assistance`, `franchise`.

Pourquoi le code et non la base : la structure doit être identique pour toutes les compagnies d'une même branche, versionnée avec l'application, et une modification de structure doit passer par une revue. Chaque grille porte un numéro de version (`grille_version`) pour savoir sur quelle structure une validation a été faite.

Pour chaque garantie, les valeurs saisies/validées sont : couverture (`oui` / `non` / `option` / `inconnu`), plafond, franchise, conditions ou limites, et un extrait justificatif tiré des CG/IPID.

## 2. Stockage des valeurs : validé d'un côté, proposé de l'autre

Deux tables, strictement séparées, pour qu'aucune proposition IA ne puisse être lue comme une donnée validée :

- `produit_garanties` — la grille **validée** d'un produit (une ligne par produit) : famille, version de grille, valeurs, statut (`brouillon` / `valide` / `a_revoir`), qui a validé et quand, document source de référence.
- `produit_garanties_propositions` — les propositions **IA** : produit, document source (`produit_documents`), modèle IA utilisé, valeurs proposées avec extraits justificatifs, niveau de confiance par ligne, statut (`proposee` / `acceptee` / `rejetee`), horodatage.

Accès : lecture/écriture réservées au staff (admin, mandataire) ; validation réservée à l'admin. Aucun accès client, aucun accès anonyme.

## 3. Extraction côté serveur

Déclenchement **explicite**, jamais silencieux : bouton « Analyser ce document » sur un CG ou un IPID de la fiche produit (et proposition automatique d'analyse juste après un upload, à confirmer d'un clic).

Chaîne côté serveur (server function protégée, exécutée après vérification du rôle) :

1. téléchargement du PDF depuis le bucket `produits-documents` ;
2. envoi du PDF à un modèle Gemini via la passerelle IA de Lovable, en pièce jointe PDF, avec la grille de la famille en schéma de sortie attendu (JSON strict) et une consigne clé : **ne rien inférer** — toute garantie non explicitement couverte par le texte est renvoyée `non` ou `inconnu`, avec l'extrait qui le justifie ;
3. pour un PDF trop volumineux, extraction de texte préalable (dépendance `unpdf`, compatible runtime serveur) puis analyse du texte, découpé si nécessaire ;
4. enregistrement du résultat comme proposition, jamais dans la grille validée.

Aucune écriture dans `produit_garanties` par ce flux.

## 4. Validation humaine (écran)

Nouvel onglet « Garanties » sur la fiche produit (dans l'écran compagnie/produit existant) :

- la grille de la famille affichée ligne par ligne, avec l'état validé actuel ;
- si une proposition IA existe : colonne « proposé » à côté de « validé », l'extrait des CG cliquable, un indicateur de confiance, et acceptation ligne par ligne ou en bloc, chaque valeur restant modifiable à la main avant validation ;
- bouton final « Valider la grille » (admin) qui écrit la grille validée, la version de grille, l'auteur et la date, et marque la proposition acceptée ; bouton « Rejeter la proposition » ;
- bandeau d'avertissement tant que le produit n'a pas de grille validée : « Grille non validée — ce produit ne peut pas alimenter un devoir de conseil » ;
- toute validation et tout rejet sont tracés dans le journal d'audit existant.

Une modification de la version de grille (ajout d'une garantie) repasse le produit en `a_revoir` : la grille reste consultable mais signalée comme incomplète.

## 5. Branchement sur le devoir de conseil (Lot 3)

Le pré-remplissage du devoir de conseil lit la grille **validée** du produit sélectionné sur le dossier, et remplace le texte générique par branche :

- liste des garanties **couvertes** (avec plafonds et franchises réels) ;
- liste explicite des garanties **non couvertes** de la typologie, reprise en mise en garde (cas trottinette : « le vol et les dommages/bris de votre engin ne sont pas couverts par ce contrat ») ;
- les garanties `inconnu` ne sont jamais présentées comme couvertes.

Le texte reste modifiable par le staff avant envoi. Si le produit n'a pas de grille validée, le panneau affiche un avertissement bloquant à l'endroit de la génération : le texte générique actuel reste utilisable mais le rédacteur est averti qu'aucune garantie produit n'est certifiée. Choix par défaut retenu : avertissement fort, sans blocage dur de l'envoi — dis-moi si tu préfères un blocage strict comme pour le score KYC.

## Détails techniques

- Nouveaux fichiers : `src/lib/garanties-grille.ts` (structure + versions), `src/lib/produit-garanties.functions.ts` (server functions : analyser un document, lire propositions, valider/rejeter), `src/lib/produit-garanties-extraction.server.ts` (téléchargement PDF, appel IA, parsing JSON strict), `src/components/produit-garanties-tab.tsx` (écran de validation).
- Migration : tables `produit_garanties` et `produit_garanties_propositions`, avec GRANT, RLS et policies staff/admin, plus index sur `produit_id`.
- IA : passerelle Lovable (`LOVABLE_API_KEY`), modèle Gemini avec entrée PDF, sortie JSON validée par Zod ; aucune écriture si le JSON ne respecte pas le schéma.
- Dépendance ajoutée seulement si nécessaire : `unpdf` pour l'extraction texte de repli.
- Modifications : `src/lib/devoir-conseil.server.ts` et `src/lib/devoir-conseil-modeles.ts` (garanties couvertes/non couvertes issues de la grille), `src/components/devoir-conseil-panel.tsx` (affichage de la source et avertissement), fiche produit de `espace.compagnies.$id.tsx` (onglet Garanties).
