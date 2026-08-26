# CD-SI-001-B — LOT 3 — DOSSIER DE CONCEPTION V1.1

Moteur de résolution contextuelle des emails (DETECTED → PROPOSED / AMBIGUOUS)

- Version : V1.1 (intègre intégralement le rapport d'audit technique du dépôt)
- Statut : soumis à audit DG
- Remplace : `docs/CD-SI-001-B-LOT3-DESIGN.md` (V1.0)
- Références : CD-SI-001-B-TECH-V1.2, CD-SI-001-B-DESIGN-V1.1 (+ erratum modèle),
  Lot 1 validé, Lot 2 validé, CD-SI-001-A existant, Audit technique Lot 3
- Aucun code, aucune migration, aucun branchement Gmail dans ce document

---

## 0. VÉRITÉ TECHNIQUE DU DÉPÔT (issue de l'audit)

Toute la conception ci-dessous s'appuie exclusivement sur ces constats vérifiés.

### 0.1 Objets existants

`public.crm_emails` (16 colonnes) : `id` (uuid PK), `gmail_message_id` (text UNIQUE),
`gmail_thread_id`, `direction` (text, def. 'entrant'), `recu_le`, `client_id` → `clients(id)`
ON DELETE SET NULL, `dossier_id` → `dossiers(id)` SET NULL, `contrat_id` → `contrats(id)` SET NULL,
`compagnie_id` → `compagnies(id)` SET NULL, `notes`, `created_by` → `auth.users(id)`,
`created_at`, `updated_at`, `triage_ia` (jsonb), `triage_le` (timestamptz),
`ai_context` (jsonb NOT NULL DEFAULT `'{}'::jsonb`).

Index : PK(id), UNIQUE(gmail_message_id), GIN(ai_context), btree(client_id), btree(compagnie_id),
btree(contrat_id), btree(dossier_id). RLS : policy unique « Staff gere les emails CRM »
(admin ou mandataire, USING + WITH CHECK). Trigger `update_crm_emails_updated_at`.

Tables métier réelles utilisables : `clients`, `compagnies`, `contrats`, `dossiers`,
`produits` (+ `produit_familles`, `produit_formules`, `produit_garanties`), `documents`,
`doc_extractions`, `taches`.

### 0.2 Objets absents (confirmés)

- Tables : `prospects`, `organisations`, `crm_tasks`, `catalogue_produits`, `crm_emails_attachments`.
- Colonnes : `crm_emails.status`, `crm_emails.ai_metadata`, `prospect_id`, `organisation_id`, `company_id`.
- Fonctions/RPC : `fn_match_email_sender` (aucune fonction publique de matching expéditeur).

### 0.3 Substitutions imposées

| Objet cité par la documentation | Objet réel à utiliser |
|---|---|
| `fn_match_email_sender` | logique applicative CD-SI-001-A (`src/lib/emails-agents.server.ts` → `rattacherLot()`, `src/lib/email-triage.server.ts`) |
| `crm_emails.status` | libellé Gmail (« A valider » / « Archives ») + statut métier dans `triage_ia` |
| `crm_tasks` | `public.taches` — HORS PÉRIMÈTRE du Lot 3 |
| `prospect_id` / table `prospects` | `clients.statut = 'prospect'` (enum `client_statut`) |
| `organisation_id` / `company_id` | `crm_emails.compagnie_id`, `contrats.compagnie_id` |
| `catalogue_produits` | `public.produits` |
| `crm_emails_attachments` | `documents` / `doc_extractions` (interfaces CD-SI-002) |
| `ai_metadata` | inexistant ; ne pas créer |

### 0.4 Contradictions DESIGN ↔ CODE prises en compte

1. `gemini-1.5-flash` → passerelle IA du projet avec repli Gemini Flash (erratum enregistré). Sans effet sur le Lot 3, qui n'appelle aucun modèle.
2. Moteur de matching « central » supposé : le dépôt a plusieurs implémentations dispersées. Le Lot 3 ne les refactore pas et n'en crée pas un second (règle 5).
3. `schema_version` : le schéma validé fige `"1.1.0"` ; le Lot 3 conserve cette valeur (règle 13).

---

## 1. PÉRIMÈTRE ET POSITION DANS LA TRAJECTOIRE

```text
LOT 1  Ingestion & schéma            ai_context, JSON Schema 1.1.0, types, validateur     [VALIDÉ]
LOT 2  Extraction Gemini             DETECTED, propositions textuelles, aucune FK         [VALIDÉ]
LOT 3  Résolution / proposition      DETECTED -> PROPOSED / AMBIGUOUS, ai_context seul    [CE LOT]
LOT 4  Preuves déterministes         règles de preuve, CONFIRMED, écritures FK maîtresses
LOT 5  Articulation CD-SI-002        exploitation approfondie documents / doc_extractions
LOT 6  Qualification humaine         IHM de validation, tâches (taches), arbitrages
LOT 7  Recette globale               recette de bout en bout et validation DG finale
```

Le Lot 3 est **un moteur de résolution contextuelle en lecture seule sur le métier**, dont la seule
écriture autorisée est `crm_emails.ai_context`.

### 1.1 Flux normatif

```text
ai_context (statut DETECTED, produit par le Lot 2)
   -> lecture des référentiels métier (clients, dossiers, contrats, compagnies, produits, documents)
   -> recherche de candidats (déterministe, sans IA)
   -> croisement des preuves (preuves du Lot 2 + concordances BDD)
   -> décision par entité : PROPOSED (candidat unique suffisamment étayé) ou AMBIGUOUS
   -> écriture exclusive dans crm_emails.ai_context
```

---

## 2. MATRICE DE CONCEPTION (règle 17)

### 2.1 Entrées

| Entrée | Source | Nature |
|---|---|---|
| `emailId` | appelant (job / action staff) | uuid `crm_emails.id` |
| `ai_context` courant | `crm_emails.ai_context` | contexte DETECTED du Lot 2 |
| `correspondant.email` / `nom_affiche` | `ai_context` (Lot 2) | texte |
| `personnes_detectees[]` | `ai_context` | nom, prénom, email, téléphone, date de naissance |
| `dossiers_detectes[]` | `ai_context` | `reference_citee` |
| `contrats_detectes[]` | `ai_context` | `numero_police`, `compagnie_citee` |
| `produits_cites[]` | `ai_context` | `libelle`, `famille` |
| `documents_associes[]` | `ai_context` | `nom_fichier`, `type_detecte` |
| `preuves[]` | `ai_context` | extraits textuels et poids |
| Rattachement direct CD-SI-001-A | `crm_emails.client_id` / `compagnie_id` s'ils sont déjà posés | **lecture seule**, utilisé comme signal de concordance |

Entrée invalide (contexte non conforme au validateur du Lot 1, `ai_context = '{}'`, statut absent) :
le Lot 3 ne fait rien et retourne un motif — aucune écriture.

### 2.2 Lectures BDD autorisées (aucune écriture)

| Table | Colonnes lues | Usage |
|---|---|---|
| `clients` | id, reference, nom, prenom, email, email2, telephone, date_naissance, statut, marque | candidats personne / correspondant ; `statut='prospect'` distingue le prospect |
| `dossiers` | id, reference, client_id, type_assurance, statut | candidats dossier |
| `contrats` | id, numero, client_id, dossier_id, compagnie_id, produit_id, statut | candidats contrat |
| `compagnies` | id, nom, contact_email, site_web, statut | candidats compagnie |
| `produits` | id, nom, code_produit, compagnie_id, famille_id, statut | candidats produit |
| `produit_familles` | id, code, libelle | rapprochement de famille |
| `documents` | id, client_id, dossier_id, contrat_id, nom, type, classification | corrélation pièce jointe ↔ entité (via CD-SI-002) |
| `doc_extractions` | document_id, statut, données extraites exposées | renfort de preuve documentaire |

Accès via le client privilégié serveur existant (`@/integrations/supabase/client.server`), chargé
à l'intérieur du handler. Aucune nouvelle vue, RPC ou fonction.

### 2.3 Transformations (résolution déterministe, sans IA)

Pour chaque famille d'entité, la recherche de candidats est **déterministe** et normalisée
(minuscules, trim, suppression des accents, comparaison de domaine pour les emails, normalisation
des références et numéros de police en supprimant espaces et séparateurs).

| Entité `ai_context` | Clés de rapprochement | Cible |
|---|---|---|
| `correspondant` | email exact (`clients.email`, `clients.email2`) ; à défaut domaine (`compagnies.contact_email`, `compagnies.site_web`) | `client_id` proposé ou `compagnie_id` proposé |
| `personnes_detectees[]` | email exact > téléphone normalisé > (nom + prénom) > (nom + date de naissance) | `client_id_propose` |
| `dossiers_detectes[]` | `reference_citee` normalisée = `dossiers.reference` ; sinon dossiers du client candidat compatibles avec la branche citée | `dossier_id_propose` |
| `contrats_detectes[]` | `numero_police` normalisé = `contrats.numero` ; sinon contrats du client/dossier candidat, filtrés par compagnie citée | `contrat_id_propose` |
| `produits_cites[]` | `code_produit` exact > `nom` normalisé > famille + compagnie | `produit_id_propose` |
| `documents_associes[]` | `nom_fichier` ↔ `documents.nom`, type détecté ↔ classification, cohérence des FK du document avec les candidats retenus | `document_id_propose` |

**Croisement des preuves.** Chaque candidat reçoit un faisceau de concordances, chacune tracée par
une preuve : identifiant fort (référence, numéro de police, email exact), identifiant moyen
(téléphone, nom + date de naissance), identifiant faible (nom seul, libellé produit approché),
cohérence relationnelle (le dossier candidat appartient au client candidat ; le contrat candidat
appartient au dossier candidat ; le produit candidat appartient à la compagnie citée), et
concordance avec le rattachement direct CD-SI-001-A lorsqu'il existe.

**Règle de décision par entité** (aucun `CONFIRMED`, règle 3) :

| Situation | Statut écrit | `*_id_propose` |
|---|---|---|
| Exactement un candidat, appuyé par au moins un identifiant fort ou deux concordances indépendantes cohérentes | `PROPOSED` | uuid du candidat |
| Plusieurs candidats retenus | `AMBIGUOUS` (une entrée par candidat, règle 14) | uuid de chaque candidat |
| Un seul candidat mais concordance faible ou incohérence relationnelle | `AMBIGUOUS` | uuid du candidat |
| Aucun candidat | l'entrée reste `DETECTED` | `null` |
| Entité citée hors référentiel (personne inconnue, contrat externe) | `A_QUALIFIER` | `null` |

La cohérence globale n'est jamais forcée : si deux entités proposent des rattachements
contradictoires (contrat d'un client A, dossier d'un client B), les deux restent `AMBIGUOUS` et une
ambiguïté `donnees_contradictoires` est émise. Le Lot 3 ne tranche pas.

### 2.4 Sorties `ai_context`

Le Lot 3 réécrit uniquement les champs suivants, en conservant les textes et les preuves du Lot 2 :

- `schema_version` : inchangé, `"1.1.0"`.
- `correspondant` : `client_id` **proposé** (avec `statut = PROPOSED|AMBIGUOUS`), `compagnie_id`
  proposée, `role_suppose` (`client` / `prospect` selon `clients.statut`, `compagnie`, `inconnu`),
  `confiance`, `provenance.source = "regle_deterministe"`.
- `personnes_detectees[]`, `dossiers_detectes[]`, `contrats_detectes[]`, `produits_cites[]`,
  `documents_associes[]` : `*_id_propose` renseigné, `statut` par entrée, `confiance`,
  `provenance` (`source: "regle_deterministe"`, `champ`, `detecte_le`, `preuve_ids`).
- `preuves[]` : preuves du Lot 2 conservées + preuves de concordance ajoutées
  (`type: "reference_explicite" | "email_expediteur" | "signature" | "piece_jointe" | "autre"`,
  `cible` = entité et candidat visés, `poids`).
- `ambiguities[]` : `client_multiple`, `dossier_multiple`, `contrat_multiple`, `personne_inconnue`,
  `confiance_insuffisante`, `donnees_contradictoires`, avec `candidats[]` et
  `resolution_requise: true`.
- `analyse` : `statut` global = `PROPOSED` si au moins une entité `PROPOSED` et aucune ambiguïté
  bloquante ; `AMBIGUOUS` si au moins une ambiguïté requiert une résolution ; sinon `A_QUALIFIER`.
  `confiance_globale`, `analyse_le`, `validation_humaine_requise` (true dès qu'une entité n'est pas
  `PROPOSED`), `provenance.source = "regle_deterministe"`. `validated_by` / `validated_at` ne sont
  jamais écrits par le Lot 3. `modele` conserve la trace du Lot 2 lorsqu'elle existe.

Le contexte final est **systématiquement validé par le validateur du Lot 1** avant persistance ;
un contexte non conforme n'est pas écrit.

### 2.5 Écritures interdites (règles 2, 3, 4, 10, 11, 16)

| Interdiction | Portée |
|---|---|
| `crm_emails.client_id`, `dossier_id`, `contrat_id`, `compagnie_id` | jamais écrites, aucune exception |
| `crm_emails.triage_ia`, `triage_le`, `notes`, `direction` | jamais modifiées |
| Libellés Gmail, threads, API Gmail | aucun appel |
| `taches` | aucune création, mise à jour ni lecture décisionnelle |
| `clients` (dont création de prospect), `dossiers`, `contrats`, `produits`, `compagnies` | lecture seule stricte |
| `documents`, `doc_extractions` | lecture seule stricte |
| Statut `CONFIRMED` | jamais produit |
| Schéma JSON, validateur, types du Lot 1 | non modifiés, non dupliqués |
| Nouvelles tables / colonnes / RPC / fonctions / index | aucun |

Contrôle d'étanchéité attendu à l'implémentation : un seul `.update({ ai_context })` sur
`crm_emails`, aucun `insert`, `upsert`, `delete` ou `rpc` dans le périmètre du Lot 3.

### 2.6 Dépendances réelles

- Lot 1 : `src/lib/schemas/email-context-v1.2.json` (`schema_version` const `"1.1.0"`),
  `src/lib/email-context-schema.ts` (`lireContexteEmail`), `src/lib/email-context-types.ts`.
- Lot 2 : `src/lib/email-context-analyzer.server.ts` — gardes `peutEcrireContexte()` et écriture
  ciblée `persisterContexteEmail()` à réutiliser, sans les modifier fonctionnellement.
- CD-SI-001-A : reste propriétaire du correspondant direct (`rattacherLot()`), consommé en lecture.
- CD-SI-002 : `documents` / `doc_extractions`, consommés via les interfaces existantes.
- Base : `clients`, `dossiers`, `contrats`, `compagnies`, `produits`, `produit_familles`,
  index GIN sur `ai_context` pour les reprises, index btree existants pour les jointures.

### 2.7 Gestion des erreurs

| Cas | Comportement |
|---|---|
| Email introuvable | aucune écriture, motif `email_introuvable` |
| `ai_context` vide ou non conforme au Lot 1 | aucune écriture, motif `contexte_absent` / `contexte_non_conforme` |
| Statut courant non `DETECTED` | aucune écriture, motif `statut_non_eligible` |
| Erreur de lecture d'un référentiel | résolution partielle : les entités non résolues restent `DETECTED`, ambiguïté `confiance_insuffisante`, aucune FK, aucun `CONFIRMED` |
| Contexte produit non conforme au schéma | rejet avant persistance, contexte existant intact |
| Volumétrie de candidats trop élevée | plafond de candidats documenté, entité `AMBIGUOUS`, multiplicité tracée dans `ambiguities.description` |
| Contradiction entre entités | conservation des deux propositions, ambiguïté `donnees_contradictoires` |

Aucun cas d'erreur ne produit de FK, de `CONFIRMED`, de tâche, de prospect, de contrat ni de produit.

### 2.8 Idempotence (règle 15)

- Réutilisation des gardes du Lot 2 : refus d'écrasement si `analyse.validated_at` /
  `validated_by` sont présents, si `analyse.statut` est `CONFIRMED`, ou si
  `analyse.provenance.source = "humain"`.
- Le Lot 3 ne s'applique qu'à un contexte `DETECTED` ; un contexte déjà `PROPOSED` ou `AMBIGUOUS`
  par le Lot 3 n'est ré-résolu que sur demande explicite `force`, et jamais s'il porte une trace
  humaine ou un `CONFIRMED`.
- La résolution est déterministe : à référentiel constant, deux exécutions produisent le même
  contexte (hors `analyse_le` / `detecte_le`).
- Aucun doublon possible : écriture par mise à jour d'une ligne existante identifiée par `id`.

### 2.9 Multi-candidats (règle 14)

Convention imposée, sans évolution du schéma 1.1.0 :

1. une entrée par candidat dans le tableau d'entité concerné, chacune avec son `*_id_propose` ;
2. `statut: "AMBIGUOUS"` sur chaque entrée concernée ;
3. une ambiguïté dédiée (`client_multiple`, `dossier_multiple`, `contrat_multiple`) listant les
   candidats dans `candidats[]` avec `resolution_requise: true` ;
4. corrélation candidat ↔ preuve assurée par `provenance.preuve_ids` et `preuves[].cible`.

**Perte d'information assumée et documentée** : le schéma 1.1.0 ne porte ni score par candidat
structuré, ni typage d'entité dans `ambiguities.candidats`, ni regroupement explicite « ces N
entrées désignent la même entité » ; cette corrélation reste implicite (via les ambiguïtés). Toute
évolution vers des candidats structurés et scorés fera l'objet d'un lot séparé d'évolution de
schéma, hors Lot 3.

### 2.10 Tests unitaires attendus

1. Correspondant résolu par email exact → `PROPOSED`.
2. Correspondant résolu par domaine compagnie → compagnie `PROPOSED`.
3. Client `statut = 'prospect'` → `role_suppose = "prospect"`, aucune création.
4. Personne résolue par nom + date de naissance → `PROPOSED`.
5. Personne inconnue du référentiel → `A_QUALIFIER`, `client_id_propose = null`.
6. Dossier résolu par référence explicite → `PROPOSED`.
7. Référence de dossier inconnue → reste `DETECTED`.
8. Contrat résolu par numéro de police → `PROPOSED`.
9. Deux clients homonymes → deux entrées `AMBIGUOUS` + `client_multiple`.
10. Deux contrats candidats → deux entrées `AMBIGUOUS` + `contrat_multiple`.
11. Produit résolu par `code_produit`, puis par nom, puis par famille + compagnie.
12. Document corrélé via `documents` / `doc_extractions`.
13. Contradiction contrat/dossier → `donnees_contradictoires`, aucune décision.
14. Contexte non `DETECTED` → aucune écriture.
15. Contexte portant une validation humaine → refus d'écriture.
16. Contexte `CONFIRMED` → refus d'écriture.
17. Sortie toujours conforme au validateur du Lot 1 ; `schema_version = "1.1.0"`.
18. Aucun statut `CONFIRMED` produit, quel que soit le scénario.
19. Idempotence : double exécution → contexte identique hors horodatages.
20. Erreur de lecture référentiel → résolution partielle sans FK ni `CONFIRMED`.

### 2.11 Tests d'intégration attendus

1. Email réel `DETECTED` → résolution → `ai_context` mis à jour, `crm_emails.client_id`,
   `dossier_id`, `contrat_id`, `compagnie_id` inchangés (comparaison avant/après).
2. `triage_ia` et `triage_le` strictement inchangés.
3. Aucune ligne créée ou modifiée dans `clients`, `dossiers`, `contrats`, `produits`, `taches`,
   `documents`, `doc_extractions` (comptages et empreintes avant/après).
4. Email déjà rattaché par CD-SI-001-A : le rattachement direct est lu, jamais réécrit.
5. Email avec pièce jointe classifiée par CD-SI-002 : corrélation documentaire proposée sans
   modification du document.
6. Reprise en masse : un lot d'emails `DETECTED` traité sans doublon ni régression Gmail.
7. Non-régression : suites du Lot 1 et du Lot 2 vertes après ajout du Lot 3.

### 2.12 Critères GO / NO-GO du Lot 3

**GO** si et seulement si :

- aucune FK maîtresse de `crm_emails` n'est écrite ;
- aucun `CONFIRMED` n'est produit ;
- aucune tâche, aucun prospect, aucun contrat, aucun produit, aucun document n'est créé ou modifié ;
- `triage_ia`, `triage_le` et les libellés Gmail sont intacts ;
- le schéma, le validateur et les types du Lot 1 sont inchangés et `schema_version` reste `"1.1.0"` ;
- tout contexte écrit passe le validateur du Lot 1 ;
- les gardes d'idempotence du Lot 2 sont respectées ;
- la convention multi-candidats est appliquée telle que définie en 2.9 ;
- les suites de tests unitaires et d'intégration ci-dessus sont vertes, non-régression comprise.

**NO-GO** si l'un des points ci-dessus est enfreint, ou si l'implémentation crée un second moteur
de matching expéditeur, une table, une colonne, une RPC, une fonction ou une migration.

---

## 3. MIGRATIONS — AUCUNE DANS LE LOT 3

Le Lot 3 ne nécessite **aucune** migration. Les pistes suivantes sont mentionnées pour mémoire et
restent hors périmètre, à arbitrer par la DG dans des lots dédiés :

1. évolution du schéma vers des candidats structurés et scorés (impacte Lots 1 et 2) ;
2. index d'appariement en lecture (`lower(clients.email)`, `lower(clients.email2)`,
   `dossiers.reference`, `contrats.numero`) — performance uniquement ;
3. rattachement `taches` ↔ email source, utile au Lot 6.

---

## 4. RISQUES ET ÉCARTS RÉSIDUELS

| Risque / écart | Traitement dans le Lot 3 |
|---|---|
| Documentation citant des objets inexistants (`fn_match_email_sender`, `crm_emails.status`, `crm_tasks`, `prospect_id`, `organisation_id`, `company_id`, `catalogue_produits`, `crm_emails_attachments`, `ai_metadata`) | substitutions figées en 0.3 ; aucune interprétation silencieuse |
| Perte d'information multi-candidats du schéma 1.1.0 | convention 2.9, actée ; évolution renvoyée à un lot séparé |
| Logique de matching CD-SI-001-A dispersée dans le dépôt | consommée en lecture, non refactorée, non dupliquée |
| Homonymies et emails partagés (famille, entreprise) | jamais tranchés : `AMBIGUOUS` + ambiguïté explicite |
| Interfaces CD-SI-002 encore partielles | corrélation documentaire dégradée proprement, jamais inventée ; approfondissement au Lot 5 |
| Volumétrie des référentiels lus | lectures ciblées et plafonnées ; index existants ; pas de nouvel index dans ce lot |

---

🟢 DESIGN LOT 3 V1.1 PRÊT POUR AUDIT DG
