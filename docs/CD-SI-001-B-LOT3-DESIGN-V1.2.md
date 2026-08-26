# CD-SI-001-B — LOT 3 — DOSSIER DE CONCEPTION V1.2

Moteur de résolution contextuelle des emails (DETECTED → PROPOSED / AMBIGUOUS / A_QUALIFIER)

- Version : V1.2 corrective après audit DG NO-GO V1.1
- Statut : soumis à audit DG
- Corrige : `docs/CD-SI-001-B-LOT3-DESIGN-V1.1.md`
- Référentiel doctrinal : CD-SI-001-B-TECH-V1.2 et CD-SI-001-B-DESIGN-V1.1,
  complété par `docs/CD-SI-001-B-DESIGN-V1.1-erratum-modele.md` (modèle Gemini Flash générique)
- Autres références : Lot 1 validé, Lot 2 validé, CD-SI-001-A existant, Audit technique Lot 3
- Le présent document est la conception spécifique du Lot 3 (CD-SI-001-B-LOT3-DESIGN-V1.2) ;
  aucune nouvelle version documentaire n'est créée
- Nature : document de conception uniquement
- Aucun code, aucune migration, aucune modification BDD, aucun branchement Gmail dans ce document

---

## 0. Objet de la V1.2 corrective

La V1.2 conserve l'architecture générale de la V1.1 et corrige les points bloquants relevés par la
Direction Générale :

1. rétablissement strict de la hiérarchie doctrinale des preuves N1 à N9 de CD-SI-001-B-TECH-V1.2 ;
2. suppression de toute logique de scoring numérique, de pondération ou d'addition de signaux faibles ;
3. reformulation de la convergence afin qu'aucune preuve forte ne masque une contradiction réelle ;
4. correction du traitement des compagnies sans création de niveaux de preuve locaux ;
5. ajout de l'invariant architectural : le Lot 3 ne peut jamais produire `CONFIRMED` ;
6. correction du plan de tests, notamment T-01, T-02, T-03 et ajout d'un test de contradiction forte.

Cette V1.2 ne modifie ni le Lot 1, ni le Lot 2, ni le JSON Schema, ni les types TypeScript, ni le
comportement Gemini.

---

## 1. Vérité technique du dépôt prise en compte

Toute la conception ci-dessous s'appuie exclusivement sur les constats vérifiés lors de l'audit
technique Lot 3.

### 1.1 Objets existants

`public.crm_emails` possède les colonnes réelles suivantes :

| Colonne | Nature constatée | Usage Lot 3 |
|---|---|---|
| `id` | uuid PK | identification de l'email à traiter |
| `gmail_message_id` | text UNIQUE | lecture / traçabilité, non modifié |
| `gmail_thread_id` | text | lecture / traçabilité, non modifié |
| `direction` | text, défaut `entrant` | non modifié |
| `recu_le` | timestamptz | contexte temporel faible éventuel |
| `client_id` | FK nullable vers `clients(id)` ON DELETE SET NULL | lecture seule, jamais écrit |
| `dossier_id` | FK nullable vers `dossiers(id)` ON DELETE SET NULL | lecture seule, jamais écrit |
| `contrat_id` | FK nullable vers `contrats(id)` ON DELETE SET NULL | lecture seule, jamais écrit |
| `compagnie_id` | FK nullable vers `compagnies(id)` ON DELETE SET NULL | lecture seule, jamais écrit |
| `notes` | text | non modifié |
| `created_by` | FK nullable vers `auth.users(id)` | non modifié |
| `created_at` | timestamptz | non modifié |
| `updated_at` | timestamptz | mis à jour mécaniquement si `ai_context` est mis à jour |
| `triage_ia` | jsonb | non modifié |
| `triage_le` | timestamptz | non modifié |
| `ai_context` | jsonb NOT NULL DEFAULT `'{}'::jsonb` | seule cible d'écriture autorisée |

Index constatés : PK sur `id`, unicité `gmail_message_id`, GIN sur `ai_context`, btree sur
`client_id`, `compagnie_id`, `contrat_id`, `dossier_id`.

Tables métier réelles utilisables en lecture : `clients`, `compagnies`, `contrats`, `dossiers`,
`produits`, `produit_familles`, `produit_formules`, `produit_garanties`, `documents`,
`doc_extractions`, `taches`.

### 1.2 Objets absents confirmés

- Tables absentes : `prospects`, `organisations`, `crm_tasks`, `catalogue_produits`,
  `crm_emails_attachments`.
- Colonnes absentes : `crm_emails.status`, `crm_emails.ai_metadata`, `prospect_id`,
  `organisation_id`, `company_id`.
- Fonction/RPC absente : `fn_match_email_sender`.

### 1.3 Substitutions documentaires imposées par la vérité technique

| Objet cité par la documentation amont | Objet réel / traitement Lot 3 |
|---|---|
| `fn_match_email_sender` | logique applicative CD-SI-001-A existante, consommée en lecture si ses effets sont déjà posés dans `crm_emails` |
| `crm_emails.status` | inexistant ; statuts réels portés par les libellés Gmail et `triage_ia`, tous deux hors modification Lot 3 |
| `crm_tasks` | remplacé côté dépôt par `taches`, mais `taches` reste hors périmètre d'écriture Lot 3 |
| `prospect_id` / table `prospects` | les prospects sont représentés par `clients.statut = 'prospect'` |
| `organisation_id` / `company_id` | inexistants ; les compagnies utilisent `crm_emails.compagnie_id` et `contrats.compagnie_id` |
| `catalogue_produits` | `public.produits` et tables associées |
| `crm_emails_attachments` | `documents` / `doc_extractions` pour les informations documentaires disponibles |
| `ai_metadata` | inexistant ; ne pas créer |

Aucune de ces substitutions n'autorise une écriture de FK ou la création d'un objet métier par le
Lot 3.

---

## 2. Périmètre du Lot 3 dans la trajectoire CD-SI-001-B

```text
LOT 1  Ingestion & schéma            ai_context, JSON Schema 1.1.0, types, validateur     [VALIDÉ]
LOT 2  Extraction Gemini             DETECTED, propositions textuelles, aucune FK         [VALIDÉ]
LOT 3  Résolution / proposition      lecture CRM -> propositions dans ai_context seul     [CE LOT]
LOT 4  Preuves déterministes         CONFIRMED éventuel + écritures FK selon doctrine     [HORS LOT 3]
LOT 5  Articulation CD-SI-002        exploitation documentaire approfondie                [HORS LOT 3]
LOT 6  Qualification humaine         IHM, arbitrages et tâches                            [HORS LOT 3]
LOT 7  Recette globale               validation de bout en bout                           [HORS LOT 3]
```

Le Lot 3 prend un `ai_context` au statut `DETECTED`, confronte les entités extraites aux données
réelles du CRM, puis produit des propositions dans `ai_context`. Il ne décide pas définitivement du
rattachement métier.

### 2.1 Invariant architectural CONFIRMED

**LE LOT 3 NE PEUT JAMAIS PRODUIRE `CONFIRMED`.**

Les seules sorties autorisées pour `ai_context.analyse.statut` dans le périmètre Lot 3 sont :

- `DETECTED` si aucune résolution n'est effectuée ou si le contexte reste en simple constat ;
- `PROPOSED` si une ou plusieurs propositions non contradictoires peuvent être formulées ;
- `AMBIGUOUS` si plusieurs candidats, contradictions ou incertitudes bloquantes existent ;
- `A_QUALIFIER` si le contexte est insuffisant, inexploitable ou nécessite une intervention humaine.

`CONFIRMED` relève exclusivement des étapes ultérieures prévues par la doctrine, notamment le Lot 4
et/ou la qualification humaine validée dans les lots dédiés.

---

## 3. Flux normatif du moteur

```text
ai_context DETECTED
   -> validation par le validateur Lot 1
   -> extraction des indices textuels déjà présents dans ai_context
   -> lecture ciblée des référentiels CRM existants
   -> identification des preuves selon N1 à N9, sans renumérotation
   -> association de chaque preuve à son ou ses candidats
   -> recherche explicite des contradictions
   -> vérification de l'unicité par niveau et de la convergence inter-preuves
   -> construction de propositions ou ambiguïtés
   -> validation finale par le validateur Lot 1
   -> UPDATE unique de crm_emails.ai_context si et seulement si le contexte final est valide
```

Le moteur suit l'ordre logique suivant :

```text
preuve -> niveau doctrinal -> unicité -> convergence -> contradiction -> proposition
```

Aucune formule mathématique, pondération numérique ou addition de signaux faibles ne participe à la
décision de statut métier.

---

## 4. Hiérarchie doctrinale des preuves N1 à N9

La hiérarchie ci-dessous est strictement celle de CD-SI-001-B-TECH-V1.2. Le Lot 3 ne la redéfinit pas,
ne la renumérote pas et ne crée aucun niveau local.

| Niveau | Définition doctrinale | Usage Lot 3 |
|---|---|---|
| N1 | Tag Regex Objet `[DOS-XXXXXX]` ou UUID direct | recherche d'un dossier ou objet CRM correspondant à la référence explicite |
| N2 | Correspondance unique de l'email expéditeur | rapprochement exact d'un expéditeur avec un client connu, selon les données disponibles |
| N3 | Numéro de police / numéro de souscription exact unique | rapprochement exact avec `contrats.numero` |
| N4 | Domaine d'email unique d'une organisation professionnelle | rapprochement en lecture seule avec `public.compagnies` (`contact_email`, `site_web`) ; pour les partenaires, uniquement la logique applicative partenaire déjà existante dans le dépôt. Aucune table `organisations` n'existe et aucune n'est créée |
| N5 | Personne citée avec email/téléphone correspondant | rapprochement d'une personne détectée avec `clients.email`, `clients.email2` ou `clients.telephone` |
| N6 | Données OCR de CD-SI-002 cohérentes | cohérence avec `documents` / `doc_extractions` lorsque l'information existe déjà |
| N7 | Nom/prénom cité seul | rapprochement faible sur identité textuelle, jamais suffisant seul en cas de risque d'homonymie. Aucune extension implicite : tout autre signal faible relève de N8 ou N9 |
| N8 | Historique relationnel / contexte faible | contexte faible issu des rattachements déjà connus ou d'interactions passées disponibles |
| N9 | Facteur contextuel, notamment unique dossier actif | facteur contextuel uniquement, jamais promu en preuve forte |

### 4.1 Conséquences normatives

- N1, N2 et N3 restent les niveaux de preuve les plus structurants, mais ne permettent pas d'ignorer
  une contradiction réelle.
- N4 à N6 peuvent renforcer une convergence lorsqu'ils désignent le même candidat ou un objet lié au
  même candidat.
- N7 à N9 sont des signaux faibles ou contextuels : ils ne deviennent jamais une preuve forte par
  accumulation arithmétique.
- Le dossier unique actif relève explicitement de N9 : il peut contextualiser une proposition, mais
  ne devient jamais N1, N2 ou N3.
- La valeur `confiance` présente dans `ai_context` reste une information de contexte et ne peut jamais
  déterminer seule un statut métier.

---

## 5. Lectures BDD autorisées

| Table | Colonnes lues | Usage |
|---|---|---|
| `clients` | `id`, `reference`, `nom`, `prenom`, `email`, `email2`, `telephone`, `date_naissance`, `statut`, `marque` | candidats client / prospect technique (`statut='prospect'`) |
| `dossiers` | `id`, `reference`, `client_id`, `type_assurance`, `statut` | candidats dossier et dossier actif contextuel N9 |
| `contrats` | `id`, `numero`, `client_id`, `dossier_id`, `compagnie_id`, `produit_id`, `statut` | candidats contrat par N3 et liens client/dossier/compagnie |
| `compagnies` | `id`, `nom`, `contact_email`, `site_web`, `statut` | candidats compagnie selon les preuves doctrinales applicables |
| `produits` | `id`, `nom`, `code_produit`, `compagnie_id`, `famille_id`, `statut` | candidats produit reliés aux contrats / compagnies |
| `produit_familles` | `id`, `code`, `libelle` | contexte de famille produit |
| `documents` | `id`, `client_id`, `dossier_id`, `contrat_id`, `nom`, `type`, `classification` | corrélation documentaire CD-SI-002 en lecture seule |
| `doc_extractions` | `document_id`, `statut`, données extraites disponibles | preuves N6 lorsque cohérentes et déjà présentes |
| `crm_emails` | FK existantes, `ai_context`, `triage_ia`, `triage_le` | lecture du contexte et des rattachements existants, sans écriture hors `ai_context` |

Aucune nouvelle vue, table, colonne, migration, RPC ou fonction SQL n'est requise par le design V1.2.

---

## 6. Règles par entité

### 6.1 Client

Sources doctrinales possibles :

- N2 : email expéditeur correspondant de façon unique à `clients.email` ou `clients.email2` ;
- N5 : personne citée avec email ou téléphone correspondant à un client ;
- N6 : OCR CD-SI-002 cohérent pointant vers un client déjà existant ;
- N7 : nom/prénom cité seul ;
- N8 : historique relationnel faible ;
- N9 : dossier unique actif du client, uniquement comme facteur contextuel.

Règles :

1. collecter tous les candidats client produits par les preuves disponibles ;
2. vérifier si chaque preuve pointe vers le même client ou vers des clients différents ;
3. si un candidat unique est désigné par une preuve admissible et qu'aucune contradiction n'existe,
   `client_id_propose` peut être renseigné dans `ai_context` avec statut d'entrée `PROPOSED` ;
4. si plusieurs candidats existent, ou si une preuve indépendante pointe vers un autre client,
   `client_id_propose = null` pour l'entité concernée et l'analyse globale devient `AMBIGUOUS` ;
5. si le seul signal est faible ou contextuel et insuffisant, la sortie reste `DETECTED` ou
   `A_QUALIFIER` selon l'exploitabilité du contexte.

Aucun `crm_emails.client_id` n'est écrit par le Lot 3.

### 6.2 Prospect

Le dépôt ne contient pas de table `prospects` ni de colonne `prospect_id`. Un prospect est représenté
par une ligne `clients` portant `statut = 'prospect'`.

Règles :

- le moteur peut proposer un `client_id_propose` dont le rôle supposé est `prospect` ;
- il ne crée jamais de prospect ;
- il n'écrit jamais `prospect_id`, colonne inexistante ;
- les ambiguïtés prospect/client sont représentées comme ambiguïtés de candidats clients.

### 6.3 Organisation

Le dépôt ne contient pas de table `organisations` ni de colonne `organisation_id`.

Règles :

- une organisation citée peut rester une donnée textuelle dans `ai_context` ;
- lorsqu'elle correspond à une compagnie réelle de `public.compagnies`, le moteur peut renseigner
  `correspondant.compagnie_id` dans `ai_context` comme proposition contextuelle, avec le statut
  approprié (`PROPOSED` ou `AMBIGUOUS`). Le champ `compagnie_id_propose` n'existe pas au schéma et
  n'est jamais utilisé ;
- `correspondant.compagnie_id` est une information de contexte/proposition interne à `ai_context` :
  ce n'est pas la FK `crm_emails.compagnie_id`, que le Lot 3 n'écrit jamais ;
- aucune `organisation_id` n'est écrite ou inventée ;
- aucune organisation n'est créée.

### 6.4 Compagnie

Le Lot 3 ne définit aucun niveau de preuve local pour les compagnies. Les indices techniques de
compagnie sont rattachés exclusivement à la hiérarchie doctrinale N1 à N9.

Exemples de rattachement doctrinal :

| Indice technique | Niveau doctrinal applicable | Remarque |
|---|---|---|
| Contrat trouvé par numéro de police unique, avec `contrats.compagnie_id` | N3 | la compagnie est dérivée du contrat identifié par N3, pas d'un niveau local inventé |
| Domaine professionnel de l'expéditeur correspondant à une compagnie unique | N4 | uniquement si le domaine est professionnel et unique |
| Nom de compagnie cité dans le texte ou par Gemini | N7 ou signal textuel équivalent | signal faible tant qu'il n'est pas corroboré |
| Document/OCR mentionnant une compagnie cohérente | N6 | seulement via données CD-SI-002 déjà existantes |
| Rattachement historique faible à une compagnie | N8 | contexte faible |

Interdictions explicites :

- ne pas écrire « nom exact = N1 » ;
- ne pas écrire « contact_email = N3 » ;
- ne pas créer de niveau spécifique compagnie en dehors de N1 à N9 ;
- ne pas écrire `crm_emails.compagnie_id`.

### 6.5 Dossier

Sources doctrinales possibles :

- N1 : tag objet conforme `[DOS-XXXXXX]` ou UUID direct ;
- N6 : OCR CD-SI-002 cohérent ;
- N8 : historique relationnel faible ;
- N9 : dossier unique actif, facteur contextuel uniquement.

Règles :

- une référence dossier conforme N1 peut produire une proposition si elle correspond à un dossier
  unique et qu'aucune autre preuve indépendante ne pointe vers un autre client/dossier ;
- un dossier unique actif ne suffit pas à lui seul à produire une certitude forte ;
- en cas de dossier du Client A et contrat du Client B, aucune sélection automatique n'est effectuée ;
- `crm_emails.dossier_id` n'est jamais écrit par le Lot 3.

### 6.6 Contrat

Sources doctrinales possibles :

- N3 : numéro de police ou numéro de souscription exact unique ;
- N6 : OCR CD-SI-002 cohérent ;
- N8 : historique relationnel faible ;
- N9 : contexte de dossier actif, uniquement comme facteur contextuel.

Règles :

- un numéro de police exact unique est une preuve N3 ;
- si plusieurs contrats portent ou approchent la même référence, la sortie est `AMBIGUOUS` ;
- si le contrat identifié appartient à un autre client que celui proposé par une preuve indépendante,
  la contradiction bloque la proposition automatique ;
- le multi-contrat est représenté comme ambiguïté explicite ;
- `crm_emails.contrat_id` n'est jamais écrit par le Lot 3.

### 6.7 Produit

Sources doctrinales possibles :

- N3 si le produit est dérivé d'un contrat trouvé par numéro de police exact unique ;
- N6 si une donnée OCR cohérente contient un produit identifiable ;
- N7 si seul un libellé produit est cité textuellement ;
- N8 si l'historique relationnel suggère un produit sans preuve directe.

Règles :

- le produit peut être proposé dans `ai_context` uniquement comme proposition liée aux preuves et
  aux objets lus ;
- un nom de produit seul reste un signal faible et ne suffit pas à masquer une contradiction ;
- aucun produit n'est créé ou modifié ;
- aucune FK produit métier n'est écrite dans `crm_emails`.

---

## 7. Gestion des rebonds

Les rebonds sont des chemins de contexte, pas des raccourcis de décision.

### 7.1 Partenaire → client

Si un email provient d'un partenaire ou d'un tiers professionnel :

1. la preuve N4 peut identifier le domaine professionnel du partenaire ;
2. les personnes, dossiers, contrats ou pièces mentionnés sont ensuite évalués selon leurs propres
   niveaux N1 à N9 ;
3. le partenaire ne devient pas automatiquement client ;
4. toute discordance entre partenaire, client cité et contrat cité produit une ambiguïté.

### 7.2 Fournisseur → client

Même règle que pour les partenaires : le fournisseur est un contexte professionnel, pas une preuve de
rattachement client définitif.

### 7.3 Compagnie → contrat → client

Si une compagnie est identifiée et qu'un contrat est ensuite trouvé :

- la compagnie peut aider à filtrer les contrats candidats ;
- le contrat ne peut être proposé que si la preuve doctrinale applicable, notamment N3, est unique ;
- le client dérivé du contrat doit converger avec les autres preuves client ;
- si le contrat pointe vers Client A et une personne/email pointe vers Client B, la sortie est
  `AMBIGUOUS`.

---

## 8. Convergence et contradictions

### 8.1 Ordre obligatoire

Avant toute proposition, le moteur doit :

1. identifier toutes les preuves disponibles ;
2. qualifier chaque preuve selon N1 à N9 ;
3. lister les candidats désignés par chaque preuve ;
4. vérifier l'unicité des candidats par preuve ;
5. rechercher les contradictions entre preuves indépendantes ;
6. vérifier la convergence des candidats et des relations entre entités ;
7. seulement ensuite construire `PROPOSED`, `AMBIGUOUS`, `DETECTED` ou `A_QUALIFIER`.

### 8.2 Contradictions bloquantes

Une preuve forte ne permet jamais d'ignorer une contradiction réelle avec une autre preuve
indépendante et cohérente.

Exemples de contradictions bloquantes :

- N1 identifie un dossier appartenant au Client A, tandis que N2 identifie un expéditeur Client B ;
- N3 identifie un contrat Client A, tandis que N5 identifie une personne Client B ;
- N6 identifie un document rattaché au Dossier A, tandis que N1 cite le Dossier B ;
- N4 identifie une compagnie unique, mais N3 identifie un contrat appartenant à une autre compagnie.

Dans ces cas :

- aucune sélection automatique n'est effectuée ;
- les champs `*_id_propose` de l'entité concernée restent `null` lorsqu'un choix serait nécessaire ;
- `ai_context.analyse.statut = "AMBIGUOUS"` ;
- une ambiguïté de type `donnees_contradictoires` est enregistrée ;
- aucune FK maîtresse n'est écrite.

### 8.3 Signaux faibles

Les signaux N7, N8 et N9 peuvent expliquer un contexte, mais ne peuvent jamais devenir une preuve
forte par addition. Plusieurs signaux faibles concordants peuvent justifier une proposition prudente
si aucun conflit n'existe, mais ne peuvent pas produire `CONFIRMED` et ne peuvent pas prévaloir sur
une contradiction.

---

## 9. Transitions de statut autorisées

| Situation | `ai_context.analyse.statut` Lot 3 | Commentaire |
|---|---|---|
| Contexte non traité ou résolution non effectuée | `DETECTED` | conservation du statut Lot 2 |
| Un candidat unique par entité concernée, preuves convergentes, aucune contradiction | `PROPOSED` | proposition seulement, jamais FK |
| Plusieurs candidats ou contradiction entre preuves | `AMBIGUOUS` | qualification ultérieure nécessaire |
| Données insuffisantes, contexte invalide, entité inconnue ou erreur exploitable seulement manuellement | `A_QUALIFIER` | sans création de tâche par le Lot 3 |

Interdiction absolue : `CONFIRMED` ne peut pas être produit, écrit, préparé ou déduit par le Lot 3.

---

## 10. Structure des données proposées dans `ai_context`

Le Lot 3 conserve le schéma Lot 1 (`schema_version = "1.1.0"`) et ne crée pas de deuxième schéma.

### 10.1 Champs mis à jour dans `ai_context`

Le Lot 3 peut enrichir uniquement les zones existantes du contexte validé :

- `correspondant` : rôle supposé, proposition de client ou compagnie lorsque représentable par le
  schéma, provenance déterministe, confiance contextuelle non décisionnelle ;
- `personnes_detectees[]` : `client_id_propose` lorsque la proposition est unique et non
  contradictoire, sinon `null` avec ambiguïté ;
- `dossiers_detectes[]` : `dossier_id_propose` si proposition unique et non contradictoire, sinon
  `null` ;
- `contrats_detectes[]` : `contrat_id_propose` si proposition unique et non contradictoire, sinon
  `null` ;
- `produits_cites[]` : `produit_id_propose` si proposition unique et non contradictoire, sinon
  `null` ;
- `documents_associes[]` : proposition documentaire si cohérente avec les données CD-SI-002 déjà
  présentes ;
- `preuves[]` : ajout de preuves de rapprochement nommées par type et niveau doctrinal, sans poids
  numérique décisionnel ;
- `ambiguities[]` : ajout des ambiguïtés multi-candidats, contradictions ou données insuffisantes ;
- `analyse` : statut global autorisé, horodatage d'analyse, provenance et obligation de validation
  humaine si nécessaire.

### 10.2 Provenance des propositions

Chaque proposition doit indiquer :

- la source `regle_deterministe` ou équivalent déjà admis par le schéma ;
- le champ ou l'indice utilisé ;
- le niveau doctrinal N1 à N9 ;
- les identifiants de preuves associés lorsque le schéma le permet ;
- l'absence de validation humaine (`validated_by` et `validated_at` non renseignés par le Lot 3).

La provenance sert à l'audit et à la qualification ultérieure, pas à transformer la proposition en
rattachement définitif.

### 10.3 Multi-candidats avec le schéma 1.1.0

Le schéma `ai_context` 1.1.0 permet une représentation limitée des multi-candidats. La convention
Lot 3 est donc :

1. ne pas choisir arbitrairement entre plusieurs candidats ;
2. renseigner `*_id_propose = null` pour l'entité à arbitrer lorsqu'une sélection unique serait
   trompeuse ;
3. enregistrer `analyse.statut = "AMBIGUOUS"` ;
4. inscrire une entrée `ambiguities[]` avec type explicite, candidats textuels disponibles,
   description et `resolution_requise: true` ;
5. conserver les preuves dans `preuves[]` afin que le Lot 6 ou un lot ultérieur puisse arbitrer.

Écart résiduel assumé : le schéma 1.1.0 ne fournit pas une structure riche de candidats typés avec
preuves détaillées par candidat. Aucune évolution de schéma n'est proposée dans le Lot 3.

---

## 11. Idempotence

Règles d'idempotence attendues pour l'implémentation future :

- ne traiter que les contextes `DETECTED`, sauf relance explicite encadrée ;
- ne jamais écraser un contexte portant `analyse.validated_at`, `analyse.validated_by`, une
  provenance humaine ou un statut `CONFIRMED` hérité d'un lot ultérieur ;
- produire le même résultat à référentiel inchangé ;
- ne créer aucun doublon, car l'unique écriture autorisée est la mise à jour de la ligne email
  existante ;
- conserver les informations du Lot 2 qui ne sont pas concernées par la résolution.

---

## 12. Gestion des erreurs et cas limites

| Cas | Sortie attendue | Écritures métier |
|---|---|---|
| Email introuvable | aucune écriture, motif `email_introuvable` | aucune |
| `ai_context` vide ou non conforme | aucune écriture ou `A_QUALIFIER` si contexte minimal valide peut être conservé | aucune |
| Statut courant non éligible | aucune écriture, motif `statut_non_eligible` | aucune |
| Référentiel indisponible | `A_QUALIFIER` ou conservation `DETECTED`, selon contexte valide disponible | aucune |
| Trop de candidats | `AMBIGUOUS`, ambiguïté multi-candidats | aucune |
| Contradiction entre preuves | `AMBIGUOUS`, ambiguïté `donnees_contradictoires` | aucune |
| Sortie construite non conforme au validateur Lot 1 | rejet avant persistance | aucune |

Aucun cas d'erreur ne produit de FK, de `CONFIRMED`, de tâche, de prospect, de contrat, de produit ou
d'appel Gemini.

---

## 13. Étanchéité du Lot 3

Les règles suivantes sont absolues :

- aucune écriture de `crm_emails.client_id` ;
- aucune écriture de `crm_emails.dossier_id` ;
- aucune écriture de `crm_emails.contrat_id` ;
- aucune écriture de `crm_emails.compagnie_id` ;
- aucune écriture de `prospect_id`, `organisation_id` ou `company_id`, colonnes inexistantes ;
- aucun `INSERT` ;
- aucun `UPSERT` ;
- aucun `DELETE` ;
- aucune RPC mutante ;
- aucune création de prospect ;
- aucune création de tâche ;
- aucune création ou modification de contrat ;
- aucune création ou modification de produit ;
- aucun appel Gemini ;
- aucun branchement Gmail ;
- aucune migration ;
- aucune modification du JSON Schema, des types ou du validateur Lot 1 ;
- aucune modification du comportement Lot 2.

Le seul `UPDATE` autorisé dans l'implémentation future reste :

```text
UPDATE public.crm_emails SET ai_context = <contexte_validé>
```

---

## 14. Dépendances réelles du Lot 3

- Lot 1 : schéma JSON `email-context-v1.2.json`, types et validateur existants ;
- Lot 2 : contexte `DETECTED` déjà produit et validé, sans réappel Gemini ;
- CD-SI-001-A : rattachements déjà présents dans `crm_emails` lus comme contexte, jamais modifiés ;
- CD-SI-002 : `documents` et `doc_extractions` lus uniquement lorsque les données existent ;
- référentiels CRM : `clients`, `dossiers`, `contrats`, `compagnies`, `produits` et tables associées,
  en lecture seule.

---

## 15. Impact sur RPC, fonctions serveur et Gmail

- Aucune RPC existante n'est requise pour être modifiée.
- Aucune nouvelle RPC ou fonction SQL n'est requise par le design V1.2.
- L'absence de `fn_match_email_sender` est actée : le Lot 3 ne la crée pas.
- Le workflow Gmail, les libellés Gmail, `triage_ia` et `triage_le` restent hors périmètre.
- Gemini n'est pas rappelé : son travail est terminé au Lot 2.

---

## 16. Tests obligatoires corrigés

### 16.1 Tests unitaires

T-01 — Tag / référence dossier conforme N1

- Donnée : objet ou contenu avec tag Regex `[DOS-XXXXXX]` ou UUID direct correspondant à un dossier
  unique.
- Attendu : preuve classée N1, proposition dossier possible uniquement si aucune contradiction ;
  aucune FK écrite.

T-02 — Numéro de police exact N3

- Donnée : numéro de police ou de souscription exact correspondant à un contrat unique.
- Attendu : preuve classée N3, proposition contrat possible uniquement si convergence ; aucune FK
  écrite.

T-03 — Email expéditeur exact N2

- Donnée : expéditeur correspondant de façon unique à un email client connu.
- Attendu : preuve classée N2, proposition client possible uniquement si aucune contradiction ;
  aucune FK écrite.

T-04 — Domaine professionnel unique N4

- Donnée : domaine d'email professionnel correspondant à une compagnie ou organisation
  professionnelle représentée dans les données existantes.
- Attendu : preuve N4, proposition ou contexte compagnie selon convergence ; aucune FK écrite.

T-05 — Personne citée avec email ou téléphone N5

- Donnée : personne citée avec email/téléphone correspondant à un client unique.
- Attendu : preuve N5, proposition client possible si non contradictoire.

T-06 — Données OCR CD-SI-002 cohérentes N6

- Donnée : données `documents` / `doc_extractions` déjà présentes et cohérentes.
- Attendu : preuve N6, proposition possible si convergence ; aucune modification documentaire.

T-07 — Nom/prénom seul N7

- Donnée : nom/prénom seul.
- Attendu : signal faible N7 ; homonymie ou incertitude → `AMBIGUOUS` ou `A_QUALIFIER`, jamais
  preuve forte par addition.

T-08 — Historique relationnel N8

- Donnée : contexte relationnel faible disponible.
- Attendu : utilisé comme contexte, jamais comme décision définitive.

T-09 — Dossier unique actif N9

- Donnée : un seul dossier actif existe pour un client possible.
- Attendu : facteur contextuel N9 uniquement ; interdiction de le transformer en N1/N2/N3.

T-10 — Plusieurs personnes candidates

- Attendu : aucune sélection arbitraire ; `client_id_propose = null` pour l'entité à arbitrer ;
  `AMBIGUOUS` et ambiguïté multi-candidats.

T-11 — Plusieurs contrats candidats

- Attendu : aucune sélection arbitraire ; `contrat_id_propose = null` pour l'entité à arbitrer ;
  `AMBIGUOUS` et ambiguïté multi-contrats.

T-12 — Contradiction forte entre deux preuves indépendantes

- Donnée : une preuve forte identifie le Client A, une autre preuve indépendante et cohérente
  identifie le Client B.
- Attendu : aucune sélection automatique ; `*_id_propose = null` pour l'entité concernée ;
  `analyse.statut = "AMBIGUOUS"` ; ambiguïté `donnees_contradictoires` enregistrée ; aucune FK
  écrite.

T-13 — Compagnie déduite d'un contrat N3

- Donnée : numéro de police exact unique relié à une compagnie via `contrats.compagnie_id`.
- Attendu : la compagnie est proposée comme conséquence du contrat N3, sans niveau local inventé.

T-14 — Nom de compagnie cité seul

- Attendu : signal textuel faible, pas N1 local ; proposition seulement si convergence et absence de
  contradiction.

T-15 — Contexte non `DETECTED`

- Attendu : aucune écriture sauf relance explicite encadrée ; validation humaine et `CONFIRMED`
  protégés.

T-16 — Impossibilité de produire `CONFIRMED`

- Donnée : scénarios favorables, ambigus, contradictoires et en erreur.
- Attendu : aucune sortie Lot 3 ne contient `analyse.statut = "CONFIRMED"` ni statut d'entrée
  `CONFIRMED` généré par le moteur.

T-17 — Idempotence

- Attendu : deux exécutions sur le même contexte et le même référentiel produisent la même résolution,
  hors horodatages techniques.

T-18 — Validation finale Lot 1

- Attendu : tout contexte écrit est accepté par le validateur existant du Lot 1 ; sinon aucun write.

T-19 — Absence de scoring cumulatif

- Attendu : aucune formule de somme, poids, majoration ou transformation de signaux faibles en preuve
  forte par addition.

T-20 — Absence d'écritures hors `ai_context`

- Attendu : aucune FK, aucun insert, aucun upsert, aucun delete, aucune tâche, aucun prospect, aucun
  contrat, aucun produit.

### 16.2 Tests d'intégration

1. Email `DETECTED` avec tag dossier N1 convergent → `ai_context` passe à `PROPOSED`, FK inchangées.
2. Email `DETECTED` avec numéro de police N3 convergent → proposition contrat, FK inchangées.
3. Email `DETECTED` avec email expéditeur N2 convergent → proposition client, FK inchangées.
4. Email avec contradiction N1/N2 ou N3/N5 → `AMBIGUOUS`, aucune FK écrite.
5. Email avec plusieurs contrats plausibles → `AMBIGUOUS`, aucune sélection arbitraire.
6. Email avec seul dossier actif → N9 contextuel, jamais promu en preuve forte.
7. Email avec documents CD-SI-002 disponibles → lecture seule de `documents` / `doc_extractions`.
8. `triage_ia`, `triage_le`, libellés Gmail et workflow Gmail inchangés.
9. Tables `clients`, `dossiers`, `contrats`, `produits`, `compagnies`, `documents`, `doc_extractions`,
   `taches` inchangées en comptage et contenu métier.
10. Suites Lot 1 et Lot 2 toujours vertes après implémentation future.

---

## 17. Critères GO / NO-GO du Lot 3

### 17.1 GO développement

GO seulement si l'implémentation future respecte tous les critères suivants :

- hiérarchie N1 à N9 strictement conforme à CD-SI-001-B-TECH-V1.2 ;
- aucune pondération numérique, formule cumulative ou majoration ;
- contradictions recherchées avant proposition ;
- aucune preuve forte ne masque une contradiction réelle ;
- `CONFIRMED` impossible dans tout chemin Lot 3 ;
- écriture unique limitée à `crm_emails.ai_context` ;
- aucune FK maîtresse de `crm_emails` écrite ;
- aucun prospect, contrat, produit, document ou tâche créé ou modifié ;
- aucun appel Gemini ;
- aucun branchement Gmail ;
- aucune migration ;
- schéma, types et validateur Lot 1 inchangés ;
- comportement Lot 2 inchangé ;
- tests T-01 à T-20 et tests d'intégration couverts.

### 17.2 NO-GO développement

NO-GO si l'un des éléments suivants apparaît :

- renumérotation ou requalification locale des preuves N1 à N9 ;
- scoring numérique ou addition de signaux faibles ;
- statut `CONFIRMED` produit ou préparé par le Lot 3 ;
- écriture de `client_id`, `dossier_id`, `contrat_id`, `compagnie_id`, `prospect_id`,
  `organisation_id` ou `company_id` ;
- création de table, colonne, RPC, fonction ou migration ;
- création de prospect, tâche, contrat, produit ou document ;
- appel Gemini ;
- modification de Lot 1 ou Lot 2 ;
- branchement Gmail.

---

## 18. Écarts résiduels et risques assumés

| Écart / risque | Traitement V1.2 |
|---|---|
| Objets documentaires absents du dépôt (`prospects`, `organisations`, `crm_tasks`, `catalogue_produits`, `crm_emails_attachments`, `fn_match_email_sender`, `crm_emails.status`, `ai_metadata`) | substitutions explicites en section 1 ; aucune création dans le Lot 3 |
| Schéma `ai_context` 1.1.0 limité pour les multi-candidats | représentation via `ambiguities[]`, `preuves[]` et champs proposés à `null` en cas d'arbitrage nécessaire |
| CD-SI-001-A dispersé dans le code | consommé uniquement en lecture via les FK déjà posées ; pas de refactor dans le Lot 3 |
| Dossier unique actif potentiellement tentant comme preuve forte | explicitement fixé N9 seulement, facteur contextuel non promouvable |
| Compagnies difficiles à rattacher sans table organisations | rattachement uniquement via niveaux doctrinaux applicables, sans niveau local inventé |
| Interfaces CD-SI-002 partielles | N6 utilisé uniquement si données déjà disponibles et cohérentes ; approfondissement renvoyé au Lot 5 |

---

## 19. Non-modification des lots validés

La V1.2 corrective ne demande aucune modification de :

- fichiers Lot 1 ;
- fichiers Lot 2 ;
- JSON Schema ;
- types TypeScript ;
- validateur Zod ;
- comportement Gemini ;
- migrations existantes ;
- tables ou colonnes existantes ;
- workflow Gmail.

---

🟡 LOT 3 — DESIGN V1.2 CORRIGÉ — PRÊT POUR AUDIT
