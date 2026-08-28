# CD-SI-001-B — LOT IHM QUALIFICATION / VALIDATION HUMAINE DU CONTEXTE EMAIL
## DESIGN V1.1

Statut : document de CONCEPTION uniquement. Aucun code, aucune migration, aucune
modification de base, aucun branchement n'est produit par ce document.

Référentiels croisés :
- `docs/CD-SI-001-B-LOT3-DESIGN-V1.2.md`
- `docs/CD-SI-001-B-LOT3-Q11-DESIGN-V1.1.md`
- `docs/CD-SI-001-B-LOT3-Q11-DESIGN-V1.2.md`
- `docs/CD-SI-001-B-LOT4-DESIGN-V1.2.md`
- `src/lib/email-context-types.ts`, `src/lib/email-context-schema.ts`,
  `src/lib/schemas/email-context-v1.2.json` (`schema_version` = `1.1.0`)
- `src/lib/email-context-resolver.server.ts` (garde Q.11 : `composerGardeQ11`,
  `sentinellesHumaines`, `updatedAtExploitable`, `preserverSentinellesHumaines`)
- `src/lib/email-fk-authorization.ts` / `.server.ts` (Lot 4, gelé)
- `src/components/emails-lies-panel.tsx`,
  `src/routes/_authenticated/espace.relation-client.tsx`
- schéma PostgreSQL réel de `public.crm_emails` et trigger
  `update_crm_emails_updated_at`

---

## 1. Objet et justification

Le Lot 3 produit dans `public.crm_emails.ai_context` un contexte relationnel dont
tous les éléments sont des **propositions** (`DETECTED`, `PROPOSED`, `AMBIGUOUS`,
`A_QUALIFIER`). Le correctif Q.11 protège désormais quatre **sentinelles
humaines** (`analyse.validated_by`, `analyse.validated_at`,
`analyse.provenance.source = "humain"`, `analyse.statut = "CONFIRMED"`).

Aucun acteur du système ne peut aujourd'hui poser ces sentinelles : la protection
Q.11 est théorique. Le présent lot conçoit l'IHM humaine qui les pose, et
uniquement cela. Elle constitue le **seul producteur légitime** de l'état humain
validé.

---

## 2. Périmètre

### 2.1 Autorisé

1. Lecture de `public.crm_emails` : `id`, `ai_context`, `updated_at`,
   `triage_ia`, `gmail_message_id`, `direction`, `recu_le`, et les quatre FK
   **en lecture d'affichage seulement**.
2. Lecture seule des référentiels déjà lus par le Lot 3 (`clients`, `dossiers`,
   `contrats`, `compagnies`, `produits`, `documents`) à des fins d'affichage de
   libellés lisibles, avec plafonds bornés.
3. **Unique mutation** :
   `UPDATE public.crm_emails SET ai_context = ...` sous garde optimiste Q.11
   strictement identique à celle du Lot 3.
4. Statuts posables par l'humain sur les éléments du contexte : `CONFIRMED`,
   `AMBIGUOUS`, `A_QUALIFIER`.
5. Correction des seuls champs de proposition déjà prévus par le schéma 1.1.0 :
   `correspondant.client_id`, `correspondant.compagnie_id`,
   `correspondant.role_suppose`, `personnes_detectees[].client_id_propose`,
   `personnes_detectees[].role`, `dossiers_detectes[].dossier_id_propose`,
   `contrats_detectes[].contrat_id_propose`,
   `produits_cites[].produit_id_propose`,
   `documents_associes[].document_id_propose`, et le `statut` de chacun de ces
   objets.
6. Traçabilité humaine : `analyse.modifications_apportees[]`,
   `provenance.source = "humain"`, `ambiguities[]` pour un motif de refus.

### 2.2 Hors périmètre — interdictions strictes

- Aucune écriture des FK `client_id`, `dossier_id`, `contrat_id`,
  `compagnie_id` de `crm_emails` (périmètre Lot 4, gelé).
- Aucun branchement Lot 3 → Lot 4 ; aucun appel de `evaluerAutorisationFk` ni de
  `autoriserEtEcrireFkEmail` depuis l'IHM.
- Aucune création de client, prospect, contact, dossier, contrat, document,
  tâche, activité ou entité quelconque.
- Aucun `INSERT`, `UPSERT`, `DELETE`, `RPC`, migration, modification de schéma
  ou de `schema_version` (reste `"1.1.0"`), aucun nouveau champ JSON.
- Aucun appel Gemini, aucune action Gmail (label, envoi, archivage, lecture
  mutante).
- Aucun scoring, aucune re-résolution Lot 3 déclenchée par l'IHM.
- Lot 5 gelé.

---

## 3. Flux fonctionnel

```text
ai_context (DETECTED / PROPOSED / AMBIGUOUS / A_QUALIFIER)
        |  lecture seule
        v
File d'attente « Contexte email a qualifier »
        |  ouverture d'un email
        v
Ecran de qualification : correspondant, personnes, dossiers,
contrats, produits, documents, preuves, ambiguites
        |
   +----+-----------------------------+---------------------------+
   v                                  v                           v
VALIDER                    CORRIGER puis VALIDER          REFUSER / QUALIFIER
statut = CONFIRMED         memes sentinelles +            statut = A_QUALIFIER
validated_by / _at         modifications_apportees[]      ambiguities[] + motif
provenance.source=humain                                  (aucune sentinelle)
        |
        v
UPDATE crm_emails SET ai_context = ...  (garde Q.11 complete)
   0 ligne -> verifier habilitation :
     email non visible -> email_introuvable ou refus habilitation
     email visible mais garde non satisfaite -> conflit_concurrent :
       rechargement, aucune retentative
```

### 3.1 Règle de non-dégradation

Un email dont l'état observé porte **déjà** une sentinelle est présenté en
**lecture seule**. Aucune action de l'IHM ne peut :

- ramener `analyse.statut` de `CONFIRMED` vers `DETECTED`, `PROPOSED`,
  `AMBIGUOUS` ou `A_QUALIFIER` ;
- effacer ou remplacer `validated_by` / `validated_at` ;
- retirer `provenance.source = "humain"`.

Une nouvelle soumission de la même intention est un **NO-OP explicite** :
aucune écriture BDD n'est exécutée et `updated_at` n'est pas renouvelé. Si
l'intention diffère d'une sentinelle existante, le refus `deja_valide` ou
`degradation_interdite` s'applique.

---

## 4. Architecture et périmètre de fichiers (implémentation ultérieure)

### 4.1 Fichiers créés

| Fichier | Rôle |
|---|---|---|
| `src/lib/email-context-validation.ts` | Moteur **pur**, sans I/O : application d'une intention humaine, contrôles de non-dégradation, idempotence, clé de corrélation |
| `src/lib/email-context-validation.server.ts` | Orchestration serveur : lecture T0, appel du moteur pur, **unique** `UPDATE` gardé, réutilisation stricte des primitives Q.11 du Lot 3 |
| `src/lib/email-context-validation.functions.ts` | Server functions `createServerFn` + `requireSupabaseAuth` |
| `src/components/email-context-qualification-panel.tsx` | IHM de consultation / correction / validation |
| `src/lib/email-context-validation.test.ts` | Tests moteur pur + orchestration (doubles en mémoire) |

### 4.2 Fichiers modifiés

| Fichier | Modification |
|---|---|---|
| `src/routes/_authenticated/espace.relation-client.tsx` | Ajout d'une entrée `contexte` dans la `SectionNav` existante, montant le panneau. Aucune autre modification. |
| `src/components/emails-lies-panel.tsx` | Facultatif, purement présentationnel : badge « contexte validé le … par … » lu depuis `ai_context`, sans action. |

### 4.3 Fichiers explicitement non modifiés

`email-context-resolver.server.ts`, `email-context-resolution.ts`,
`email-context-types.ts`, `email-context-schema.ts`,
`src/lib/schemas/email-context-v1.2.json`, `email-context-analyzer.server.ts`,
`email-fk-authorization.ts`, `email-fk-authorization.server.ts`, l'ensemble du
Lot 2 (CD-SI-002), `src/integrations/supabase/*`, `supabase/config.toml`.

Aucune duplication de la garde Q.11 : `composerGardeQ11`,
`sentinellesHumaines`, `updatedAtExploitable`, `preserverSentinellesHumaines`,
`LigneEmailLot3`, `ParamsEcritureAiContext` et `ResultatEcritureAiContext` sont
**importés** du Lot 3, jamais réécrits.

---

## 5. Contrats de fonctions

### 5.1 Moteur pur — `src/lib/email-context-validation.ts`

```ts
export type CibleCorrection =
  | { objet: "correspondant" }
  | { objet: "personne"; index: number }
  | { objet: "dossier"; index: number }
  | { objet: "contrat"; index: number }
  | { objet: "produit"; index: number }
  | { objet: "document"; index: number };

/** Union FERMEE : aucun chemin JSON libre, aucun champ hors schema 1.1.0. */
export type CorrectionContexte =
  | { cible: CibleCorrection; champ: "statut"; valeur: EmailContextStatus }
  | { cible: { objet: "correspondant" }; champ: "client_id" | "compagnie_id"; valeur: string | null }
  | { cible: { objet: "correspondant" }; champ: "role_suppose"; valeur: CorrespondantRole | null }
  | { cible: { objet: "personne"; index: number }; champ: "client_id_propose"; valeur: string | null }
  | { cible: { objet: "personne"; index: number }; champ: "role"; valeur: PersonRole | null }
  | { cible: { objet: "dossier"; index: number }; champ: "dossier_id_propose"; valeur: string | null }
  | { cible: { objet: "contrat"; index: number }; champ: "contrat_id_propose"; valeur: string | null }
  | { cible: { objet: "produit"; index: number }; champ: "produit_id_propose"; valeur: string | null }
  | { cible: { objet: "document"; index: number }; champ: "document_id_propose"; valeur: string | null };

export type IntentionHumaine =
  | { type: "valider" }
  | { type: "corriger_et_valider"; corrections: CorrectionContexte[] }
  | { type: "renvoyer_qualification"; motif: string };

export type MotifRefusValidation =
  | "email_introuvable"
  | "contexte_invalide"
  | "deja_valide"
  | "degradation_interdite"
  | "correction_hors_perimetre"
  | "updated_at_inexploitable"
  | "conflit_concurrent"
  | "erreur_base";

export function appliquerIntentionHumaine(input: {
  observe: EmailContext;
  intention: IntentionHumaine;
  operateurId: string;   // provient du serveur (auth.uid()), jamais du client
  valideLe: string;      // horodatage serveur, format ISO produit cote serveur
}):
  | { autorise: true; contexte: EmailContext; cle: string }
  | { autorise: false; motif: MotifRefusValidation };

/** Cle de correlation / tracabilite de l'operation. Non deterministe car
 *  `validated_at` est genere cote serveur ; l'idempotence fonctionnelle repose
 *  sur l'etat deja valide (`deja_valide`), pas sur l'egalite de cette cle. */
export function cleValidation(input: {
  emailId: string;
  statutCible: EmailContextStatus;
  validatedBy: string | null;
  validatedAt: string | null;
  corrections: readonly CorrectionContexte[];
}): string;
```

Règles internes du moteur :

- validation d'entrée par `emailContextSchema` (Lot 1) : échec → `contexte_invalide` ;
- `sentinellesHumaines(observe).presente` et intention strictement identique
  → **NO-OP** : aucune écriture BDD, `updated_at` inchangé ;
- `sentinellesHumaines(observe).presente` et intention différente non dégradante
  → `deja_valide` (aucune écriture) ;
- intention dégradante d'une sentinelle existante → `degradation_interdite` ;
- correction visant un index inexistant ou un champ hors union → `correction_hors_perimetre` ;
- `valider` / `corriger_et_valider` posent `analyse.statut = "CONFIRMED"`,
  `analyse.validated_by = operateurId`, `analyse.validated_at = valideLe`,
  `analyse.validation_humaine_requise = false`,
  `analyse.provenance = { ...provenance, source: "humain" }` ;
- `corriger_et_valider` ajoute pour chaque correction une entrée lisible dans
  `analyse.modifications_apportees[]` et positionne
  `provenance.source = "humain"` sur l'objet corrigé ;
- `renvoyer_qualification` pose `analyse.statut = "A_QUALIFIER"`,
  `analyse.validation_humaine_requise = true`, ajoute une entrée
  `ambiguities[]` de type `autre` portant le motif, et **ne pose aucune
  sentinelle** ;
- sortie repassée par `emailContextSchema` : toute sortie non conforme →
  `contexte_invalide`, aucune écriture ;
- `schema_version` recopié à l'identique (`"1.1.0"`).

### 5.2 Orchestration — `src/lib/email-context-validation.server.ts`

```ts
export interface LecteurValidation {
  lireEmail(emailId: string): Promise<LigneEmailLot3 | null>;
  ecrireAiContext(params: ParamsEcritureAiContext): Promise<ResultatEcritureAiContext>;
}

export interface ResultatValidationEmail {
  ecrit: boolean;
  motif: MotifRefusValidation | null;
  cle: string | null;
}

export async function validerContexteEmail(params: {
  emailId: string;
  intention: IntentionHumaine;
  operateurId: string;
  valideLe?: string;          // defaut : horodatage serveur
  db?: LecteurValidation;     // injectable pour les tests
}): Promise<ResultatValidationEmail>;
```

Séquence :

1. `lireEmail` → état observé unique (`ai_context`, `updated_at` opaque).
   Absent → `email_introuvable`.
2. `updatedAtExploitable(observe.updated_at)` faux → `updated_at_inexploitable`,
   aucune écriture tentée.
3. `appliquerIntentionHumaine` → refus propagé tel quel, ou contexte cible.
4. `preserverSentinellesHumaines(observe, cible)` en défense en profondeur.
5. **Unique** `ecrireAiContext({ emailId, observe, contexte })` — la garde
   Q.11 est composée par le Lot 3 (`composerGardeQ11`) sur le même `UPDATE`.
6. Si `lignesAffectees === 0` :
   - si l'email n'était pas lisible par l'utilisateur (RLS) ou n'existe pas
     visiblement pour lui → `email_introuvable` ou refus d'habilitation approprié ;
   - si l'email était lisible mais la garde optimiste n'est pas satisfaite
     → `conflit_concurrent`.
   `erreur` non nulle → `erreur_base`. Dans les deux cas : aucun retry,
   aucun second `UPDATE`.

### 5.3 Server functions — `src/lib/email-context-validation.functions.ts`

| Fonction | Méthode | Rôle |
|---|---|---|
| `fileContexteAQualifier` | POST | Liste bornée et paginée des emails dont `analyse.statut` n'est pas `CONFIRMED`, avec compteur d'ambiguïtés |
| `detailContexteEmail` | POST | `ai_context` complet + libellés lisibles des référentiels + `updated_at` opaque + drapeau `lectureSeule` |
| `appliquerValidationContexte` | POST | Applique une `IntentionHumaine` via `validerContexteEmail` |

Toutes sous `.middleware([requireSupabaseAuth])`. `operateurId` provient
exclusivement de `context.userId` ; un `operateurId` présent dans le payload est
ignoré. `supabaseAdmin` n'est pas requis : la lecture et l'unique `UPDATE`
s'effectuent avec le client authentifié sous RLS.

---

## 6. Comportement transactionnel

- Un seul aller-retour mutant par décision humaine.
- Garde portée par le même `UPDATE`, six prédicats : `ai_context` complet,
  `ai_context->analyse->>statut` **NULL-SAFE** (`eq.<valeur>` si présent,
  `is.null` si absent — jamais `eq.""`), `validated_by`, `validated_at`,
  `provenance->>source`, `updated_at` transmis de manière opaque (R-UA-1).
- `0 ligne` : distinguer habilitation/conflit. Email inaccessible/non visible
  pour l'utilisateur → refus d'habilitation / `email_introuvable`. Email visible
  mais garde optimiste non satisfaite → `conflit_concurrent` : l'IHM recharge
  l'état et exige une nouvelle décision explicite. Aucune retentative
  automatique, aucune boucle de rechargement proposée sur un refus
  d'habilitation.
- Erreur BDD → `erreur_base`, aucun retry.
- Aucun paramètre `force` n'existe dans ce lot : rien ne permet de franchir une
  sentinelle.
- Idempotence : intention déjà validée strictement identique → NO-OP explicite
  (aucune écriture BDD, `updated_at` inchangé). Intention différente sur
  sentinelle existante → `deja_valide` ou `degradation_interdite`. La
  `cleValidation` est une clé de corrélation / traçabilité de l'opération, pas
  une clé d'idempotence déterministe car `validated_at` est généré côté serveur.

---

## 7. Invariants

1. `schema_version` reste `"1.1.0"` ; aucun champ JSON nouveau.
2. Aucune FK écrite ; le moteur Lot 4 n'est jamais appelé.
3. Une sentinelle posée n'est jamais retirée ni dégradée.
4. `provenance.source = "humain"` uniquement sur action d'un opérateur
   authentifié.
5. `validated_by` = UUID serveur de l'opérateur ; `validated_at` = horodatage
   serveur.
6. Un refus (`A_QUALIFIER`) ne pose aucune sentinelle et reste réversible.
7. Une seule mutation BDD dans tout le lot.
8. Zéro `any`, zéro `as unknown as`.
9. Aucune action Gmail / Gemini / tâche / entité / migration.
10. NO-OP explicite : sentinelle existante + intention strictement identique →
    aucune écriture, `updated_at` inchangé.
11. Distinction habilitation/conflit : un problème RLS n'est jamais présenté
    comme un conflit concurrent imposant un rechargement.

---

## 8. Tests obligatoires

Doubles en mémoire, aucune écriture réelle.

| Réf | Scénario | Attendu |
|---|---|---|
| IHM-01 | Validation simple | `CONFIRMED` + 3 sentinelles + `validation_humaine_requise = false` |
| IHM-02 | Correction puis validation | `modifications_apportees[]` renseigné, statut cible appliqué |
| IHM-03 | Renvoi en qualification | `A_QUALIFIER` + `ambiguities[]`, aucune sentinelle |
| IHM-04 | Email déjà validé | `deja_valide`, aucune écriture |
| IHM-05 | Dégradation `CONFIRMED` → `DETECTED` | `degradation_interdite` |
| IHM-06 | Effacement `validated_by` / `validated_at` | refus |
| IHM-07 | Retrait de `provenance.source = "humain"` | refus |
| IHM-08 | Conflit concurrent (0 ligne) | `conflit_concurrent`, aucun retry, aucun second `UPDATE` |
| IHM-09 | Erreur BDD | `erreur_base`, aucun retry |
| IHM-10 | `updated_at` absent / vide | refus sûr, aucune écriture tentée |
| IHM-11 | Garde composée | 6 prédicats Q.11 exacts, `is.null` si statut absent |
| IHM-12 | Payload d'`UPDATE` | aucune des 4 FK présente |
| IHM-13 | Correction hors union / index invalide | `correction_hors_perimetre` |
| IHM-14 | Contexte entrant ou sortant non conforme | `contexte_invalide` |
| IHM-15 | Double soumission identique | une seule écriture ; seconde = NO-OP explicite |
| IHM-16 | Contrôles statiques d'étanchéité | aucun `insert` / `upsert` / `delete` / `rpc`, aucun Gemini / Gmail, aucun `eq.""`, aucun `any` |

Vérifications finales : `bunx vitest run` (suite complète Lots 1 / 2 / 3 / Q.11 /
Lot 4 + nouveaux tests) et `bunx tsgo --noEmit`, tous verts, sans suppression de
test existant.

---

## 9. Risques

- Garde sur `ai_context` complet : une réécriture identique par un tiers
  provoque un conflit → rechargement demandé. Comportement voulu ; aucune perte
  de données possible.
- Si le Lot 3 est un jour branché en production, il générera des conflits sur
  les emails validés : refus sûr par construction, aucune dégradation.
- Volume de la file d'attente : pagination bornée, aucune lecture exhaustive non
  plafonnée.
- Trigger `update_crm_emails_updated_at` : chaque écriture fait tourner le jeton
  de version, ce qui invalide légitimement toute décision fondée sur un état
  antérieur.

---

## 10. Statut

Conception compatible avec les gels en vigueur : gel Lot 3 → Lot 4 maintenu, gel
Lot 5 maintenu, correctif Q.11 intégralement préservé et réutilisé sans
duplication.

Aucune implémentation n'est autorisée par ce document. L'implémentation requiert
un GO FERME DG explicite sur le présent DESIGN V1.1.
