# CD-SI-001-B — LOT 3 — CORRECTIF Q.11 : PROTECTION DES SENTINELLES HUMAINES
## DESIGN V1.1 — DOCUMENT DE CONCEPTION (AUCUN CODE)

Version : V1.1. Remplace fonctionnellement la V1.0 (conservée, non supprimée).
Objet de la révision : lever les écarts **M-1** (round-trip `updated_at`), **M-2**
(formulation de l'Option B et du paramètre `force`), **m-1** (état observé unique),
**m-2** (rattachement de Q11-07 à Q.4) et fermer la formulation **Q.3** (rôle des FK
dans la garde), conformément à l'AUDIT DG FINAL du DESIGN Q.11 V1.0.
Aucune doctrine existante n'est modifiée : N1→N9 inchangés, aucun nouveau niveau,
aucun scoring, `schema_version = "1.1.0"`, aucun nouveau champ JSON, aucune FK écrite
par Q.11, aucun INSERT / UPSERT / DELETE / RPC, aucun Gemini, aucun Gmail,
aucun changement Lot 1, Lot 2, Lot 3, Lot 4.

Statut : conception uniquement. Aucun code, aucune migration, aucune modification BDD,
aucun test ajouté, aucun Lot 4 modifié, aucun branchement Lot 3 → Lot 4, aucun Gmail,
aucun Lot 5. Le gel du branchement Lot 3 → Lot 4 est maintenu.

Référentiels lus pour cette conception :
- `src/lib/email-context-resolver.server.ts` (Lot 3, couche serveur)
- `src/lib/email-context-resolution.ts` (Lot 3, moteur pur)
- `src/lib/email-context-schema.ts` + `src/lib/email-context-types.ts` (Lot 1, schéma 1.1.0)
- `src/lib/email-fk-authorization.server.ts` (Lot 4, patron de garde optimiste déjà validé)
- `docs/CD-SI-001-B-LOT3-DESIGN-V1.2.md`, `docs/CD-SI-001-B-LOT4-DESIGN-V1.2.md`
- schéma PostgreSQL réel de `public.crm_emails`

---

## A. OBJET

Fermer définitivement la course suivante :

```text
lecture Lot 3  →  validation humaine concurrente  →  écriture Lot 3  →  effacement des sentinelles  →  Lot 4
```

Le correctif conçu ici a deux volets complémentaires, décidés par la DG :
- **Option A (mécanisme)** : garde optimiste sur l'unique `UPDATE` du Lot 3.
- **Option B (doctrine)** : le Lot 3 ne doit jamais effacer une sentinelle humaine
  présente dans l'état qu'il reçoit, même en l'absence de concurrence.

Option B ne remplace pas Option A : A ferme la fenêtre temporelle, B ferme la faute
logique. Les deux sont requises.

---

## B. CONSTAT

État actuel du Lot 3 (`email-context-resolver.server.ts`) :

1. `peutCroiserContexte` (l. 76-97) contrôle correctement les sentinelles humaines
   (`analyse.validated_at`, `analyse.validated_by`, `analyse.provenance.source === "humain"`,
   `analyse.statut === "CONFIRMED"`) — **mais uniquement sur l'objet déjà chargé en mémoire**.
2. `ecrireAiContext` (l. 277-284) exécute
   `update({ ai_context }).eq("id", emailId)` : **aucun prédicat d'état**.
3. `croiserEtEnregistrerContexteEmail` (l. 429-474) enchaîne
   `lireEmail` → garde en mémoire → référentiels (plusieurs SELECT réseau) → croisement →
   validation → `ecrireAiContext`. La fenêtre entre lecture et écriture est longue
   (plusieurs allers-retours réseau, dont la pagination complète des compagnies).
4. Le contexte produit par le moteur pur reconstruit `analyse` et positionne
   `validated_by: null`, `validated_at: null`, `validation_humaine_requise: true`,
   `provenance.source` déterministe.

Conséquence : une validation humaine survenue pendant la fenêtre est écrasée silencieusement.
Le Lot 4, qui s'appuie sur ces sentinelles comme préconditions de refus, peut alors
autoriser des FK sur un email en réalité validé/CONFIRMÉ par un humain.

À noter : le Lot 4 est déjà correct sur ce point (`ecrivainSupabase.appliquerEcritures`,
l. 123-157) ; l'écart est **exclusivement** dans le Lot 3.

---

## C. CAUSE RACINE

**Contrôle d'état effectué en mémoire, décision appliquée sans prédicat en base.**
Le Lot 3 vérifie un état `T0` et écrit à `T2` sans revérifier atomiquement que l'état
observé est toujours l'état courant. C'est un *lost update* classique, aggravé par le fait
que la valeur écrasée (les sentinelles) est précisément la valeur de sécurité du Lot 4.

Cause racine secondaire : la reconstruction inconditionnelle de `analyse` par le moteur pur,
qui ne se demande pas si l'état entrant portait déjà une marque humaine.

---

## D. SCÉNARIO DE COURSE

| Temps | Acteur | Effet |
|---|---|---|
| T0 | Lot 3 | `SELECT` de `crm_emails` : `analyse.statut = DETECTED`, `validated_by = null`, `validated_at = null`, `provenance.source = "gemini"` → garde passée |
| T0+ | Lot 3 | 5 à 8 SELECT de référentiels (clients, dossiers, contrats, compagnies paginées, produits, documents) — fenêtre de plusieurs centaines de ms |
| T1 | Humain (IHM) | valide l'email : `validated_by = <uuid>`, `validated_at = <iso>`, `provenance.source = "humain"`, éventuellement `statut = CONFIRMED` |
| T2 | Lot 3 | `UPDATE ... WHERE id = :id` → **succès**, sentinelles remises à null, `provenance.source` déterministe, statut recalculé |
| T3 | Lot 4 | lit un état sans sentinelle → considère l'email éligible → écrit des FK non voulues |

Résultat exigé après correctif : **T2 = refus atomique** (0 ligne affectée), sans reprise
aveugle et sans second `UPDATE`.

---

## E. PRINCIPES INVARIANTS

I-1. Le Lot 3 conserve **une seule mutation** : `UPDATE public.crm_emails SET ai_context = ...`.
I-2. Aucune FK n'est écrite par le Lot 3 (`client_id`, `dossier_id`, `contrat_id`, `compagnie_id`).
I-3. `schema_version` reste `"1.1.0"`, le JSON Schema est inchangé, **aucun nouveau champ JSON**.
I-4. Doctrine N1–N9 inchangée, aucun scoring, `preuves[].poids` toujours ni lu ni écrit.
I-5. Aucune promotion : jamais `CONFIRMED` produit par le Lot 3.
I-6. Lot 2 inchangé, Lot 4 inchangé, aucune FK supplémentaire, aucun nouveau niveau.
I-7. Aucune modification BDD requise (voir F.4 : `updated_at` existe déjà, aucun trigger à créer).
I-8. Un refus n'est jamais un succès partiel : soit 1 ligne affectée, soit rien.
I-9. Aucune reprise automatique (`retry`) : le conflit est remonté au caller.

---

## F. GARDE OPTIMISTE RETENUE

### F.1 État observé au moment de la lecture

`LigneEmailLot3` est déjà lue par `lireEmail` avec exactement les colonnes utiles.
L'état observé retenu pour la garde est :

| # | Élément observé | Source |
|---|---|---|
| 1 | `ai_context` complet (objet JSON tel que lu) | `crm_emails.ai_context` |
| 2 | `ai_context->analyse->>statut` | dérivé |
| 3 | `ai_context->analyse->>validated_by` | dérivé (sentinelle) |
| 4 | `ai_context->analyse->>validated_at` | dérivé (sentinelle) |
| 5 | `ai_context->analyse->provenance->>source` | dérivé (sentinelle) |
| 6 | `updated_at` | `crm_emails.updated_at` (voir F.4) |

**Rôle des 4 FK dans la garde (fermeture de Q.3, formulation définitive)** :
les colonnes `client_id`, `dossier_id`, `contrat_id`, `compagnie_id` peuvent être lues
dans `LigneEmailLot3`, mais elles n'apparaissent **pas** dans la garde du Lot 3.
Lorsqu'une FK apparaît dans une garde — que ce soit ici ou dans le Lot 4 — elle n'a
qu'un seul sens possible :

> « état observé de la ligne source servant à détecter une modification concurrente »,

et **jamais** « autorisation d'écriture ». Q.11 **ne modifie aucune FK** : la seule
colonne mutée par le Lot 3 reste `ai_context`. Position définitive du design : les FK
sont **exclues** de la garde du Lot 3, parce qu'une écriture de FK légitime par le
Lot 4 ne doit pas invalider une résolution de contexte, et parce que leur inclusion
ne protégerait aucune sentinelle humaine.

### F.2 Prédicats PostgREST cibles

Transposition directe du patron Lot 4 (`email-fk-authorization.server.ts` l. 123-157) :

```text
update({ ai_context: <nouveau> })
  .eq("id", emailId)
  .filter("ai_context", "eq", JSON.stringify(<ai_context observé>))
  .filter("ai_context->analyse->>statut", "eq", <statut observé ou "">)
  .filter("ai_context->analyse->>validated_by", <"eq" | "is">, <valeur | null>)
  .filter("ai_context->analyse->>validated_at", <"eq" | "is">, <valeur | null>)
  .filter("ai_context->analyse->provenance->>source", <"eq" | "is">, <valeur | null>)
  .filter("updated_at", "eq", <updated_at observé — chaîne brute, voir F.5>)
  .select("id")
```

Le `.select("id")` est indispensable : il seul permet de compter les lignes réellement
affectées et donc de distinguer succès et conflit.

### F.3 Comportement

- **1 ligne affectée** → succès ; retour inchangé (`ecrit: true`, statut, contexte, résolutions).
- **0 ligne affectée** → **refus**, motif `garde_optimiste`. Aucun second `UPDATE`,
  aucun `retry`, aucune relecture-réécriture. Le caller décide (typiquement : ne rien faire,
  l'état courant appartient à l'humain).
- **Erreur BDD** → refus, motif `erreur_base` + `detail` = message. Jamais de succès.
- **> 1 ligne affectée** → impossible (`id` est PK) ; traité par prudence comme refus
  `garde_optimiste` (anomalie), jamais comme succès.

### F.4 `updated_at` — fait établi

`public.crm_emails.updated_at` existe (`timestamptz NOT NULL`) et est maintenu par le
trigger réel `update_crm_emails_updated_at BEFORE UPDATE ... EXECUTE FUNCTION update_updated_at_column()`.
Aucune migration, aucun trigger, aucune colonne à créer. `updated_at` est donc utilisable
tel quel comme jeton de version.

Réserve conçue : `updated_at` a la granularité de `now()` de la transaction ; deux écritures
dans la même transaction/même instant pourraient partager la valeur. `updated_at` est donc
retenu **en complément** et non comme garde unique.

### F.5 M-1 — ROUND-TRIP DE `updated_at` : PROBLÈME ET STRATÉGIE RETENUE

#### F.5.1 Énoncé du problème

La garde utilise `updated_at` comme jeton de version. Entre T0 (lecture) et T2 (UPDATE
gardé), la valeur transite par le client applicatif. Le risque n'est pas temporel mais
**représentationnel** : la valeur observée pourrait être transmise au prédicat sous une
forme différente de celle stockée, alors que l'instant désigné est le même. Sources de
divergence possibles :

| # | Source de divergence | Effet potentiel |
|---|---|---|
| 1 | **Précision temporelle** : PostgreSQL `timestamptz` stocke la microseconde (6 chiffres) ; `Date`/`toISOString()` en JavaScript ne conserve que la milliseconde (3 chiffres) | troncature → valeur transmise ≠ valeur stockée |
| 2 | **Représentation ISO** : `2026-08-27T07:56:00.123456+00:00` vs `2026-08-27 07:56:00.123456+00` (séparateur espace/`T`) | comparaison textuelle différente |
| 3 | **Suffixe de fuseau** : `Z` vs `+00:00` vs `+00` | comparaison textuelle différente |
| 4 | **Sérialisation PostgREST** : la représentation JSON retournée dépend du réglage `DateStyle` du serveur et n'est pas contractuelle | forme lue non garantie stable dans le temps |
| 5 | **Normalisation client** : tout passage par `new Date(...)`, `toISOString()`, un ORM, un formateur ou une comparaison de chaînes | perte d'information |

Conséquence redoutée : une **comparaison textuelle différente malgré une même valeur
temporelle** (faux conflit systématique), ou — pire — une comparaison qui « réussirait »
sur une valeur tronquée (faux succès).

#### F.5.2 Fait technique déterminant

Côté PostgREST, un filtre `updated_at=eq.<valeur>` produit une comparaison SQL
`updated_at = '<valeur>'::timestamptz`. La comparaison est donc **typée**, effectuée par
PostgreSQL après cast, et **non textuelle** : `...Z`, `...+00:00` et `...+00` désignant le
même instant sont égaux au sens SQL. Le seul vecteur réel de divergence est donc la
**perte de précision côté client** (ligne 1 du tableau) ou une valeur invalide (erreur de
cast → erreur BDD → refus).

#### F.5.3 Stratégie retenue (arbitrage)

**Règle R-UA-1 — transmission opaque.** La valeur d'`updated_at` lue à T0 est traitée
comme un **jeton opaque**. Elle est transportée telle quelle, caractère pour caractère,
de la lecture jusqu'au prédicat. Il est **interdit** de la parser, de la reformater, de la
convertir en `Date`, de la ré-émettre via `toISOString()`, de la tronquer ou de la
normaliser. Le type porté par `LigneEmailLot3.updated_at` est `string` et sa valeur est
exactement la chaîne renvoyée par la couche d'accès aux données.

**Règle R-UA-2 — échec sûr.** Si `updated_at` est absent, vide ou non exploitable à la
lecture, aucune écriture n'est tentée : refus `garde_optimiste`. Une valeur rejetée par le
cast SQL provoque une erreur BDD, donc un refus `erreur_base`. Dans les deux cas :
**refus, jamais écriture**.

**Règle R-UA-3 — garde combinée conservée.** `updated_at` reste un prédicat
**complémentaire** de la garde sur `ai_context` complet et sur les chemins JSON
sentinelles. Aucun de ces prédicats n'est relâché au prétexte du risque de
représentation. Le choix n'est **pas** fait au motif qu'il serait plus permissif : la
transmission opaque est la seule stratégie qui n'introduit **aucun** assouplissement.

Options écartées et motif :

| Option | Motif de rejet |
|---|---|
| Comparer `updated_at` avec un opérateur `gte`/`lte`/plage de tolérance | permissive : autoriserait une écriture malgré un état modifié → risque de faux succès et de perte de sentinelle |
| Normaliser la valeur côté client avant comparaison (`toISOString()`) | tronque les microsecondes → faux conflit systématique |
| Tronquer la colonne à la milliseconde (`date_trunc`) | modification BDD interdite, et perte de discrimination |
| Retirer `updated_at` de la garde | affaiblit la couverture, contraire à l'Option C retenue |
| Retry / second UPDATE en cas de conflit sur `updated_at` | interdit par I-9 et par K |

#### F.5.4 Garanties apportées

| Exigence | Garantie |
|---|---|
| 1. Absence de faux conflit systématique | la valeur transmise est bit-à-bit celle lue ; la comparaison est typée après cast, donc insensible à `Z` / `+00:00` / `+00` |
| 2. Absence de faux succès | tout écart réel d'instant ou toute valeur non castable donne 0 ligne ou une erreur → refus |
| 3. Absence de perte de sentinelle | la garde `ai_context` complet + chemins sentinelles reste active indépendamment d'`updated_at` |
| 4. Absence de retry | aucune reprise, aucun backoff (I-9, K) |
| 5. Absence de second UPDATE | une seule instruction de mutation par appel (I-1, K) |

#### F.5.5 Prérequis expérimental (non exécuté)

Avant branchement production, et **uniquement** si la DG l'autorise, une démonstration sur
**base jetable** doit établir :

- P-1 : la forme exacte de sérialisation d'un `timestamptz` renvoyé par la couche d'accès ;
- P-2 : qu'un filtre `eq` réalimenté avec cette forme exacte affecte bien 1 ligne ;
- P-3 : qu'une valeur équivalente mais différemment représentée (`Z` vs `+00:00`) affecte
  également 1 ligne (preuve du cast typé) ;
- P-4 : qu'une valeur tronquée à la milliseconde alors que la base porte des microsecondes
  affecte **0** ligne (preuve d'échec sûr) ;
- P-5 : que la même démonstration vaut pour le prédicat `ai_context` complet (réserve r-1,
  commune au Lot 4).

Ce prérequis est **documentaire à ce stade** : il n'est **pas** exécuté par la présente
révision, conformément aux interdictions de l'ACTION 20.

---

## G. PRÉSERVATION DES SENTINELLES (OPTION B)

Règle doctrinale : **« Le Lot 3 ne doit jamais effacer une sentinelle humaine déjà présente
dans l'état qu'il reçoit. »**

### G.1 Clés concernées (toutes déjà existantes dans le schéma 1.1.0)

| Clé | Règle |
|---|---|
| `analyse.validated_by` | si non nul en entrée → **recopié à l'identique** en sortie |
| `analyse.validated_at` | si non nul en entrée → **recopié à l'identique** en sortie |
| `analyse.provenance.source === "humain"` | la provenance humaine **prime** : elle n'est pas remplacée par `regle_deterministe` |
| `analyse.statut === "CONFIRMED"` | état terminal : aucune écriture Lot 3, refus en amont |
| `analyse.validation_humaine_requise` | ne peut pas être **remis à `true`** si une validation humaine est déjà enregistrée |
| `analyse.modifications_apportees` | jamais tronqué ; append déterministe uniquement |

### G.2 Priorité appliquée

1. Sentinelle humaine présente → **refus en amont** (`peutCroiserContexte`, comportement actuel
   déjà correct). C'est la voie normale et, dans le code Lot 3 réel, la **seule** voie :
   aucune écriture n'a lieu.
2. En l'absence totale de sentinelle en entrée, le comportement actuel est conservé
   (`validated_by: null`, `validated_at: null`, provenance déterministe).

### G.2bis M-2 — STATUT EXACT DE L'OPTION B ET DU PARAMÈTRE `force`

**Constat réel du code Lot 3 (à respecter, non modifié).** Dans
`peutCroiserContexte`, les sentinelles humaines sont contrôlées **avant** le test de
`options.force`. En conséquence, dans le flux réel actuel :

> `force` **ne peut jamais** permettre de franchir `validated_by != null`,
> `validated_at != null`, `provenance.source = "humain"`, ni le statut `CONFIRMED`.

Il n'existe donc **aucun chemin réel** par lequel une écriture atteindrait la couche de
composition avec une sentinelle humaine en entrée. Toute formulation de la V1.0 laissant
entendre le contraire (« par exemple via `force` ») est **retirée**.

**Qualification définitive de l'Option B : DÉFENSE EN PROFONDEUR.**
L'Option B — préservation des sentinelles dans le contexte composé, et prédicats
sentinelles dans la garde SQL — protège l'UPDATE **au cas où**, dans le futur, un appelant
nouveau ou une évolution du flux modifierait l'ordre des contrôles amont. Elle
**n'est pas** la description d'un chemin actuellement accessible, et ne doit pas être lue
comme tel.

Formulation normative à conserver telle quelle :

> « Le paramètre `force` ne constitue jamais une autorisation de franchissement d'une
> sentinelle humaine. La garde SQL constitue une seconde ligne de défense et doit rester
> restrictive même dans l'hypothèse d'un appelant futur incorrectement composé. »

Conséquence de test : la vérification associée porte sur la **fonction de composition de
la garde** (les prédicats produits à partir de l'état observé), et non sur un flux réel
`force` qui contournerait une sentinelle — un tel flux n'existe pas et ne doit pas être
simulé comme s'il existait (voir Q11-13 révisé).

### G.3 Aucun nouveau champ JSON

Toute la préservation s'exprime avec les clés existantes de `analyse` et `analyse.provenance`.
Aucun champ `version`, `lock`, `revision` ou équivalent n'est ajouté au JSON.
Le jeton de version est `crm_emails.updated_at`, colonne SQL déjà existante.

---

## H. COMPARAISON DES OPTIONS DE GARDE

| Option | Description | Force | Faiblesse | Verdict |
|---|---|---|---|---|
| **A** | garde sur `ai_context` complet | détecte tout *lost update*, y compris hors sentinelles ; identique au Lot 4 | dépend de la stabilité de sérialisation JSON côté PostgREST ; comparaison volumineuse | **retenue (socle)** |
| **B** | garde sur `updated_at` | légère, indépendante du contenu, colonne existante | granularité temporelle ; ne dit pas *ce qui* a changé | **retenue en complément** |
| **C** | garde combinée `ai_context` + `updated_at` + chemins JSON sentinelles + statut | couverture maximale ; échec sûr ; homogène avec le Lot 4 | requête plus verbeuse | **RETENUE** |
| **D** | garde ciblée sur les seules sentinelles | requête minimale, très lisible | laisse passer les autres modifications concurrentes du contexte (Lot 2 réanalyse, correction humaine partielle) → régression fonctionnelle | rejetée |

**Décision de conception : Option C**, c'est-à-dire A + B + prédicats ciblés sentinelles/statut,
transposition du patron Lot 4 augmentée de `updated_at`.

---

## I. INTERFACES IMPACTÉES (signatures cibles — non implémentées)

### I.1 `LigneEmailLot3`

Ajout d'un champ observé, sans changement de sémantique :

```text
interface LigneEmailLot3 {
  id: string
  ai_context: unknown
  client_id: string | null
  dossier_id: string | null
  contrat_id: string | null
  compagnie_id: string | null
  updated_at: string        // NOUVEAU : jeton de version observé
}
```

`lireEmail` sélectionne donc `id, ai_context, client_id, dossier_id, contrat_id, compagnie_id, updated_at`.

### I.2 `LecteurLot3.ecrireAiContext`

Signature actuelle :

```text
ecrireAiContext(emailId: string, contexte: EmailContext): Promise<string | null>
```

Signature cible (garde obligatoire, résultat discriminant) :

```text
ecrireAiContext(params: {
  emailId: string
  observe: LigneEmailLot3          // UNIQUE état observé, porteur de la garde
  contexte: EmailContext           // contexte à écrire
}): Promise<{ lignesAffectees: number; erreur: string | null }>
```

Justification : rendre la garde **non contournable** par construction. Il ne doit plus
exister de signature capable d'écrire `ai_context` sans état observé.

**m-1 — état observé unique (correction).** Il n'existe **qu'un seul** état observé
cohérent : `observe`, la ligne lue à T0. Le design **interdit** toute signature acceptant
deux états indépendants susceptibles d'être désynchronisés. En conséquence, le paramètre
`observeAiContext` de la V1.0 est **supprimé** de la signature cible. Si, pour des raisons
de typage, une valeur `observeAiContext` est néanmoins conservée dans une structure
interne, elle est définie exclusivement comme :

```text
observeAiContext = observe.ai_context   // après validation du contexte par le validateur Lot 1
```

c'est-à-dire une **dérivation** de `observe`, jamais une donnée fournie séparément par
l'appelant. La garde `ai_context` est composée à partir de `observe.ai_context` tel que lu,
non d'une revalidation ou d'une recomposition.

### I.3 Orchestrateur `croiserEtEnregistrerContexteEmail`

Séquence cible inchangée dans son ordre, enrichie de la garde ; voir J.

### I.4 `ResultatResolutionEmail`

`MotifNonTraitement` s'enrichit de deux motifs (aucune suppression) :

```text
| "garde_optimiste"   // 0 ligne affectée : état modifié entre lecture et écriture
| "erreur_base"       // échec BDD ; le message reste exposé via `detail`
```

et le résultat gagne un champ optionnel `detail?: string`. Aucun champ existant n'est
supprimé ni renommé → aucun appelant existant du Lot 3 n'est cassé.

### I.5 Doubles de test

Les doubles implémentant `LecteurLot3` doivent suivre la nouvelle signature
`ecrireAiContext` et pouvoir simuler `lignesAffectees = 0 | 1` et `erreur`.
Les doubles doivent aussi exposer `updated_at` sous forme de chaîne brute (R-UA-1).
Aucun double ne doit pouvoir « réussir » sans avoir reçu l'état observé, ni recevoir un
second état observé indépendant.

---

## J. SÉQUENCE D'EXÉCUTION CIBLE

```text
1. lireEmail(emailId)                     -> LigneEmailLot3 (dont updated_at)
   |- absent                              -> refus "email_introuvable"
2. peutCroiserContexte(ai_context)         (inchangé — sentinelles, CONFIRMED, provenance humaine)
   |- refus                               -> refus (motif existant)
3. lireContexteEmail(ai_context)           (validateur Lot 1, inchangé)
   |- invalide                            -> refus "contexte_non_conforme"
4. lireReferentiel(...)                    (SELECT seuls, inchangé)
   |- exception                           -> refus "referentiel_indisponible"
5. croiserContexteEmail(...)               (moteur pur N1..N9, inchangé)
6. PRÉSERVATION OPTION B (défense en profondeur) : recopie des sentinelles humaines
   éventuellement présentes dans l'état entrant — inatteignable dans le flux réel actuel,
   voir G.2bis
7. lireContexteEmail(sortie)               (revalidation Lot 1, inchangé)
   |- invalide                            -> refus "sortie_non_conforme"
8. ecrireAiContext({ observe, contexte })   <-- UPDATE gardé, unique (état observé = observe)
   |- erreur                              -> refus "erreur_base" (+ detail)
   |- lignesAffectees === 0               -> refus "garde_optimiste"   (aucun retry)
   |- lignesAffectees === 1               -> succès
```

L'étape 8 est le **seul** point de mutation du Lot 3, avant comme après correctif.

---

## K. GESTION DES CONFLITS

- Un conflit est un **résultat normal**, pas une erreur : il signifie que l'état appartient
  désormais à un autre acteur (humain ou Lot 2/Lot 4).
- **Interdiction de retry aveugle** : pas de boucle, pas de relecture-réécriture, pas de
  backoff. Le correctif ne doit contenir aucune structure de reprise.
- **Interdiction de second UPDATE** dans le même appel, quelle qu'en soit la raison.
- Journalisation : un `console.warn` factuel (id d'email, motif) est autorisé ; aucune donnée
  personnelle, aucun contenu d'email.
- Le caller (aujourd'hui : aucun appelant production — le Lot 3 n'est pas branché) reçoit
  `{ ecrit: false, motif: "garde_optimiste" }` et n'a aucune obligation d'action.

---

## L. IDEMPOTENCE

- Deuxième passage sur un état inchangé : la garde passe, l'`UPDATE` réécrit un contenu
  équivalent ; `modifications_apportees` reste géré par clé déterministe (aucun doublon).
  Le résultat métier est identique → idempotence préservée.
- Deuxième passage après validation humaine : refus dès l'étape 2 (sentinelle) — jamais
  d'écriture. La garde de l'étape 8 est la seconde barrière pour le cas concurrent.
- La garde n'introduit aucun effet de bord : en cas de refus, l'état en base est
  **strictement** celui d'avant l'appel.

---

## M. TESTS DE RECETTE À PRÉVOIR (conceptuels — non écrits)

| ID | Scénario | Attendu |
|---|---|---|
| Q11-01 | aucune concurrence | `ecrit: true`, 1 ligne affectée |
| Q11-02 | `validated_by` ajouté entre lecture et écriture | refus `garde_optimiste`, aucune écriture |
| Q11-03 | `validated_at` ajouté entre lecture et écriture | refus `garde_optimiste` |
| Q11-04 | `provenance.source` devient `"humain"` | refus `garde_optimiste` |
| Q11-05 | `analyse.statut` devient `CONFIRMED` | refus `garde_optimiste` |
| Q11-06 | `ai_context` modifié (hors sentinelles) | refus `garde_optimiste` |
| Q11-07 | `updated_at` modifié seul | refus `garde_optimiste`. **Rattaché à Q.4 (m-2)** : comportement vérifié par **double / instrumentation de l'abstraction d'accès aux données**, et non preuve du comportement PostgREST réel — cette preuve relève du prérequis expérimental F.5.5 |
| Q11-08 | double renvoyant `lignesAffectees = 0` | jamais `ecrit: true` |
| Q11-09 | double renvoyant `erreur` | refus `erreur_base`, jamais de succès |
| Q11-10 | après conflit, aucun second appel d'écriture | le double compte exactement 1 appel d'écriture |
| Q11-11 | sentinelle humaine déjà présente à T0 | refus en amont (`validation_humaine_existante` / `contexte_saisi_par_humain` / `statut_non_eligible`) |
| Q11-12 | second passage identique | idempotence, aucun doublon de trace |
| Q11-13 | **fonction de composition de la garde** appelée avec un état observé portant une sentinelle humaine, `force` activé | les prédicats produits incluent les chemins sentinelles à l'identique et la composition reste restrictive (défense en profondeur, G.2bis). Le test porte sur la composition, **pas** sur un flux réel `force` franchissant une sentinelle — ce flux n'existe pas |
| Q11-14 | Lot 2 | comportement et sorties `DETECTED` inchangés |
| Q11-15 | Lot 4 | fichiers et tests Lot 4 inchangés, 39 tests toujours verts |
| **Q11-16** | `force` ne franchit jamais une sentinelle humaine | refus |
| **Q11-17** | étanchéité statique du module corrigé | aucun `insert/upsert/delete/rpc`, aucune FK écrite, aucun Gemini/Gmail |
| **Q11-18** | aucune signature d'écriture sans état observé | vérification statique de l'API `ecrireAiContext` |
| **Q11-19** | refus ⇒ état en base inchangé | double vérifiant l'absence totale de mutation |
| **Q11-20** | suite complète | 89 tests existants + nouveaux, tous verts ; `tsgo --noEmit` vert |
| **Q11-21** | **round-trip `updated_at` (M-1)** — valeur observée `2026-08-27T07:56:00.123456+00:00` transmise **telle quelle** au prédicat, état inchangé | valeur transmise identique caractère pour caractère à la valeur observée ; 1 ligne affectée ; `ecrit: true` |
| **Q11-21a** | représentation équivalente : la couche renvoie `...123456Z` là où la base porte `...123456+00:00` | comparaison typée après cast → **même instant** → 1 ligne affectée, aucun faux conflit (vérifié par double ; preuve en base réelle = F.5.5 P-3) |
| **Q11-21b** | valeur réellement différente : `updated_at` modifié en base entre T0 et T2 | 0 ligne affectée → refus `garde_optimiste`, aucune écriture, aucun retry, aucun second UPDATE |
| **Q11-21c** | valeur normalisée/tronquée à la milliseconde par le client (violation de R-UA-1) | 0 ligne affectée → refus (échec sûr) ; contrôle statique complémentaire : aucun `new Date`, `toISOString`, `parse` ou reformatage appliqué à `updated_at` dans le chemin d'écriture |
| **Q11-22** | `updated_at` absent, vide ou non exploitable à la lecture | aucune écriture tentée → refus `garde_optimiste` (R-UA-2) |

---

## N. NON-RÉGRESSION

| Élément | Impact |
|---|---|
| `schema_version` `"1.1.0"` | inchangé |
| JSON Schema `email-context-v1.2.json` | inchangé |
| Nouveaux champs JSON | aucun |
| Doctrine N1–N9 | inchangée |
| Scoring / `preuves[].poids` | inchangés (ni lus ni écrits) |
| Promotion `CONFIRMED` | toujours interdite au Lot 3 |
| Lot 1 (validateur, types) | inchangé |
| Lot 2 (extraction Gemini) | inchangé |
| Lot 4 (moteur FK) | inchangé — il possède déjà sa propre garde |
| FK / colonnes / triggers / RLS | aucun changement BDD |
| Motifs de refus existants | conservés ; ajout additif uniquement |

---

## O. ÉTANCHÉITÉ

Le correctif ne doit permettre :
- **aucune écriture de FK** (`client_id`, `dossier_id`, `contrat_id`, `compagnie_id`) ;
- **aucun** `insert`, `upsert`, `delete`, ni RPC mutante ;
- **aucune** création de client, prospect, dossier, contrat, produit, document ou tâche ;
- **aucun** appel Gemini, **aucun** appel Gmail ;
- **aucun** branchement production (le Lot 3 reste sans appelant) ;
- **aucune** modification de `triage_ia` / `triage_le`.

Surface de mutation autorisée après correctif : exactement une instruction,
`UPDATE public.crm_emails SET ai_context = ... WHERE id = ... AND <garde>`.

---

## P. GO / NO-GO

Verdict de conception : **🟢 GO DE CONCEPTION** — le correctif est réalisable sans
migration, sans modification du schéma JSON, sans toucher aux Lots 1, 2 et 4, en
transposant un patron déjà audité et validé (Lot 4).

Risques résiduels identifiés :
- **r-1 (majeur, commun au Lot 4)** : la garde par `ai_context` complet repose sur l'égalité
  de sérialisation JSON côté PostgREST. Elle ne peut être démontrée sans base réelle.
  L'ajout d'`updated_at` réduit ce risque : si l'égalité JSON échouait à tort, l'écriture
  serait refusée (échec sûr), jamais autorisée à tort.
- **r-2 (mineur)** : granularité de `updated_at` — mitigé par la garde combinée.
- **r-4 (mineur, traité en F.5)** : représentation/round-trip d'`updated_at` — traité par la
  règle de transmission opaque R-UA-1, l'échec sûr R-UA-2 et le prérequis expérimental F.5.5.
- **r-3 (mineur)** : la nouvelle signature `ecrireAiContext` impose la mise à jour des
  doubles de test du Lot 3 (rupture volontaire et souhaitable).

---

## Q. CONDITIONS AVANT DÉVELOPPEMENT

Q.1 Décision DG explicite d'autoriser le développement du correctif Lot 3 sur la base
de ce design (Option C = A + B + prédicats sentinelles, plus doctrine Option B).

Q.2 Confirmation que la rupture de signature de `ecrireAiContext` est acceptée
(garde non contournable par construction).

Q.3 **Fermé au niveau documentaire** (voir F.1) : les 4 FK n'entrent **pas** dans la garde
du Lot 3 ; lorsqu'une FK figure dans une garde, elle vaut uniquement comme « état observé
de la ligne source servant à détecter une modification concurrente », jamais comme
autorisation d'écriture. **Q.11 ne modifie aucune FK.** Reste à entériner formellement
par la DG.

Q.4 Arbitrage DG sur r-1 et r-4 : accepter la réserve documentaire commune Lot 3 / Lot 4
(les scénarios Q11-07 et Q11-21a sont alors des vérifications par double / instrumentation
de l'abstraction, sans preuve du comportement PostgREST réel), ou autoriser un
environnement de test jetable pour exécuter le prérequis expérimental F.5.5 (P-1 à P-5).

Q.5 Confirmation du maintien du **gel du branchement Lot 3 → Lot 4** jusqu'à la clôture
de Q.11 (audit du correctif développé inclus).

Q.6 Confirmation qu'aucun Lot 5 n'est ouvert.

---

🟡 **DESIGN Q.11 V1.1 — PRÊT POUR AUDIT DG**
