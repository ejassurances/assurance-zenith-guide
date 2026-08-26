# CD-SI-001-B — LOT 4 — DESIGN V1.0

**MODÈLE DE PREUVES, CONVERGENCE ET ÉCRITURE SÉCURISÉE DES FK**

Statut : dossier de conception. Aucune implémentation, aucune migration, aucune écriture de FK, aucun branchement Gmail, aucun appel Gemini.

---

## A. Objet

Définir les conditions **exhaustives et restrictives** dans lesquelles une proposition déterministe produite par le Lot 3 dans `public.crm_emails.ai_context` pourra, **dans un lot ultérieur d'implémentation**, être transformée en écriture des clés étrangères maîtresses de `public.crm_emails` :

- `client_id`
- `dossier_id`
- `contrat_id`
- `compagnie_id`

Le Lot 4 est une **couche de sécurité**, pas une couche d'automatisation. Sa finalité première est de **refuser** les écritures, et d'autoriser uniquement le sous-ensemble strictement démontrable.

Le Lot 4 ne définit **aucune** création d'entité (client, prospect, contrat, produit, document), **aucune** création de tâche, **aucune** modification de `triage_ia` / `triage_le`, **aucune** IHM.

---

## B. Référentiels

| Référence | Nature | Usage |
|---|---|---|
| CD-SI-001-B-TECH-V1.2 | Spécification technique validée DG | Cadre général du module |
| CD-SI-001-B-DESIGN-V1.1 + `docs/CD-SI-001-B-DESIGN-V1.1-erratum-modele.md` | Conception validée + erratum modèle Gemini | Doctrine d'extraction, modèle Flash de la passerelle IA avec repli |
| `docs/CD-SI-001-B-LOT3-DESIGN-V1.2.md` | Conception Lot 3 validée (GO FERME) | Doctrine N1–N9, contradictions, convergence |
| Rapport d'audit final DG Lot 3 | Audit code | Étanchéité, type safety, plafonds de lecture, `documents.file_name` |
| Code Lot 1 | `src/lib/email-context-types.ts`, `email-context-schema.ts`, JSON Schema | Schéma `ai_context` v1.1.0, validateur |
| Code Lot 2 | `src/lib/email-context-extraction.ts`, `email-context-analyzer.server.ts` | Production du contexte `DETECTED` |
| Code Lot 3 | `src/lib/email-context-resolution.ts`, `email-context-resolver.server.ts` | Preuves, résolution, sorties `PROPOSED` / `AMBIGUOUS` / `DETECTED` |
| Schéma PostgreSQL réel | Inspection lecture seule | Colonnes, types, FK, `ON DELETE` |

### B.1 Réalité base de données (vérifiée, non inventée)

`public.crm_emails` — colonnes pertinentes :

| Colonne | Type | Nullable |
|---|---|---|
| `id` | uuid | NO |
| `client_id` | uuid | YES |
| `dossier_id` | uuid | YES |
| `contrat_id` | uuid | YES |
| `compagnie_id` | uuid | YES |
| `triage_ia` | jsonb | YES |
| `triage_le` | timestamptz | YES |
| `ai_context` | jsonb | **NO** (défaut `'{}'::jsonb`) |

Contraintes FK réelles de `public.crm_emails` :

```
crm_emails_client_id_fkey     FOREIGN KEY (client_id)     REFERENCES clients(id)     ON DELETE SET NULL
crm_emails_dossier_id_fkey    FOREIGN KEY (dossier_id)    REFERENCES dossiers(id)    ON DELETE SET NULL
crm_emails_contrat_id_fkey    FOREIGN KEY (contrat_id)    REFERENCES contrats(id)    ON DELETE SET NULL
crm_emails_compagnie_id_fkey  FOREIGN KEY (compagnie_id)  REFERENCES compagnies(id)  ON DELETE SET NULL
```

Tables réelles utilisables : `clients`, `dossiers`, `contrats`, `compagnies`, `produits`, `documents`, `doc_extractions`.

Points factuels à respecter :

- `public.contrats` possède la colonne **`numero`** ; il n'existe **pas** de colonne `numero_police` en base. `numero_police` est le champ **de l'extraction Lot 2** dans `ai_context.contrats_detectes[].numero_police`.
- `public.documents` possède **`file_name`** ; il n'existe pas de colonne `nom`.
- Le statut « prospect » est un état de `clients.statut` (`client_statut = 'prospect'`). Il n'existe pas de table `prospects`.
- Il n'existe pas de `company_id`, ni d'`organisation_id`, ni de `crm_emails.status`, ni de `crm_emails.ai_metadata`.
- Aucune table absente du dépôt ne peut être une dépendance obligatoire du Lot 4.

---

## C. Architecture

### C.1 Séparation des responsabilités

```
LOT 2  (validé)  extraction Gemini            -> ai_context statut DETECTED
LOT 3  (validé)  croisement déterministe      -> ai_context statut PROPOSED / AMBIGUOUS / DETECTED
LOT 4  (ce doc)  CONCEPTION de l'autorisation d'écriture des FK
LOT n+ (futur)   IMPLÉMENTATION des écritures, si et seulement si autorisée par DG
```

Le Lot 4 introduit conceptuellement **trois composants** dont l'implémentation est différée :

1. **Évaluateur d'autorisation (pur, sans base)** — entrée : `ai_context` validé Lot 1 + état actuel des FK de la ligne email ; sortie : une **décision d'écriture** par FK (`ECRIRE` / `REFUSER` avec motif), sans aucun accès réseau ni base.
2. **Applicateur (couche serveur)** — seul composant autorisé, dans un lot ultérieur, à exécuter un `UPDATE public.crm_emails SET client_id/dossier_id/contrat_id/compagnie_id`, accompagné de la mise à jour de traçabilité dans `ai_context`.
3. **Journal de décision** — porté **exclusivement** par `ai_context` (`analyse.modifications_apportees`, `analyse.provenance`, `preuves[]`, `ambiguities[]`). Aucune nouvelle table, aucune nouvelle colonne, aucun nouveau champ JSON hors schéma 1.1.0.

### C.2 Invariant d'entrée

Le Lot 4 ne consomme qu'un `ai_context` **validé par le validateur Lot 1**, de `schema_version = "1.1.0"`, dont `analyse.statut` vaut `PROPOSED`. Tout autre statut (`DETECTED`, `AMBIGUOUS`, `A_QUALIFIER`) ne peut produire aucune écriture automatique.

`CONFIRMED` n'est jamais produit par une décision automatique : il ne peut résulter que d'une validation humaine explicite (section K).

---

## D. Matrice des preuves (doctrine N1–N9, inchangée)

| Niveau | Définition | Déterministe | Peut porter seul une écriture |
|---|---|---|---|
| **N1** | Référence dossier explicite citée, correspondance **exacte et unique** sur `dossiers.reference` (ou UUID direct valide) | Oui | Oui — `dossier_id` |
| **N2** | Email expéditeur en correspondance **exacte et unique** sur `clients.email` / `clients.email2` | Oui | Oui — `client_id` |
| **N3** | Numéro de police cité en correspondance **exacte et unique** sur `contrats.numero` | Oui | Oui — `contrat_id` |
| **N4** | Compagnie / logique partenaire : domaine d'email professionnel en correspondance **exacte et unique** sur `compagnies.contact_email` / `compagnies.site_web` | Oui | Oui — `compagnie_id` uniquement |
| **N5** | Personne citée avec email **ou** téléphone, correspondance exacte et unique | Partiel | **Non** seul (voir F.3) |
| **N6** | Preuve documentaire : `documents` (`file_name`) déjà rattaché portant `client_id` / `dossier_id` / `contrat_id` | Partiel | **Non** seul, sauf corroboration (voir D.2) |
| **N7** | Nom / prénom cité seul | Non | **Jamais** |
| **N8** | Historique relationnel (rattachements déjà posés sur la ligne email) | Non | **Jamais** |
| **N9** | Dossier unique actif du client — **facteur contextuel uniquement** | Non | **Jamais** |

### D.1 Interdits doctrinaux

- Aucune **promotion** de N7, N8 ou N9, même par accumulation, même multiple, même « cohérente ».
- Aucun **scoring**, aucune **pondération**, aucune **somme** ni **moyenne** de signaux.
- `preuves[].poids` : **ni lu ni écrit** à des fins décisionnelles. Il reste un champ descriptif hérité, sans effet.
- `analyse.confiance_globale` et `confiance` d'entité : **descriptifs**. Aucun seuil de confiance ne peut à lui seul autoriser une écriture de FK.
- La convergence de plusieurs signaux faibles ne crée jamais un signal fort.

### D.2 Corroboration (seul mécanisme de renforcement admis)

La corroboration n'est pas un score : c'est une **condition de cohérence**. Une preuve N5 ou N6 ne devient éligible à une écriture que si :

1. elle est **exacte et unique** dans son référentiel exhaustif ; **et**
2. elle **converge** avec au moins une preuve de niveau N1–N4 désignant la **même** entité ou une entité liée par rebond légitime (section H.2) ; **et**
3. aucune contradiction n'existe (section J).

Une corroboration entre deux signaux faibles (N5+N6, N6+N7, N7+N8, N8+N9…) **n'autorise aucune écriture**.

### D.3 Exhaustivité obligatoire

Conformément au Lot 3, tout référentiel dont l'exhaustivité n'est pas garantie (lecture potentiellement tronquée) rend l'entité concernée **ambiguë** : `propose = null`, aucune écriture. Le Lot 4 hérite de cette règle sans l'assouplir : **une liste non exhaustive interdit toute écriture** sur la FK correspondante, y compris si un candidat unique apparaît.

---

## E. Matrice FK

Légende des modes :
- **preuve directe** : la preuve désigne immédiatement l'entité de la FK.
- **preuve par rebond** : l'entité est déduite d'une entité déterminée par preuve directe, via une FK **réelle** en base.
- **proposition** : valeur inscrite dans `ai_context` (Lot 3), sans écriture de FK.
- **confirmation** : validation humaine explicite (section K).
- **impossibilité** : aucune écriture, quelle que soit la convergence.

### E.1 `client_id` → `clients.id`

| Aspect | Règle |
|---|---|
| Preuve directe autorisée | **N2** (email expéditeur exact et unique sur `clients.email` / `email2`) |
| Preuve par rebond autorisée | Depuis `contrat_id` écrit par **N3** → `contrats.client_id` ; depuis `dossier_id` écrit par **N1** → `dossiers.client_id` |
| Conditions cumulatives | référentiel `clients` exhaustif ; candidat unique ; UUID existant ; `crm_emails.client_id` actuellement `NULL` ; contexte `PROPOSED` ; aucune validation humaine antérieure ; aucune contradiction |
| Interdictions | N5 seul, N6 seul, N7, N8, N9, homonymie, téléphone non unique, mention documentaire seule, convergence IA, création de client ou de prospect |
| Contradiction | client A ≠ client B, ou rebond contrat/dossier désignant un client différent de N2 → **aucune écriture**, `AMBIGUOUS` |
| Validation humaine | Peut autoriser toute valeur existante ; renseigne `validated_by` / `validated_at` ; seule voie vers `CONFIRMED` |

### E.2 `dossier_id` → `dossiers.id`

| Aspect | Règle |
|---|---|
| Preuve directe autorisée | **N1** (référence `dossiers.reference` exacte et unique, ou UUID direct existant) |
| Preuve par rebond autorisée | Depuis `contrat_id` écrit par **N3** → `contrats.dossier_id`, **si non NULL** et si le client du dossier est cohérent avec `client_id` retenu |
| Conditions cumulatives | référentiel `dossiers` exhaustif ; candidat unique ; UUID existant ; `crm_emails.dossier_id` actuellement `NULL` ; contexte `PROPOSED` ; aucune contradiction |
| Interdictions | **N9 (dossier unique actif) seul — interdiction absolue** ; N5, N6, N7, N8 seuls ; déduction « le client n'a qu'un dossier » ; choix du dossier le plus récent ; choix du dossier le plus avancé |
| Contradiction | dossier A ≠ dossier B ; dossier dont `client_id` diffère du client retenu → **aucune écriture**, `AMBIGUOUS` |
| Validation humaine | Requise pour tout rattachement non couvert par N1 ou le rebond N3 |

### E.3 `contrat_id` → `contrats.id`

| Aspect | Règle |
|---|---|
| Preuve directe autorisée | **N3** (`ai_context.contrats_detectes[].numero_police` en correspondance **exacte et unique** sur `contrats.numero`) |
| Preuve par rebond autorisée | **Aucune.** Un contrat n'est jamais déduit d'un client, d'un dossier ni d'une compagnie |
| Conditions cumulatives | référentiel `contrats` exhaustif ; correspondance exacte (aucune correspondance partielle, approchée ou normalisée au-delà d'un trim/casse documenté) ; candidat unique ; UUID existant ; `crm_emails.contrat_id` actuellement `NULL` ; contexte `PROPOSED` ; aucune contradiction |
| Interdictions | contrat unique du client ; contrat le plus récent ; contrat le plus probable ; N5–N9 ; **confusion numéro métier / UUID** (section H.1) |
| Contradiction | plusieurs contrats correspondant au numéro cité ; plusieurs numéros cités désignant des contrats différents ; contrat dont `client_id` contredit le client retenu → **aucune écriture**, `AMBIGUOUS` |
| Validation humaine | Requise en multi-contrats et pour tout cas non strictement N3 |

### E.4 `compagnie_id` → `compagnies.id`

| Aspect | Règle |
|---|---|
| Preuve directe autorisée | **N4** (domaine professionnel de l'expéditeur en correspondance exacte et unique sur `compagnies.contact_email` / `compagnies.site_web`) |
| Preuve par rebond autorisée | Depuis `contrat_id` écrit par **N3** → `contrats.compagnie_id`, **si non NULL** |
| Conditions cumulatives | référentiel `compagnies` **exhaustif** (pagination complète ; garde atteinte ⇒ interdiction) ; candidat unique ; UUID existant ; `crm_emails.compagnie_id` actuellement `NULL` ; contexte `PROPOSED` ; aucune contradiction |
| Interdictions | domaine générique / grand public ; compagnie citée en texte libre sans correspondance exacte ; déduction depuis un produit ; déduction depuis un client ; usage de `company_id` / `organisation_id` / `compagnie_id_propose` (inexistants) |
| Contradiction | compagnie A (N4) ≠ compagnie B (rebond contrat) → **aucune écriture**, `AMBIGUOUS` |
| Validation humaine | Requise dans tous les autres cas ; l'écriture de `crm_emails.compagnie_id` est traitée **séparément** de la proposition `ai_context.correspondant.compagnie_id` |

### E.5 Produit

`public.crm_emails` **ne possède pas** de colonne `produit_id`. Aucune écriture de FK produit n'existe ni ne sera conçue. Un produit reste une **proposition** dans `ai_context.produits_cites[].produit_id_propose`. Le rebond `contrat → produit` sert uniquement à enrichir le contexte, jamais une FK.

---

## F. Règles client

**F.1 Prospect.** Un « prospect » est une ligne de `public.clients` avec `statut = 'prospect'`. Il n'existe aucune table dédiée. Le Lot 4 **n'autorise jamais** la création automatique d'un client ni d'un prospect, quel que soit le niveau de preuve. Un correspondant inconnu reste inconnu : `client_id` demeure `NULL` et l'email est marqué à qualifier.

**F.2 Rattachement autorisé.** Uniquement :
- N2 : email expéditeur (ou email d'une personne détectée) en correspondance exacte, insensible à la casse, **unique** sur `clients.email` ou `clients.email2` ; ou
- rebond depuis `contrat_id` (N3) via `contrats.client_id` ; ou
- rebond depuis `dossier_id` (N1) via `dossiers.client_id` ; ou
- validation humaine explicite.

**F.3 Cas N5.** Une personne citée avec email ou téléphone n'autorise une écriture de `client_id` **que si** la correspondance est exacte et unique **et** corroborée par N1–N4 désignant le même client (D.2). Le téléphone seul, même unique, ne suffit jamais : format non normalisé en base, risque de numéro partagé (foyer, entreprise).

**F.4 Interdictions explicites.** Nom seul (N7) ; nom + prénom ; homonymie totale ou partielle ; téléphone ambigu ou multi-porteur ; mention dans un document non rattaché ; convergence IA ; confiance élevée ; domaine d'email personnel partagé (`gmail.com`, etc.) ; correspondance sur un email d'un tiers (conjoint, courtier, notaire) sans rôle établi.

**F.5 Rôle du correspondant.** Un email provenant d'une compagnie ou d'un partenaire ne peut jamais écrire `client_id` par le seul fait qu'un client est cité dans le corps : la citation d'un client par un tiers relève de N7 ou de N5 non corroboré.

---

## G. Règles dossier

**G.1** `dossier_id` ne peut être écrit que par N1 (référence exacte et unique / UUID existant) ou par rebond depuis un `contrat_id` écrit par N3.

**G.2 N9 — dossier unique actif.** Réaffirmation formelle : N9 est un **facteur contextuel**. Il ne produit **jamais**, seul ou combiné à N5/N6/N7/N8, une écriture de `dossier_id`. Il peut uniquement :
- alimenter `ai_context.dossiers_detectes[].statut` en `DETECTED` / `AMBIGUOUS` ;
- alimenter `ambiguities[]` avec `resolution_requise: true`.

**G.3 Cohérence descendante.** Si `client_id` est écrit et que `dossier_id` candidat appartient à un autre client (`dossiers.client_id` différent), c'est une contradiction : aucune écriture sur `dossier_id`, statut `AMBIGUOUS`.

**G.4 Références proches.** Aucune tolérance de correspondance approchée sur `dossiers.reference` (pas de préfixe, pas de suffixe, pas de distance d'édition). Seule l'égalité exacte, casse et espaces normalisés, est admise ; toute pluralité de résultats est une ambiguïté.

---

## H. Règles contrat

**H.1 Distinction identifiant métier / UUID technique.**

- `public.crm_emails.contrat_id` contient **exclusivement** un `uuid` égal à `public.contrats.id`.
- L'identifiant **métier** est `public.contrats.numero`. Côté extraction, il est porté par `ai_context.contrats_detectes[].numero_police`.
- Un numéro de police, même exact et unique, **n'est jamais écrit** dans `contrat_id`. Il doit d'abord être résolu en `contrats.id` par une lecture exhaustive, puis seul l'UUID résolu peut être écrit.
- Toute chaîne non conforme au format UUID est rejetée avant écriture (contrôle de forme), en plus du contrôle d'existence.

**H.2 Rebond autorisé depuis un contrat déterminé par N3.**

```
contrat (N3, exact + unique + exhaustif)
  -> client      : contrats.client_id     (écriture autorisée si non NULL et non contredit)
  -> dossier     : contrats.dossier_id    (écriture autorisée si non NULL et non contredit)
  -> compagnie   : contrats.compagnie_id  (écriture autorisée si non NULL et non contredit)
  -> produit     : contrats.produit_id    (proposition ai_context uniquement — aucune FK sur crm_emails)
```

Le rebond est **descendant uniquement** : il part du contrat établi vers ses FK réelles. Aucun rebond inverse (client → contrat, dossier → contrat, compagnie → contrat) n'est autorisé, même en présence d'un candidat unique.

**H.3 Multi-contrats.** Plusieurs numéros cités, ou un numéro correspondant à plusieurs lignes : aucune écriture, une entrée par candidat dans `contrats_detectes[]` en `AMBIGUOUS`, une `ambiguities[]` de type `contrat_multiple`, `resolution_requise: true`.

**H.4 Contrats non actifs.** Le statut du contrat n'entre pas dans la décision : un contrat résilié cité explicitement reste un rattachement légitime. Aucune préférence pour un contrat « actif » ne peut être utilisée pour départager des candidats.

---

## I. Règles compagnie

**I.1 Objets réels.** Table `public.compagnies` ; FK `crm_emails.compagnie_id → compagnies(id) ON DELETE SET NULL`. Aucun `company_id`, aucun `organisation_id`, aucun champ `compagnie_id_propose` (inexistant dans le schéma 1.1.0).

**I.2 Proposition vs écriture.** La proposition contextuelle reste portée par `ai_context.correspondant.compagnie_id`. L'écriture de `crm_emails.compagnie_id` est une **décision distincte**, évaluée séparément, jamais dérivée mécaniquement de la présence d'une proposition.

**I.3 Preuves admises.** N4 (domaine professionnel exact et unique) ou rebond N3 via `contrats.compagnie_id`. Aucune écriture sur la base d'un nom de compagnie cité en texte libre, d'un logo, d'une signature, ni d'un produit cité.

**I.4 Domaines exclus.** Les domaines de messagerie grand public et mutualisés sont exclus de N4 par liste d'exclusion explicite (déjà présente dans le Lot 3). Un domaine exclu ne peut jamais produire N4.

**I.5 Exhaustivité.** `compagnies` doit être lu de façon **complète** (pagination). Si la garde de pagination est atteinte, la liste est déclarée non exhaustive : `compagnie_id` ne peut pas être écrit, l'entité devient ambiguë.

---

## J. Contradictions

**J.1 Principe d'ordre.** L'évaluation suit strictement :

```
preuves -> candidats -> exhaustivité -> contradictions -> convergence -> autorisation d'écriture
```

La détection de contradiction est **antérieure** à toute autorisation. Une contradiction n'est jamais arbitrée automatiquement, ni par niveau, ni par ancienneté, ni par confiance.

**J.2 Typologie et traitement.**

| Cas | Traitement |
|---|---|
| Email (N2) vs document (N6) désignant deux clients | Aucune écriture `client_id` ; `AMBIGUOUS` ; `donnees_contradictoires` |
| Client A vs client B (candidats multiples) | Aucune écriture ; `client_multiple` |
| Contrat A vs contrat B | Aucune écriture ; `contrat_multiple` |
| Compagnie A (N4) vs compagnie B (rebond contrat) | Aucune écriture `compagnie_id` ; `donnees_contradictoires` |
| Dossier A vs dossier B | Aucune écriture ; `dossier_multiple` |
| Dossier appartenant à un autre client que le client retenu | Aucune écriture `dossier_id` |
| Contrat appartenant à un autre client que le client retenu | Aucune écriture `contrat_id` **ni** `client_id` |
| Plusieurs candidats sur toute entité | Aucune écriture sur cette entité |

**J.3 Effets systématiques.** Pour chaque contradiction : proposition neutralisée (`*_propose = null`), entité en `AMBIGUOUS`, `analyse.statut = "AMBIGUOUS"`, `validation_humaine_requise = true`, entrée dans `ambiguities[]` avec `candidats[]` et `resolution_requise: true`. Aucune FK écrite pour l'entité concernée.

**J.4 Portée de la contradiction.** Une contradiction est **locale à l'entité** et à ses dépendances par rebond. Une contradiction sur `produit` (hors FK) ne bloque pas `client_id`. En revanche, une contradiction sur `contrat` bloque tous les rebonds issus de ce contrat. Le statut global du contexte devient `AMBIGUOUS` dès qu'une entité est ambiguë, mais cela n'annule pas une écriture par ailleurs pleinement déterministe et non contredite : la règle retenue est **`AMBIGUOUS` global bloque toute écriture automatique** (choix conservateur, section N.3).

---

## K. Validation humaine

**K.1 Contrat de données.** Une validation humaine est représentée **uniquement** avec les champs existants du schéma 1.1.0 :

| Champ | Contenu |
|---|---|
| `analyse.statut` | `CONFIRMED` (seule voie d'obtention) |
| `analyse.validated_by` | identifiant de l'utilisateur validant (uuid textuel) |
| `analyse.validated_at` | horodatage ISO 8601 UTC |
| `analyse.modifications_apportees[]` | trace append-only : entité, valeur avant, valeur après |
| `analyse.provenance` | `source: "humain"`, `champ`, `detecte_le`, `preuve_ids` |
| `analyse.validation_humaine_requise` | `false` après validation complète |
| `<entite>.statut` | `CONFIRMED` pour les entrées validées |

**K.2 Aucune modification silencieuse.** Toute écriture de FK — automatique ou humaine — doit produire une entrée dans `modifications_apportees[]` au format textuel documenté (ex. `fk:client_id:null->…`, `lot4_ecriture:contrat_id:N3`). L'absence de trace équivaut à une écriture interdite.

**K.3 Données avant/après.** Le schéma 1.1.0 ne comporte pas de structure dédiée avant/après. La convention retenue, sans extension de schéma, est l'encodage textuel dans `modifications_apportees[]`. Toute exigence de journal structuré relèverait d'un lot ultérieur et d'un arbitrage DG (voir Q).

**K.4 Pouvoirs de la validation humaine.** L'humain peut : confirmer une proposition, choisir un candidat parmi des candidats ambigus, corriger une valeur, retirer un rattachement (remise à `NULL`). L'humain ne peut pas être simulé : aucune décision automatique ne peut renseigner `validated_by` / `validated_at`.

---

## L. Idempotence

| Situation | Comportement attendu |
|---|---|
| `analyse.validated_at` ou `validated_by` renseignés | Aucune écriture automatique. **Même avec `force`.** |
| `analyse.statut = "CONFIRMED"` | Aucune écriture automatique. **Même avec `force`.** |
| `analyse.provenance.source = "humain"` | Aucune écriture automatique. |
| FK déjà non `NULL` en base | Aucune réécriture, aucun écrasement, même si la preuve désigne la même valeur ; décision `REFUSER(deja_rattache)`. Si la preuve désigne une **autre** valeur : contradiction, `AMBIGUOUS`, aucune écriture. |
| Contexte `DETECTED` / `AMBIGUOUS` / `A_QUALIFIER` | Aucune écriture. |
| Deuxième passage du moteur, contexte inchangé | Résultat identique, aucune écriture supplémentaire, aucune entrée dupliquée dans `modifications_apportees[]` (déduplication par clé entité+valeur). |
| Retrait / correction d'une décision | Uniquement par voie humaine, tracée en K.2 ; le moteur ne réécrit pas une FK remise à `NULL` par un humain (la trace humaine bloque). |
| `force` | Ne peut porter que sur la relecture d'un contexte automatique non validé. **Ne contourne jamais** une validation humaine, un `CONFIRMED`, une FK déjà posée, ni une contradiction. |

**L.1 Clé d'idempotence.** L'état (`FK actuelles`, `analyse.statut`, `validated_*`, `provenance.source`) constitue la clé. À état d'entrée identique, la décision est identique et l'effet en base est nul si l'écriture a déjà eu lieu.

---

## M. Atomicité

**M.1 Question posée.** `client_id`, `dossier_id`, `contrat_id`, `compagnie_id` peuvent être autorisés simultanément (typiquement via N3 + rebonds). Doivent-ils être écrits ensemble ou pas du tout ?

**M.2 Décision de conception : atomicité par email.** Toutes les FK autorisées lors d'une même évaluation sont écrites dans **un unique `UPDATE`** de la ligne `crm_emails` concernée, accompagné de la mise à jour de `ai_context` dans la même instruction. Justification :

- une seule ligne est concernée : un `UPDATE` mono-ligne est intrinsèquement atomique en PostgreSQL, sans transaction explicite ni RPC ;
- un état partiellement rattaché (contrat écrit, client absent) serait relationnellement incohérent et difficile à réparer ;
- cela garantit que la trace `ai_context` et les FK ne divergent jamais.

**M.3 Cohérence FK / contexte.** L'écriture des FK et la mise à jour de `ai_context` (statut, provenance, `modifications_apportees`) sont indissociables. Il est interdit d'écrire des FK sans trace, ou une trace sans FK.

**M.4 Échec partiel.** Un `UPDATE` mono-ligne échoue en bloc : aucune FK n'est écrite, aucune trace n'est produite, l'email reste dans son état antérieur et redevient éligible à une nouvelle évaluation (idempotence L). Les échecs possibles et leur traitement :

| Échec | Traitement |
|---|---|
| Violation de FK (UUID inexistant) | Rejet global ; l'existence doit de toute façon être vérifiée avant écriture |
| Erreur RLS / permission | Rejet global ; aucune élévation de privilège pour contourner |
| Ligne email absente ou supprimée entre lecture et écriture | Rejet global |
| Contexte modifié entre lecture et écriture (course) | Écriture conditionnée à l'état lu (garde d'idempotence rejouée) ; en cas d'écart, rejet global |

**M.5 Aucune écriture multi-lignes, aucune écriture hors `crm_emails`.** Le Lot 4 ne conçoit aucune écriture dans `clients`, `dossiers`, `contrats`, `compagnies`, `produits`, `documents`, `doc_extractions`, `taches`, ni dans `triage_ia` / `triage_le`.

---

## N. Sécurité

**N.1 Interdictions absolues (héritées et renforcées).**

Aucun `INSERT`, `UPSERT`, `DELETE`, aucun RPC mutant, aucune création de client, prospect, contrat, produit, document ou tâche, aucun appel Gemini, aucun appel Gmail, aucun branchement Gmail, aucune migration, aucun champ JSON hors schéma 1.1.0, aucune modification de `triage_ia` / `triage_le`, aucun `CONFIRMED` automatique, aucun scoring, aucune lecture décisionnelle de `preuves[].poids`.

**N.2 Surface d'écriture conçue.** Exactement une instruction :

```sql
UPDATE public.crm_emails
   SET client_id = …, dossier_id = …, contrat_id = …, compagnie_id = …, ai_context = …
 WHERE id = :email_id
```

où chaque FK vaut soit sa valeur actuelle, soit une valeur autorisée par la matrice E. Aucune FK n'est jamais remise à `NULL` par le moteur automatique.

**N.3 Principe conservateur.** En cas de doute — doctrine ambiguë, exhaustivité non garantie, contradiction, état inattendu, erreur de lecture — la décision est **REFUSER**. Le refus est toujours sûr ; l'écriture ne l'est jamais par défaut.

**N.4 Contrôles pré-écriture obligatoires.** Pour chaque FK candidate : format UUID valide, existence de la ligne cible, unicité du candidat, exhaustivité du référentiel, absence de contradiction, cohérence relationnelle croisée (client du contrat = client du dossier = client retenu), FK actuelle `NULL`, garde d'idempotence.

**N.5 Traçabilité.** Toute écriture est reconstituable a posteriori depuis `ai_context` seul : niveau de preuve invoqué, identifiants de preuves, horodatage, source déterministe ou humaine.

---

## O. Plan de recette

Format : **Entrée → Preuves → Décision attendue → FK attendues → FK interdites → Statut**.

| # | Entrée | Preuves | Décision | FK attendues | FK interdites | Statut |
|---|---|---|---|---|---|---|
| T-01 | Référence dossier exacte unique citée | N1 | Autoriser | `dossier_id` (+ `client_id` par `dossiers.client_id`) | `contrat_id`, `compagnie_id` | `PROPOSED` → écriture |
| T-02 | Expéditeur = `clients.email` unique | N2 | Autoriser | `client_id` | `dossier_id`, `contrat_id`, `compagnie_id` | `PROPOSED` → écriture |
| T-03 | Numéro de police exact unique | N3 | Autoriser | `contrat_id` + rebonds non NULL (`client_id`, `dossier_id`, `compagnie_id`) | aucune autre | `PROPOSED` → écriture |
| T-04 | Domaine professionnel unique (`compagnies`) | N4 | Autoriser | `compagnie_id` | `client_id`, `dossier_id`, `contrat_id` | `PROPOSED` → écriture |
| T-05 | Personne citée avec email unique, sans N1–N4 | N5 seul | **Refuser** | aucune | toutes | `DETECTED` / proposition seule |
| T-06 | Nom/prénom cité seul | N7 | **Refuser** | aucune | toutes | `DETECTED` |
| T-07 | Rattachement historique de la ligne email | N8 | **Refuser** | aucune | toutes | `DETECTED` |
| T-08 | Client identifié, un seul dossier actif | N2 + N9 | Autoriser `client_id` uniquement | `client_id` | **`dossier_id`** | `PROPOSED` |
| T-09 | Contrat unique correspondant au numéro | N3 | Autoriser | `contrat_id` + rebonds | aucune autre | `PROPOSED` |
| T-10 | Deux numéros de police → deux contrats | N3 ×2 | **Refuser** | aucune | toutes | `AMBIGUOUS` (`contrat_multiple`) |
| T-11 | Email correspondant à un seul client | N2 | Autoriser | `client_id` | — | `PROPOSED` |
| T-12 | Deux clients homonymes, nom seul | N7 ×2 | **Refuser** | aucune | toutes | `AMBIGUOUS` (`client_multiple`) |
| T-13 | N2 → client A ; N6 document → client B | N2 + N6 contradictoires | **Refuser** | aucune | toutes | `AMBIGUOUS` (`donnees_contradictoires`) |
| T-14 | Document rattaché cohérent avec N2 | N2 + N6 convergents | Autoriser | `client_id` (+ `dossier_id` si porté par le document **et** N1 présent) | `contrat_id` sans N3 | `PROPOSED` |
| T-15 | Document rattaché contredisant le contrat cité | N3 + N6 contradictoires | **Refuser** | aucune | toutes | `AMBIGUOUS` |
| T-16 | Contrat déterminé par N3, `contrats.compagnie_id` non NULL | N3 + rebond | Autoriser | `compagnie_id` par rebond | — | `PROPOSED` |
| T-17 | N4 → compagnie A ; rebond contrat → compagnie B | N4 + N3 contradictoires | **Refuser** `compagnie_id` | aucune | `compagnie_id` | `AMBIGUOUS` |
| T-18 | Validation humaine explicite d'un candidat ambigu | humain | Autoriser (voie humaine) | valeur choisie | — | `CONFIRMED`, `validated_by/at` |
| T-19 | Second passage, contexte inchangé, FK déjà écrites | idem T-03 | Refuser (`deja_rattache`) | aucune nouvelle | toutes | inchangé, aucune duplication de trace |
| T-20 | Autorisation simultanée `client_id`+`contrat_id`, échec base | N3 + rebond | Rejet global | aucune | toutes | état antérieur intact |
| T-21 | Contexte déjà `CONFIRMED` / `validated_at` renseigné, `force = true` | quelconque | **Refuser** | aucune | toutes | inchangé |
| T-22 | Référentiel `clients` potentiellement tronqué, candidat unique | N2 sur liste non exhaustive | **Refuser** | aucune | `client_id` | `AMBIGUOUS` |
| T-23 | Troncature sur `compagnies` uniquement, N3 valide | N3 + troncature indépendante | Autoriser `contrat_id`/`client_id`, refuser `compagnie_id` par rebond issu du référentiel non exhaustif | `contrat_id`, `client_id` | `compagnie_id` | mixte, tracé |
| T-24 | Numéro de police fourni sous forme d'UUID inexistant | N3 formel | **Refuser** (existence non vérifiée) | aucune | toutes | `A_QUALIFIER` |
| T-25 | Contrat cité appartenant à un client différent du N2 | N2 + N3 contradictoires | **Refuser** | aucune | toutes | `AMBIGUOUS` |

Chaque scénario devra, au lot d'implémentation, être couvert par au moins un test automatisé sans accès réseau ni base réelle (lecteur simulé strictement typé, comme au Lot 3).

---

## P. GO / NO-GO

| Critère | État |
|---|---|
| Aucune ambiguïté doctrinale | ✅ N1–N9 repris à l'identique, sans promotion |
| Aucune référence à une table inexistante | ✅ objets vérifiés en base (B.1) |
| Aucune promotion N7 / N8 / N9 | ✅ interdiction explicite (D.1, G.2) |
| Aucun scoring, `preuves[].poids` neutre | ✅ (D.1) |
| Aucune écriture possible sans preuve autorisée | ✅ matrice E exhaustive + N.4 |
| Validation humaine protégée | ✅ (K, L) — `force` sans effet |
| Idempotence définie | ✅ (L) |
| Contradictions bloquantes et antérieures | ✅ (J.1) |
| Atomicité définie | ✅ `UPDATE` mono-ligne atomique (M) |
| Plan de recette complet | ✅ 25 scénarios (O) |

Réserve à arbitrer par la DG avant implémentation : **N.3 / J.4** — un contexte globalement `AMBIGUOUS` bloque-t-il toute écriture, y compris celles pleinement déterministes sur une entité non contredite ? Le présent dossier retient l'option conservatrice (blocage total). Une option alternative (« écriture des seules entités non ambiguës ») est techniquement définie mais **non retenue** sans décision DG explicite.

---

## Q. Inventaire des limites et dépendances

1. **Schéma 1.1.0 inchangé** — aucun champ dédié à un journal avant/après structuré ni à un multi-candidats natif. Conventions textuelles (K.3) et « une entrée par candidat + `ambiguities[]` » (Lot 3) sont des contournements documentés, non des extensions.
2. **`crm_emails.ai_metadata` inexistant** — les métadonnées d'ingestion restent dans `triage_ia` / `triage_le`, non modifiés.
3. **Écart documentaire connu** — le DESIGN Lot 3 mentionne `documents.nom` ; la colonne réelle est `documents.file_name`. Non corrigé ici (hors périmètre).
4. **`contrats.numero_police` inexistant en base** — l'identifiant métier est `contrats.numero` ; `numero_police` n'existe que dans `ai_context`.
5. **Aucune FK produit sur `crm_emails`** — le produit reste une proposition contextuelle.
6. **Téléphones non normalisés** en base : toute règle N5 fondée sur le téléphone reste durablement non fiable seule.
7. **Exhaustivité des référentiels** — dépend des plafonds et de la pagination du Lot 3 ; toute évolution du volume de données doit être réévaluée.
8. **RLS** — les droits d'écriture réels sur `crm_emails` conditionnent l'implémentation ; aucune élévation de privilège n'est conçue.
9. **Absence d'IHM** — la validation humaine suppose une interface de qualification prévue dans un lot ultérieur ; sans elle, aucun `CONFIRMED` ne peut être produit.
10. **Aucune dépendance à `taches`, `prospects`, `organisations`, `crm_tasks`, `catalogue_produits`, `fn_match_email_sender`** — objets inexistants ou hors périmètre.

---

🟡 **LOT 4 — DOSSIER DE CONCEPTION PRÊT POUR AUDIT**
