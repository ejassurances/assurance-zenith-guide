# Nomenclatures client / dossier et dossier Drive client

DOMAINE : Socle CRM · MODULE : Clients & Dossiers · SOUS-MODULE : Référencement + intégration Drive

## OBJECTIF
Nouveaux clients `CL-YYYY-NNNN`, nouveaux dossiers `DOX-YYYY-CODE-NNNN`, dossier Drive `[CL-…] - [Prénom] [NOM]` sous le parent `11n0qKaLzMdK95g7AKpjT46TwFC6_vS5P`. Aucun numéro existant réécrit.

## ÉTAT ACTUEL (audit lecture seule)
- Numérotation déjà côté base, sûre contre les collisions : triggers `trg_reference_client` / `trg_reference_dossier` → `generer_reference()` avec compteur atomique `reference_compteurs` (UPSERT).
- Formats actuels : clients `CLI-2026-0025` (25 émis), dossiers `EJ-2026-EMP-0017`, `EJ-2026-TRO-0002`, `EJ-2026-SAN-0001`.
- `code_risque()` : codes actuels PRV (prévoyance), RET/EPA (épargne), SAN (santé)… ne correspondent pas à la liste demandée.
- Numéro de prêt jamais utilisé comme référence dossier (déjà conforme).
- **Drive : le connecteur Google Drive est déjà relié à ce projet** (le CRM crée aujourd'hui `01_CLIENTS/CLI-…_NOM_Prénom` + 6 sous-dossiers, et mémorise `drive_folder_id` / `drive_folder_url` sur la fiche). Il n'y a donc rien à « simuler » : la nouvelle règle est activable immédiatement.

## MODIFICATION PROPOSÉE
1. Migration SQL (dans `supabase/migrations/`) :
   - `code_risque()` : EMP, TRO, PRE (prévoyance), PER (épargne retraite / retraite / epargne_retraite), AVI (assurance vie / epargne), MUT (mutuelle / santé), RCP (RC pro / pro) ; autres branches : code actuel conservé.
   - `generer_reference()` : `CL-YYYY-NNNN` pour les clients, `DOX-YYYY-CODE-NNNN` pour les dossiers ; nouveaux compteurs `CL-2026`, `DOX-EMP-2026`… initialisés à 0 → le premier nouveau client sera `CL-2026-0001` (préfixe différent de `CLI`, donc aucune collision avec l'existant). Index unique de sécurité sur `clients.reference` et `dossiers.reference` s'il n'existe pas.
   - Triggers inchangés dans leur principe (générés côté base, jamais côté interface). Anciennes références conservées.
2. Drive (`src/lib/drive-arborescence.server.ts`) : pour les nouveaux clients `CL-…`, dossier nommé exactement `CL-2026-0001 - Jean DUPONT` créé sous le parent `11n0qKaLzMdK95g7AKpjT46TwFC6_vS5P` (constante), id + URL mémorisés (colonnes existantes). Les clients `CLI-…` gardent leur dossier actuel (plus de renommage automatique). Création déjà branchée à la création manuelle ; ajout au webhook CRM et aux formulaires publics (best-effort, un échec Drive ne bloque jamais la création).
3. Interface : les références sont lues depuis la base, donc affichées automatiquement ; mise à jour des textes/exemples qui citent `CLI-` / `EJ-` et des reconnaissances de référence dans les e-mails pour accepter aussi `DOX-` et `CL-`.

## DÉPENDANCES
Connecteur Google Drive (déjà relié), accès du compte connecté au dossier parent indiqué (à vérifier par un appel de lecture).

## IMPACT
Aucune donnée supprimée ni renommée. Anciens et nouveaux formats coexistent.

## TESTS
Vérification technique ; création d'un client + dossier de test en base → `CL-2026-0001` / `DOX-2026-EMP-0001` ; lecture du dossier parent Drive ; contrôle d'une fiche à l'écran.

## VALEUR PRODUITE
Nomenclature officielle unique, sans collision, et dossier Drive client normé dès la création.

## Point à confirmer
Séquence des nouveaux numéros : repartir à 0001 (proposé) ou continuer après les numéros existants (`CL-2026-0026`, `DOX-2026-EMP-0018`) ?
