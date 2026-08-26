# CD-SI-001-B — LOT 4 — DESIGN V1.1

**MODÈLE DE PREUVES, CONVERGENCE ET ÉCRITURE SÉCURISÉE DES FK**

Version : V1.1

Statut : DESIGN CORRIGÉ — SOUMIS À AUDIT DG

Motif : corrections post-audit DG V1.0

Document de conception uniquement. Aucune implémentation, aucune migration, aucune écriture de FK, aucun branchement Gmail, aucun appel Gemini, aucune modification BDD, aucune modification des Lots 1, 2 ou 3, aucune modification du JSON Schema 1.1.0, aucun Lot 5.

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
| Décision DG post-audit V1.0 | Arbitrages obligatoires | N5, `PROPOSED`, `AMBIGUOUS` global, concurrence, tests complémentaires |

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

```text
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

```text
LOT 2  (validé)  extraction Gemini            -> ai_context statut DETECTED
LOT 3  (validé)  croisement déterministe      -> ai_context statut PROPOSED / AMBIGUOUS / DETECTED
LOT 4  (ce doc)  CONCEPTION de l'autorisation d'écriture des FK
LOT n+ (futur)   IMPLÉMENTATION des écritures, si et seulement si autorisée par DG
```

Le Lot 4 introduit conceptuellement **trois composants** dont l'implémentation est différée :

1. **Évaluateur d'autorisation (pur, sans base)** — entrée : `ai_context` validé Lot 1 + état actuel des FK de la ligne email + empreinte exacte de l'état observé ; sortie : une **décision d'écriture** par FK (`ECRIRE` / `REFUSER` avec motif), sans aucun accès réseau ni base.
2. **Applicateur (couche serveur)** — seul composant autorisé, dans un lot ultérieur, à exécuter un `UPDATE public.crm_emails SET client_id/dossier_id/contrat_id/compagnie_id`, accompagné de la mise à jour de traçabilité dans `ai_context`, avec garde optimiste obligatoire.
3. **Journal de décision** — porté **exclusivement** par `ai_context` (`analyse.modifications_apportees`, `analyse.provenance`, `preuves[]`, `ambiguities[]`). Aucune nouvelle table, aucune nouvelle colonne, aucun nouveau champ JSON hors schéma 1.1.0.

### C.2 Invariant d'entrée et statut `PROPOSED`

Le Lot 4 ne consomme qu'un `ai_context` **validé par le validateur Lot 1**, de `schema_version = "1.1.0"`.

Un contexte dont `analyse.statut` vaut `DETECTED`, `A_QUALIFIER` ou `CONFIRMED` ne peut produire aucune écriture automatique.

Un contexte dont `analyse.statut` vaut `AMBIGUOUS` bloque **toute** écriture automatique de FK, même lorsqu'une autre entité semble individuellement déterministe. Cette règle est normative et prévaut sur toute règle locale.

Un contexte dont `analyse.statut` vaut `PROPOSED` est seulement **éligible à évaluation**. `PROPOSED` ne suffit **jamais** à autoriser une FK.

Le futur évaluateur doit déterminer explicitement, pour chaque FK candidate :

- l'entité concernée ;
- la preuve porteuse ;
- le niveau doctrinal de cette preuve ;
- les conditions complémentaires ;
- les contradictions ;
- les rebonds autorisés.

Règle impérative :

| Niveau porteur | Autorisation maximale |
|---|---|
| **N1** | Peut porter `dossier_id` |
| **N2** | Peut porter `client_id` |
| **N3** | Peut porter `contrat_id` |
| **N4** | Peut porter `compagnie_id` |
| **N5** | Jamais seul |
| **N6** | Jamais seul |
| **N7** | Jamais |
| **N8** | Jamais |
| **N9** | Jamais |

N5/N6 ne peuvent devenir éligibles que par la corroboration strictement définie en D.2. Le niveau ne doit jamais être déduit du seul statut `PROPOSED`.

`CONFIRMED` n'est jamais produit par une décision automatique : il ne peut résulter que d'une validation humaine explicite (section K).

### C.3 Récupération du niveau porteur sans modification du JSON Schema 1.1.0

Le JSON Schema 1.1.0 ne comporte aucun champ dédié `niveau`. La V1.1 n'en ajoute pas.

Le futur évaluateur doit reconstituer le niveau porteur uniquement à partir des champs existants et des conventions du Lot 3 :

| Niveau | Source existante autorisée pour reconstitution | Condition de reconstitution |
|---|---|---|
| N1 | `dossiers_detectes[].provenance.preuve_ids[]` + `preuves[]` | Preuve de type `reference_explicite` ou extrait/référence correspondant exactement à `dossiers.reference` / UUID dossier existant |
| N2 | `correspondant.email` + `correspondant.provenance.preuve_ids[]` + `preuves[]` | Email expéditeur exact, non un email cité dans le corps, correspondant exactement et uniquement à `clients.email` / `clients.email2` |
| N3 | `contrats_detectes[].numero_police` + `provenance.preuve_ids[]` + `preuves[]` | Numéro de police cité correspondant exactement et uniquement à `contrats.numero` |
| N4 | `correspondant.email` + domaine expéditeur + `provenance.preuve_ids[]` + `preuves[]` | Domaine professionnel expéditeur non exclu correspondant exactement et uniquement à `compagnies.contact_email` ou `compagnies.site_web` |
| N5 | `personnes_detectees[]` + `preuves[]` | Personne citée, email/téléphone cité hors email expéditeur ; jamais requalifiable en N2 |
| N6 | `documents_associes[]` + `preuves[]` | Document déjà rattaché en base via `documents.file_name` / FK existantes |
| N7 | `personnes_detectees[].nom/prenom` + `preuves[]` | Nom/prénom seuls, sans email expéditeur exact |
| N8 | FK déjà présentes sur la ligne `crm_emails` lue avant décision | Historique relationnel ; jamais porteur d'écriture |
| N9 | Dossiers actifs du client lues par référentiel | Facteur contextuel ; jamais porteur d'écriture |

La preuve porteuse doit être identifiée **champ par champ**. Si le niveau porteur ne peut pas être reconstitué sans ambiguïté avec les champs existants, la décision est `REFUSER(niveau_porteur_indetermine)` et aucune FK n'est écrite.

---

## D. Matrice des preuves (doctrine N1–N9, corrigée V1.1)

| Niveau | Définition | Déterministe | Peut porter seul une écriture |
|---|---|---|---|
| **N1** | Référence dossier explicite citée, correspondance **exacte et unique** sur `dossiers.reference` (ou UUID direct valide) | Oui | Oui — `dossier_id` |
| **N2** | **Email expéditeur exact du correspondant uniquement**, en correspondance **exacte et unique** sur `clients.email` / `clients.email2` | Oui | Oui — `client_id` |
| **N3** | Numéro de police cité en correspondance **exacte et unique** sur `contrats.numero` | Oui | Oui — `contrat_id` |
| **N4** | Compagnie / logique partenaire : domaine d'email professionnel expéditeur en correspondance **exacte et unique** sur `compagnies.contact_email` / `compagnies.site_web` | Oui | Oui — `compagnie_id` uniquement |
| **N5** | Personne citée avec email **ou** téléphone, correspondance exacte et unique | Partiel | **Non** seul (voir F.3) |
| **N6** | Preuve documentaire : `documents` (`file_name`) déjà rattaché portant `client_id` / `dossier_id` / `contrat_id` | Partiel | **Non** seul, sauf corroboration strictement encadrée (voir D.2) |
| **N7** | Nom / prénom cité seul | Non | **Jamais** |
| **N8** | Historique relationnel (rattachements déjà posés sur la ligne email) | Non | **Jamais** |
| **N9** | Dossier unique actif du client — **facteur contextuel uniquement** | Non | **Jamais** |

### D.1 Interdits doctrinaux

- Aucune **promotion** de N7, N8 ou N9, même par accumulation, même multiple, même « cohérente ».
- Aucune **promotion** de N5 ou N6 en niveau N1, N2, N3 ou N4. N5 reste N5 ; N6 reste N6.
- Interdiction absolue de requalifier `personnes_detectees[].email` en N2. L'email d'une personne détectée relève toujours de N5, jamais de N2.
- Aucun **scoring**, aucune **pondération**, aucune **somme** ni **moyenne** de signaux.
- `preuves[].poids` : **ni lu ni écrit** à des fins décisionnelles. Il reste un champ descriptif hérité, sans effet.
- `analyse.confiance_globale` et `confiance` d'entité : **descriptifs**. Aucun seuil de confiance ne peut à lui seul autoriser une écriture de FK.
- La convergence de plusieurs signaux faibles ne crée jamais un signal fort.

### D.2 Corroboration (seul mécanisme de renforcement admis)

La corroboration n'est pas un score : c'est une **condition de cohérence**. Une preuve N5 ou N6 ne devient éligible à une écriture que si :

1. elle est **exacte et unique** dans son référentiel exhaustif ; **et**
2. elle **converge** avec au moins une preuve de niveau N1–N4 désignant la **même** entité ou une entité liée par rebond explicitement autorisé en H.2 ; **et**
3. la FK concernée est autorisée par la matrice E pour le niveau porteur N1–N4 ou par le rebond explicitement autorisé ; **et**
4. aucune contradiction n'existe (section J) ; **et**
5. le contexte global n'est pas `AMBIGUOUS`.

La corroboration N5/N6 ne transforme jamais N5 en N2, N6 en N1, ni aucun signal faible en signal fort. Elle permet seulement de vérifier la cohérence d'une écriture déjà portée par N1–N4 ou par un rebond autorisé.

Une corroboration entre deux signaux faibles (N5+N6, N6+N7, N7+N8, N8+N9…) **n'autorise aucune écriture**.

### D.3 Exhaustivité obligatoire

Conformément au Lot 3, tout référentiel dont l'exhaustivité n'est pas garantie (lecture potentiellement tronquée) rend l'entité concernée **ambiguë** : `propose = null`, aucune écriture. Le Lot 4 hérite de cette règle sans l'assouplir : **une liste non exhaustive interdit toute écriture** sur la FK correspondante, y compris si un candidat unique apparaît.

### D.4 Matrice d'autorisation par niveau porteur

| FK | Niveau porteur direct autorisé | Rebonds autorisés | N5/N6 seuls | N7/N8/N9 |
|---|---|---|---|---|
| `client_id` | N2 uniquement | Depuis `contrat_id` porté par N3 ; depuis `dossier_id` porté par N1 | Jamais | Jamais |
| `dossier_id` | N1 uniquement | Depuis `contrat_id` porté par N3, si `contrats.dossier_id` non NULL et cohérent | Jamais | Jamais |
| `contrat_id` | N3 uniquement | Aucun | Jamais | Jamais |
| `compagnie_id` | N4 uniquement | Depuis `contrat_id` porté par N3, si `contrats.compagnie_id` non NULL et cohérent | Jamais | Jamais |

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
| Preuve directe autorisée | **N2 uniquement** : email expéditeur exact du correspondant et unique sur `clients.email` / `email2` |
| Preuve par rebond autorisée | Depuis `contrat_id` écrit par **N3** → `contrats.client_id` ; depuis `dossier_id` écrit par **N1** → `dossiers.client_id` |
| Conditions cumulatives | référentiel `clients` exhaustif ; candidat unique ; UUID existant ; `crm_emails.client_id` actuellement `NULL` ; contexte `PROPOSED` évalué avec niveau porteur explicite ; aucune validation humaine antérieure ; aucune contradiction ; contexte global non `AMBIGUOUS` |
| Interdictions | `personnes_detectees[].email` requalifié en N2 ; N5 seul ; N6 seul ; N7 ; N8 ; N9 ; homonymie ; téléphone non unique ; mention documentaire seule ; convergence IA ; création de client ou de prospect |
| Contradiction | client A ≠ client B, ou rebond contrat/dossier désignant un client différent de N2 → **aucune écriture**, `AMBIGUOUS` global, blocage total |
| Validation humaine | Peut autoriser toute valeur existante ; renseigne `validated_by` / `validated_at` ; seule voie vers `CONFIRMED` |

### E.2 `dossier_id` → `dossiers.id`

| Aspect | Règle |
|---|---|
| Preuve directe autorisée | **N1** (référence `dossiers.reference` exacte et unique, ou UUID direct existant) |
| Preuve par rebond autorisée | Depuis `contrat_id` écrit par **N3** → `contrats.dossier_id`, **si non NULL** et si le client du dossier est cohérent avec `client_id` retenu |
| Conditions cumulatives | référentiel `dossiers` exhaustif ; candidat unique ; UUID existant ; `crm_emails.dossier_id` actuellement `NULL` ; contexte `PROPOSED` évalué avec niveau porteur explicite ; aucune contradiction ; contexte global non `AMBIGUOUS` |
| Interdictions | **N9 (dossier unique actif) seul — interdiction absolue** ; N5 seul ; N6 seul ; N7 ; N8 ; déduction « le client n'a qu'un dossier » ; choix du dossier le plus récent ; choix du dossier le plus avancé |
| Contradiction | dossier A ≠ dossier B ; dossier dont `client_id` diffère du client retenu → **aucune écriture**, `AMBIGUOUS` global, blocage total |
| Validation humaine | Requise pour tout rattachement non couvert par N1 ou le rebond N3 |

### E.3 `contrat_id` → `contrats.id`

| Aspect | Règle |
|---|---|
| Preuve directe autorisée | **N3** (`ai_context.contrats_detectes[].numero_police` en correspondance **exacte et unique** sur `contrats.numero`) |
| Preuve par rebond autorisée | **Aucune.** Un contrat n'est jamais déduit d'un client, d'un dossier ni d'une compagnie |
| Conditions cumulatives | référentiel `contrats` exhaustif ; correspondance exacte (aucune correspondance partielle, approchée ou normalisée au-delà d'un trim/casse documenté) ; candidat unique ; UUID existant ; `crm_emails.contrat_id` actuellement `NULL` ; contexte `PROPOSED` évalué avec niveau porteur explicite ; aucune contradiction ; contexte global non `AMBIGUOUS` |
| Interdictions | contrat unique du client ; contrat le plus récent ; contrat le plus probable ; N5–N9 ; **confusion numéro métier / UUID** (section H.1) |
| Contradiction | plusieurs contrats correspondant au numéro cité ; plusieurs numéros cités désignant des contrats différents ; contrat dont `client_id` contredit le client retenu → **aucune écriture**, `AMBIGUOUS` global, blocage total |
| Validation humaine | Requise en multi-contrats et pour tout cas non strictement N3 |

### E.4 `compagnie_id` → `compagnies.id`

| Aspect | Règle |
|---|---|
| Preuve directe autorisée | **N4** (domaine professionnel de l'expéditeur en correspondance exacte et unique sur `compagnies.contact_email` / `compagnies.site_web`) |
| Preuve par rebond autorisée | Depuis `contrat_id` écrit par **N3** → `contrats.compagnie_id`, **si non NULL** |
| Conditions cumulatives | référentiel `compagnies` **exhaustif** (pagination complète ; garde atteinte ⇒ interdiction) ; candidat unique ; UUID existant ; `crm_emails.compagnie_id` actuellement `NULL` ; contexte `PROPOSED` évalué avec niveau porteur explicite ; aucune contradiction ; contexte global non `AMBIGUOUS` |
| Interdictions | domaine générique / grand public ; compagnie citée en texte libre sans correspondance exacte ; déduction depuis un produit ; déduction depuis un client ; usage de `company_id` / `organisation_id` / `compagnie_id_propose` (inexistants) |
| Contradiction | compagnie A (N4) ≠ compagnie B (rebond contrat) → **aucune écriture**, `AMBIGUOUS` global, blocage total |
| Validation humaine | Requise dans tous les autres cas ; l'écriture de `crm_emails.compagnie_id` est traitée **séparément** de la proposition `ai_context.correspondant.compagnie_id` |

### E.5 Produit

`public.crm_emails` **ne possède pas** de colonne `produit_id`. Aucune écriture de FK produit n'existe ni ne sera conçue. Un produit reste une **proposition** dans `ai_context.produits_cites[].produit_id_propose`. Le rebond `contrat → produit` sert uniquement à enrichir le contexte, jamais une FK.

---

## F. Règles client

**F.1 Prospect.** Un « prospect » est une ligne de `public.clients` avec `statut = 'prospect'`. Il n'existe aucune table dédiée. Le Lot 4 **n'autorise jamais** la création automatique d'un client ni d'un prospect, quel que soit le niveau de preuve. Un correspondant inconnu reste inconnu : `client_id` demeure `NULL` et l'email est marqué à qualifier.

**F.2 Rattachement autorisé.** Uniquement :
- N2 : **email expéditeur exact du correspondant**, en correspondance exacte, insensible à la casse, **unique** sur `clients.email` ou `clients.email2` ; ou
- rebond depuis `contrat_id` porté par N3 via `contrats.client_id` ; ou
- rebond depuis `dossier_id` porté par N1 via `dossiers.client_id` ; ou
- validation humaine explicite.

Règle définitive : l'email d'une personne détectée relève de **N5**. Seul l'email expéditeur exact du correspondant produit **N2**. Il est absolument interdit de requalifier `personnes_detectees[].email` en N2, même si la correspondance est exacte, unique, fortement confiante ou cohérente avec d'autres indices.

**F.3 Cas N5.** Une personne citée avec email ou téléphone n'autorise une écriture de `client_id` **que si** la correspondance est exacte et unique **et** corroborée par une preuve N1–N4 désignant le même client ou par un rebond explicitement autorisé. Cette corroboration ne transforme pas N5 en N2 : l'écriture doit rester portée par le niveau N1–N4 ou par le rebond autorisé. Le téléphone seul, même unique, ne suffit jamais : format non normalisé en base, risque de numéro partagé (foyer, entreprise).

**F.4 Interdictions explicites.** Nom seul (N7) ; nom + prénom ; homonymie totale ou partielle ; téléphone ambigu ou multi-porteur ; mention dans un document non rattaché ; `personnes_detectees[].email` seul ; convergence IA ; confiance élevée ; domaine d'email personnel partagé (`gmail.com`, etc.) ; correspondance sur un email d'un tiers (conjoint, courtier, notaire) sans rôle établi.

**F.5 Rôle du correspondant.** Un email provenant d'une compagnie ou d'un partenaire ne peut jamais écrire `client_id` par le seul fait qu'un client est cité dans le corps : la citation d'un client par un tiers relève de N7 ou de N5 non corroboré.

---

## G. Règles dossier

**G.1** `dossier_id` ne peut être écrit que par N1 (référence exacte et unique / UUID existant) ou par rebond depuis un `contrat_id` écrit par N3.

**G.2 N9 — dossier unique actif.** Réaffirmation formelle : N9 est un **facteur contextuel**. Il ne produit **jamais**, seul ou combiné à N5/N6/N7/N8, une écriture de `dossier_id`. Il peut uniquement :
- alimenter `ai_context.dossiers_detectes[].statut` en `DETECTED` / `AMBIGUOUS` ;
- alimenter `ambiguities[]` avec `resolution_requise: true`.

**G.3 Cohérence descendante.** Si `client_id` est écrit et que `dossier_id` candidat appartient à un autre client (`dossiers.client_id` différent), c'est une contradiction : aucune écriture sur aucune FK automatique, statut global `AMBIGUOUS`.

**G.4 Références proches.** Aucune tolérance de correspondance approchée sur `dossiers.reference` (pas de préfixe, pas de suffixe, pas de distance d'édition). Seule l'égalité exacte, casse et espaces normalisés, est admise ; toute pluralité de résultats est une ambiguïté.

---

## H. Règles contrat

**H.1 Distinction identifiant métier / UUID technique.**

- `public.crm_emails.contrat_id` contient **exclusivement** un `uuid` égal à `public.contrats.id`.
- L'identifiant **métier** est `public.contrats.numero`. Côté extraction, il est porté par `ai_context.contrats_detectes[].numero_police`.
- Un numéro de police, même exact et unique, **n'est jamais écrit** dans `contrat_id`. Il doit d'abord être résolu en `contrats.id` par une lecture exhaustive, puis seul l'UUID résolu peut être écrit.
- Toute chaîne non conforme au format UUID est rejetée avant écriture (contrôle de forme), en plus du contrôle d'existence.

**H.2 Rebond autorisé depuis un contrat déterminé par N3.**

```text
contrat (N3, exact + unique + exhaustif)
  -> client      : contrats.client_id     (écriture autorisée si non NULL et non contredit)
  -> dossier     : contrats.dossier_id    (écriture autorisée si non NULL et non contredit)
  -> compagnie   : contrats.compagnie_id  (écriture autorisée si non NULL et non contredit)
  -> produit     : contrats.produit_id    (proposition ai_context uniquement — aucune FK sur crm_emails)
```

Le rebond est **descendant uniquement** : il part du contrat établi vers ses FK réelles. Aucun rebond inverse (client → contrat, dossier → contrat, compagnie → contrat) n'est autorisé, même en présence d'un candidat unique.

Les seuls rebonds légitimes utilisables par D.2-2 sont ceux listés dans H.2 et, pour `client_id`, le rebond depuis un dossier déterminé par N1 via `dossiers.client_id`. Aucune autre relation implicite, historique, statistique ou métier ne constitue un rebond légitime.

**H.3 Multi-contrats.** Plusieurs numéros cités, ou un numéro correspondant à plusieurs lignes : aucune écriture, une entrée par candidat dans `contrats_detectes[]` en `AMBIGUOUS`, une `ambiguities[]` de type `contrat_multiple`, `resolution_requise: true`, statut global `AMBIGUOUS` et blocage total.

**H.4 Contrats non actifs.** Le statut du contrat n'entre pas dans la décision : un contrat résilié cité explicitement reste un rattachement légitime. Aucune préférence pour un contrat « actif » ne peut être utilisée pour départager des candidats.

---

## I. Règles compagnie

**I.1 Objets réels.** Table `public.compagnies` ; FK `crm_emails.compagnie_id → compagnies(id) ON DELETE SET NULL`. Aucun `company_id`, aucun `organisation_id`, aucun champ `compagnie_id_propose` (inexistant dans le schéma 1.1.0).

**I.2 Proposition vs écriture.** La proposition contextuelle reste portée par `ai_context.correspondant.compagnie_id`. L'écriture de `crm_emails.compagnie_id` est une **décision distincte**, évaluée séparément, jamais dérivée mécaniquement de la présence d'une proposition.

**I.3 Preuves admises.** N4 (domaine professionnel exact et unique de l'expéditeur) ou rebond N3 via `contrats.compagnie_id`. Aucune écriture sur la base d'un nom de compagnie cité en texte libre, d'un logo, d'une signature, d'un produit cité, d'un domaine approché ou d'un domaine extrait d'un site non identique.

**I.4 Correspondance exacte `site_web`.** Le traitement `compagnies.site_web` exige une correspondance exacte du domaine canonique après normalisation strictement documentaire : casse, espaces, protocole (`http://`, `https://`) et préfixe `www.` peuvent être neutralisés ; aucun sous-domaine non identique, suffixe, inclusion de chaîne, similarité orthographique, marque ou redirection ne peut valoir correspondance. Les domaines de messagerie grand public et mutualisés sont exclus de N4 par liste d'exclusion explicite (déjà présente dans le Lot 3). Un domaine exclu ne peut jamais produire N4.

**I.5 Exhaustivité.** `compagnies` doit être lu de façon **complète** (pagination). Si la garde de pagination est atteinte, la liste est déclarée non exhaustive : `compagnie_id` ne peut pas être écrit, l'entité devient ambiguë, le contexte global `AMBIGUOUS` bloque toute écriture automatique.

---

## J. Contradictions

**J.1 Principe d'ordre.** L'évaluation suit strictement :

```text
statut global -> preuves -> niveau porteur -> candidats -> exhaustivité -> contradictions -> convergence -> autorisation d'écriture -> garde optimiste
```

La détection de contradiction est **antérieure** à toute autorisation. Une contradiction n'est jamais arbitrée automatiquement, ni par niveau, ni par ancienneté, ni par confiance.

**J.2 Typologie et traitement.**

| Cas | Traitement |
|---|---|
| Email expéditeur (N2) vs document (N6) désignant deux clients | Aucune écriture ; statut global `AMBIGUOUS` ; `donnees_contradictoires` |
| Email d'une personne détectée (N5) seul | Aucune écriture ; reste N5 ; jamais N2 |
| Client A vs client B (candidats multiples) | Aucune écriture ; statut global `AMBIGUOUS` ; `client_multiple` |
| Contrat A vs contrat B | Aucune écriture ; statut global `AMBIGUOUS` ; `contrat_multiple` |
| Compagnie A (N4) vs compagnie B (rebond contrat) | Aucune écriture ; statut global `AMBIGUOUS` ; `donnees_contradictoires` |
| Dossier A vs dossier B | Aucune écriture ; statut global `AMBIGUOUS` ; `dossier_multiple` |
| Dossier appartenant à un autre client que le client retenu | Aucune écriture ; statut global `AMBIGUOUS` |
| Contrat appartenant à un autre client que le client retenu | Aucune écriture ; statut global `AMBIGUOUS` |
| Plusieurs candidats sur toute entité | Aucune écriture ; statut global `AMBIGUOUS` |

**J.3 Effets systématiques.** Pour chaque contradiction : proposition neutralisée (`*_propose = null` lorsque le champ existe), entité en `AMBIGUOUS`, `analyse.statut = "AMBIGUOUS"`, `validation_humaine_requise = true`, entrée dans `ambiguities[]` avec `candidats[]` et `resolution_requise: true`. Aucune FK n'est écrite.

**J.4 Portée normative de `AMBIGUOUS` global.** Un contexte globalement `AMBIGUOUS` bloque **toute** écriture automatique de FK, même lorsqu'une autre entité semble individuellement déterministe et non contredite. Cette règle est normative. Il n'existe aucune logique mixte « écrire les entités saines / refuser les entités ambiguës » en Lot 4 V1.1. Un contexte `AMBIGUOUS` reste entièrement bloqué jusqu'à résolution humaine.

---

## K. Validation humaine

**K.1 Contrat de données.** Une validation humaine est représentée **uniquement** avec les champs existants du schéma 1.1.0 :

| Champ | Contenu |
|---|---|
| `analyse.statut` | `CONFIRMED` (seule voie d'obtention) |
| `analyse.validated_by` | UUID valide de l'utilisateur validant, au format UUID, non nul lors d'une validation |
| `analyse.validated_at` | horodatage ISO 8601 UTC |
| `analyse.modifications_apportees[]` | trace append-only : entité, valeur avant, valeur après, niveau ou source |
| `analyse.provenance` | `source: "humain"`, `champ`, `detecte_le`, `preuve_ids` |
| `analyse.validation_humaine_requise` | `false` après validation complète |
| `<entite>.statut` | `CONFIRMED` pour les entrées validées |

**K.2 Aucune modification silencieuse.** Toute écriture de FK — automatique ou humaine — doit produire une entrée dans `modifications_apportees[]` au format textuel documenté (ex. `fk:client_id:null->…`, `lot4_ecriture:contrat_id:N3`). L'absence de trace équivaut à une écriture interdite.

**K.3 Données avant/après.** Le schéma 1.1.0 ne comporte pas de structure dédiée avant/après. La convention retenue, sans extension de schéma, est l'encodage textuel dans `modifications_apportees[]`. Toute exigence de journal structuré relèverait d'un lot ultérieur et d'un arbitrage DG (voir Q).

**K.4 Pouvoirs de la validation humaine.** L'humain peut : confirmer une proposition, choisir un candidat parmi des candidats ambigus, corriger une valeur, retirer un rattachement (remise à `NULL`). L'humain ne peut pas être simulé : aucune décision automatique ne peut renseigner `validated_by` / `validated_at`.

**K.5 Déduplication de `modifications_apportees[]`.** La clé de déduplication minimale est :

```text
source + champ + ancienne_valeur + nouvelle_valeur + niveau_ou_mode + preuve_ids_tries
```

Une même clé ne peut apparaître qu'une seule fois. Un second passage automatique avec la même clé ne doit pas ajouter de doublon. Une validation humaine ultérieure utilise `source=humain` et constitue une clé distincte.

---

## L. Idempotence

| Situation | Comportement attendu |
|---|---|
| `analyse.validated_at` ou `validated_by` renseignés | Aucune écriture automatique. **Même avec `force`.** |
| `analyse.statut = "CONFIRMED"` | Aucune écriture automatique. **Même avec `force`.** |
| `analyse.provenance.source = "humain"` | Aucune écriture automatique. |
| `analyse.statut = "AMBIGUOUS"` | Aucune écriture automatique, blocage total jusqu'à résolution humaine. |
| FK déjà non `NULL` en base | Aucune réécriture, aucun écrasement, même si la preuve désigne la même valeur ; décision `REFUSER(deja_rattache)`. Si la preuve désigne une **autre** valeur : contradiction, `AMBIGUOUS`, aucune écriture. |
| Contexte `DETECTED` / `AMBIGUOUS` / `A_QUALIFIER` | Aucune écriture. |
| Deuxième passage du moteur, contexte inchangé | Résultat identique, aucune écriture supplémentaire, aucune entrée dupliquée dans `modifications_apportees[]` (déduplication par clé K.5). |
| Retrait / correction d'une décision | Uniquement par voie humaine, tracée en K.2 ; le moteur ne réécrit pas une FK remise à `NULL` par un humain (la trace humaine bloque). |
| Retrait humain puis nouvelle tentative automatique | Blocage automatique : la trace humaine et/ou `provenance.source = "humain"` interdit toute remise en place automatique. |
| `force` | Ne peut porter que sur la relecture d'un contexte automatique non validé. **Ne contourne jamais** une validation humaine, un `CONFIRMED`, un `AMBIGUOUS`, une FK déjà posée, ni une contradiction. |

**L.1 Clé d'idempotence.** L'état (`FK actuelles`, `analyse.statut`, `validated_*`, `provenance.source`, `ai_context` observé, `modifications_apportees[]`) constitue la clé. À état d'entrée identique, la décision est identique et l'effet en base est nul si l'écriture a déjà eu lieu.

---

## M. Atomicité et concurrence

**M.1 Question posée.** `client_id`, `dossier_id`, `contrat_id`, `compagnie_id` peuvent être autorisés simultanément (typiquement via N3 + rebonds). Doivent-ils être écrits ensemble ou pas du tout ?

**M.2 Décision de conception : atomicité par email.** Toutes les FK autorisées lors d'une même évaluation sont écrites dans **un unique `UPDATE`** de la ligne `crm_emails` concernée, accompagné de la mise à jour de `ai_context` dans la même instruction. Justification :

- une seule ligne est concernée : un `UPDATE` mono-ligne est intrinsèquement atomique en PostgreSQL, sans transaction explicite ni RPC ;
- un état partiellement rattaché (contrat écrit, client absent) serait relationnellement incohérent et difficile à réparer ;
- cela garantit que la trace `ai_context` et les FK ne divergent jamais.

**M.3 Cohérence FK / contexte.** L'écriture des FK et la mise à jour de `ai_context` (statut, provenance, `modifications_apportees`) sont indissociables. Il est interdit d'écrire des FK sans trace, ou une trace sans FK.

**M.4 Garde optimiste obligatoire contre les lost updates.** L'UPDATE futur doit être conditionné à l'état exact observé avant décision. Le simple `WHERE id = :email_id` est insuffisant et interdit.

La garde optimiste doit permettre de détecter au minimum :

- modification humaine concurrente ;
- FK renseignée entre lecture et écriture ;
- changement de `analyse.statut` ;
- changement de `ai_context` ;
- changement de `validated_by`, `validated_at` ou `analyse.provenance.source` ;
- suppression de la ligne email.

Forme conceptuelle attendue, sans imposer d'implémentation :

```sql
UPDATE public.crm_emails
   SET client_id = :new_client_id,
       dossier_id = :new_dossier_id,
       contrat_id = :new_contrat_id,
       compagnie_id = :new_compagnie_id,
       ai_context = :new_ai_context
 WHERE id = :email_id
   AND client_id IS NOT DISTINCT FROM :observed_client_id
   AND dossier_id IS NOT DISTINCT FROM :observed_dossier_id
   AND contrat_id IS NOT DISTINCT FROM :observed_contrat_id
   AND compagnie_id IS NOT DISTINCT FROM :observed_compagnie_id
   AND ai_context = :observed_ai_context
   AND ai_context #>> '{analyse,statut}' = :observed_analyse_statut
   AND coalesce(ai_context #>> '{analyse,validated_by}', '') = coalesce(:observed_validated_by, '')
   AND coalesce(ai_context #>> '{analyse,validated_at}', '') = coalesce(:observed_validated_at, '')
   AND coalesce(ai_context #>> '{analyse,provenance,source}', '') = coalesce(:observed_provenance_source, '')
```

Si 0 ligne est affectée :

- aucune écriture n'est considérée comme réussie ;
- aucun faux succès n'est permis ;
- l'opération est rejetée ;
- une nouvelle lecture et une nouvelle évaluation sont obligatoires ;
- aucun écrasement silencieux n'est autorisé.

**M.5 Échec partiel.** Un `UPDATE` mono-ligne échoue en bloc : aucune FK n'est écrite, aucune trace n'est produite, l'email reste dans son état antérieur et redevient éligible à une nouvelle évaluation seulement si l'état relu le permet. Les échecs possibles et leur traitement :

| Échec | Traitement |
|---|---|
| Violation de FK (UUID inexistant) | Rejet global ; l'existence doit de toute façon être vérifiée avant écriture |
| Erreur RLS / permission | Rejet global ; aucune élévation de privilège pour contourner |
| Ligne email absente ou supprimée entre lecture et écriture | Rejet global |
| Contexte modifié entre lecture et écriture (course) | 0 ligne affectée ; rejet global ; nouvelle évaluation obligatoire |
| FK renseignée entre lecture et écriture | 0 ligne affectée ; rejet global ; aucun écrasement |
| Validation humaine intervenue entre lecture et écriture | 0 ligne affectée ; rejet global ; aucune décision automatique |

**M.6 Aucune écriture multi-lignes, aucune écriture hors `crm_emails`.** Le Lot 4 ne conçoit aucune écriture dans `clients`, `dossiers`, `contrats`, `compagnies`, `produits`, `documents`, `doc_extractions`, `taches`, ni dans `triage_ia` / `triage_le`.

---

## N. Sécurité

**N.1 Interdictions absolues (héritées et renforcées).**

Aucun `INSERT`, `UPSERT`, `DELETE`, aucun RPC mutant, aucune création de client, prospect, contrat, produit, document ou tâche, aucun appel Gemini, aucun appel Gmail, aucun branchement Gmail, aucune migration, aucun champ JSON hors schéma 1.1.0, aucune modification de `triage_ia` / `triage_le`, aucun `CONFIRMED` automatique, aucun scoring, aucune lecture décisionnelle de `preuves[].poids`.

**N.2 Surface d'écriture conçue.** Exactement une instruction conditionnelle avec garde optimiste :

```sql
UPDATE public.crm_emails
   SET client_id = …, dossier_id = …, contrat_id = …, compagnie_id = …, ai_context = …
 WHERE id = :email_id
   AND client_id IS NOT DISTINCT FROM :observed_client_id
   AND dossier_id IS NOT DISTINCT FROM :observed_dossier_id
   AND contrat_id IS NOT DISTINCT FROM :observed_contrat_id
   AND compagnie_id IS NOT DISTINCT FROM :observed_compagnie_id
   AND ai_context = :observed_ai_context
   AND ai_context #>> '{analyse,statut}' = :observed_analyse_statut
   AND coalesce(ai_context #>> '{analyse,validated_by}', '') = coalesce(:observed_validated_by, '')
   AND coalesce(ai_context #>> '{analyse,validated_at}', '') = coalesce(:observed_validated_at, '')
```

où chaque FK vaut soit sa valeur actuelle, soit une valeur autorisée par la matrice E. Aucune FK n'est jamais remise à `NULL` par le moteur automatique. Une affectation de 0 ligne vaut rejet et jamais succès.

**N.3 Principe conservateur et `AMBIGUOUS` global.** En cas de doute — doctrine ambiguë, niveau porteur indéterminé, exhaustivité non garantie, contradiction, contexte global `AMBIGUOUS`, état inattendu, erreur de lecture, garde optimiste échouée — la décision est **REFUSER**. Le refus est toujours sûr ; l'écriture ne l'est jamais par défaut.

**N.4 Contrôles pré-écriture obligatoires.** Pour chaque FK candidate : format UUID valide, existence de la ligne cible, unicité du candidat, exhaustivité du référentiel, niveau porteur explicite, absence de contradiction, cohérence relationnelle croisée (client du contrat = client du dossier = client retenu), FK actuelle `NULL`, absence de validation humaine antérieure, contexte global non `AMBIGUOUS`, garde d'idempotence, garde optimiste.

**N.5 Traçabilité.** Toute écriture est reconstituable a posteriori depuis `ai_context` seul : niveau de preuve invoqué, identifiants de preuves, horodatage, source déterministe ou humaine, clé de déduplication de trace.

---

## O. Plan de recette

Format : **Entrée → Preuves → Décision attendue → FK attendues → FK interdites → Statut attendu**.

| # | Entrée | Preuves | Décision | FK attendues | FK interdites | Statut attendu |
|---|---|---|---|---|---|---|
| T-01 | Référence dossier exacte unique citée | N1 | Autoriser selon matrice | `dossier_id` (+ `client_id` par `dossiers.client_id` si rebond autorisé et cohérent) | `contrat_id`, `compagnie_id` | `PROPOSED` évalué, écriture conditionnelle possible |
| T-02 | Expéditeur = `clients.email` unique | N2 | Autoriser selon matrice | `client_id` | `dossier_id`, `contrat_id`, `compagnie_id` | `PROPOSED` évalué, écriture conditionnelle possible |
| T-03 | Numéro de police exact unique | N3 | Autoriser selon matrice | `contrat_id` + rebonds non NULL autorisés (`client_id`, `dossier_id`, `compagnie_id`) | aucune autre | `PROPOSED` évalué, écriture conditionnelle possible |
| T-04 | Domaine professionnel unique (`compagnies`) | N4 | Autoriser selon matrice | `compagnie_id` | `client_id`, `dossier_id`, `contrat_id` | `PROPOSED` évalué, écriture conditionnelle possible |
| T-05 | Personne citée avec email unique, sans N1–N4 | N5 seul | **Refuser** | aucune | toutes | aucune FK ; statut automatique non confirmé |
| T-06 | Nom/prénom cité seul | N7 | **Refuser** | aucune | toutes | `DETECTED` ou `AMBIGUOUS` selon candidats ; aucune FK |
| T-07 | Rattachement historique de la ligne email | N8 | **Refuser** | aucune | toutes | aucune FK |
| T-08 | Client identifié, un seul dossier actif | N2 + N9 | Autoriser `client_id` uniquement si N2 valide ; N9 ne porte rien | `client_id` | **`dossier_id`** | `PROPOSED` évalué si aucune ambiguïté globale |
| T-09 | Numéro de police exact unique avec rebonds cohérents | N3 | Autoriser selon matrice | `contrat_id` + rebonds autorisés | aucune autre | `PROPOSED` évalué, écriture conditionnelle possible |
| T-10 | Deux numéros de police → deux contrats | N3 ×2 | **Refuser** | aucune | toutes | `AMBIGUOUS` global, blocage total |
| T-11 | Email expéditeur correspondant à un seul client | N2 | Autoriser selon matrice | `client_id` | — | `PROPOSED` évalué, écriture conditionnelle possible |
| T-12 | Deux clients homonymes, nom seul | N7 ×2 | **Refuser** | aucune | toutes | `AMBIGUOUS` (`client_multiple`), blocage total |
| T-13 | N2 → client A ; N6 document → client B | N2 + N6 contradictoires | **Refuser** | aucune | toutes | `AMBIGUOUS` global (`donnees_contradictoires`) |
| T-14 | Document rattaché cohérent avec N2 | N2 + N6 convergents | Autoriser uniquement l'écriture portée par N2 ; N6 reste N6 | `client_id` si N2 valide | `dossier_id` sans N1/N3 ; `contrat_id` sans N3 | `PROPOSED` évalué si aucune ambiguïté globale |
| T-15 | Document rattaché contredisant le contrat cité | N3 + N6 contradictoires | **Refuser** | aucune | toutes | `AMBIGUOUS` global |
| T-16 | Contrat déterminé par N3, `contrats.compagnie_id` non NULL | N3 + rebond H.2 | Autoriser selon matrice | `compagnie_id` par rebond si cohérent | — | `PROPOSED` évalué, écriture conditionnelle possible |
| T-17 | N4 → compagnie A ; rebond contrat → compagnie B | N4 + N3 contradictoires | **Refuser** | aucune | toutes | `AMBIGUOUS` global |
| T-18 | Validation humaine explicite d'un candidat ambigu | humain | Autoriser (voie humaine) | valeur choisie | — | `CONFIRMED`, `validated_by` UUID valide, `validated_at` |
| T-19 | Second passage, contexte inchangé, FK déjà écrites | idem T-03 | Refuser (`deja_rattache`) | aucune nouvelle | toutes | inchangé, aucune duplication de trace selon clé K.5 |
| T-20 | Autorisation simultanée `client_id`+`contrat_id`, échec base | N3 + rebond | Rejet global | aucune | toutes | état antérieur intact |
| T-21 | Contexte déjà `CONFIRMED` / `validated_at` renseigné, `force = true` | quelconque | **Refuser** | aucune | toutes | inchangé |
| T-22 | Référentiel `clients` potentiellement tronqué, candidat unique | N2 sur liste non exhaustive | **Refuser** | aucune | `client_id` | `AMBIGUOUS` global, blocage total |
| T-23 | Troncature sur `compagnies` avec N3 valide | N3 + troncature référentiel | **Refuser** | aucune | toutes | `AMBIGUOUS` global, blocage total ; aucune logique mixte |
| T-24 | Numéro de police fourni sous forme d'UUID inexistant ou cible inexistante | N3 invalide | **Refuser** (existence non vérifiée / confusion identifiant métier-UUID) | aucune | toutes | `A_QUALIFIER` ou `AMBIGUOUS` selon cause ; aucune FK |
| T-25 | Contrat cité appartenant à un client différent du N2 | N2 + N3 contradictoires | **Refuser** | aucune | toutes | `AMBIGUOUS` global |
| T-26 | Personne détectée avec email unique et contexte `PROPOSED`, sans N1–N4 | N5 seul + `PROPOSED` | **Refuser** | aucune | toutes | aucune FK ; N5 reste N5 |
| T-27 | Document déjà rattaché unique et contexte `PROPOSED`, sans N1–N4 | N6 seul + `PROPOSED` | **Refuser** | aucune | toutes | aucune FK ; N6 reste N6 |
| T-28 | Email personne détectée + email expéditeur convergent | N5 + N2 convergents | Autoriser uniquement par N2 | `client_id` si N2 valide | autres FK | `PROPOSED` évalué si aucune ambiguïté globale |
| T-29 | N5 convergent avec N1/N3/N4 par corroboration | N5 + N1/N3/N4 | Autoriser uniquement les écritures explicitement portées par N1/N3/N4 et rebonds H.2 | selon matrice D.4/E | toute FK hors matrice/rebond | `PROPOSED` évalué si aucune ambiguïté globale |
| T-30 | Contexte global `AMBIGUOUS` + autre FK déterministe | N1/N2/N3/N4 + ambiguïté ailleurs | **Refuser** | aucune | toutes | `AMBIGUOUS` global, blocage total |
| T-31 | Course concurrente avant UPDATE | preuve autorisée | Rejet par garde optimiste | aucune | toutes | 0 ligne affectée ; nouvelle évaluation obligatoire |
| T-32 | FK renseignée entre lecture et UPDATE | preuve autorisée | Rejet par garde optimiste | aucune | toutes | 0 ligne affectée ; aucun écrasement |
| T-33 | `ai_context` modifié entre lecture et UPDATE | preuve autorisée | Rejet par garde optimiste | aucune | toutes | 0 ligne affectée ; aucun lost update |
| T-34 | Validation humaine intervenue avant UPDATE | preuve autorisée | Rejet par garde optimiste et idempotence humaine | aucune | toutes | 0 ligne affectée ; aucune décision automatique |
| T-35 | Retrait humain puis nouvelle tentative automatique | preuve précédemment autorisée | **Refuser** | aucune | toutes | blocage automatique conformément à l'idempotence humaine |

Chaque scénario devra, au lot d'implémentation, être couvert par au moins un test automatisé sans accès réseau ni base réelle (lecteur simulé strictement typé, comme au Lot 3).

---

## P. GO / NO-GO

| Critère | État |
|---|---|
| N5 reste N5 ; `personnes_detectees[].email` jamais N2 | ✅ corrigé en D, E, F, J, O |
| `PROPOSED` n'autorise jamais seul une écriture | ✅ corrigé en C.2/C.3/D.4/E/N/O |
| Mécanisme de niveau porteur documenté sans modifier le schéma | ✅ C.3 |
| `AMBIGUOUS` global bloque toute écriture automatique | ✅ J.4, L, N, O |
| Garde optimiste contre lost update | ✅ M.4/N.2/O T-31 à T-34 |
| Aucune référence à une table inexistante | ✅ objets vérifiés en base (B.1) |
| Aucune promotion N7 / N8 / N9 | ✅ interdiction explicite (D.1, G.2) |
| Aucun scoring, `preuves[].poids` neutre | ✅ D.1 |
| Aucune écriture possible sans preuve autorisée | ✅ matrice E exhaustive + N.4 |
| Validation humaine protégée | ✅ K, L — `force` sans effet |
| Idempotence humaine et automatique définie | ✅ L, K.5 |
| Contradictions bloquantes et antérieures | ✅ J.1/J.4 |
| Atomicité et concurrence définies | ✅ M |
| Plan de recette complet | ✅ 35 scénarios |

Statut du présent livrable : **DESIGN CORRIGÉ — SOUMIS À AUDIT DG**. Il ne constitue pas un GO développement. Toute implémentation du Lot 4 reste interdite tant qu'un audit DG ultérieur n'a pas explicitement levé le NO-GO développement.

---

## Q. Inventaire des limites et dépendances

1. **Schéma 1.1.0 inchangé** — aucun champ dédié à un journal avant/après structuré ni à un niveau porteur natif. Conventions textuelles (K.3/K.5) et reconstitution par champs existants (C.3) sont des choix de conception, non des extensions.
2. **`crm_emails.ai_metadata` inexistant** — les métadonnées d'ingestion restent dans `triage_ia` / `triage_le`, non modifiés.
3. **Écart documentaire connu** — le DESIGN Lot 3 mentionne `documents.nom` ; la colonne réelle est `documents.file_name`. Non corrigé ici (hors périmètre Lot 3).
4. **`contrats.numero_police` inexistant en base** — l'identifiant métier est `contrats.numero` ; `numero_police` n'existe que dans `ai_context`.
5. **Aucune FK produit sur `crm_emails`** — le produit reste une proposition contextuelle.
6. **Téléphones non normalisés** en base : toute règle N5 fondée sur le téléphone reste durablement non fiable seule.
7. **Exhaustivité des référentiels** — dépend des plafonds et de la pagination du Lot 3 ; toute évolution du volume de données doit être réévaluée.
8. **RLS** — les droits d'écriture réels sur `crm_emails` conditionnent l'implémentation ; aucune élévation de privilège n'est conçue.
9. **Absence d'IHM** — la validation humaine suppose une interface de qualification prévue dans un lot ultérieur ; sans elle, aucun `CONFIRMED` ne peut être produit.
10. **Aucune dépendance à `taches`, `prospects`, `organisations`, `crm_tasks`, `catalogue_produits`, `fn_match_email_sender`** — objets inexistants ou hors périmètre.

---

🟡 **LOT 4 — DESIGN V1.1 CORRIGÉ — SOUMIS À AUDIT DG**
