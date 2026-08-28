# ACTION 29 — DESIGN IHM Qualification / Validation humaine du contexte email (proposition, non rédigée en repo)

Aucun fichier de code, document `docs/`, migration, BDD ou branchement n'a été modifié. Ce plan est la proposition de DESIGN soumise à validation avant rédaction du document définitif.

## 1. Objet

Doter le CRM d'un écran humain permettant de **consulter, corriger et valider** `crm_emails.ai_context` produit par les Lots 2 et 3, et de poser explicitement l'état humain : `analyse.statut = "CONFIRMED"`, `validated_by`, `validated_at`, `provenance.source = "humain"`, `validation_humaine_requise = false`.

L'IHM est le **seul producteur légitime** des sentinelles que Q.11 protège. Aujourd'hui aucune sentinelle ne peut être posée : la protection Q.11 est théorique. Ce chantier la rend effective.

## 2. Périmètre autorisé

Autorisé :
- lecture de `crm_emails` (dont `ai_context`, `updated_at`, `triage_ia`, FK déjà présentes) et lecture seule des référentiels déjà lus par le Lot 3 (`clients`, `dossiers`, `contrats`, `compagnies`, `produits`, `documents`) pour afficher des libellés lisibles ;
- **unique mutation** : `UPDATE public.crm_emails SET ai_context = ...` sous garde optimiste Q.11 identique à celle du Lot 3 ;
- statuts posables par l'humain sur les éléments détectés : `CONFIRMED`, `AMBIGUOUS`, `A_QUALIFIER` ;
- correction des champs de proposition déjà prévus par le schéma 1.1.0 (`client_id_propose`, `dossier_id_propose`, `contrat_id_propose`, `produit_id_propose`, `document_id_propose`, `correspondant.client_id`/`compagnie_id`, `role_suppose`, `role`, libellés cités), avec `provenance.source = "humain"` et `analyse.modifications_apportees[]` ;
- refus / renvoi en qualification (`A_QUALIFIER`) avec motif porté par `ambiguities[]`.

Hors périmètre (interdictions strictes) :
- aucune écriture des 4 FK `client_id`, `dossier_id`, `contrat_id`, `compagnie_id` (reste Lot 4, gelé) ;
- aucun branchement Lot 3 → Lot 4, aucun appel du moteur Lot 4 depuis l'IHM ;
- aucune création de client, prospect, contact, dossier, contrat, document, tâche, activité, entité quelconque ;
- aucun INSERT / UPSERT / DELETE / RPC / migration / modification de schéma ou de `schema_version` (reste `1.1.0`), aucun champ JSON nouveau ;
- aucun appel Gemini, aucune action Gmail (pas de label, pas d'envoi, pas d'archivage) ;
- aucun scoring, aucune re-résolution automatique déclenchée par l'IHM ;
- Lot 5 gelé.

## 3. Flux fonctionnel

```text
ai_context (DETECTED / PROPOSED / AMBIGUOUS / A_QUALIFIER)
        │  lecture (aucune mutation)
        ▼
File d'attente « Contexte email à qualifier »
        │  ouverture d'un email
        ▼
Écran de qualification : correspondant, personnes, dossiers,
contrats, produits, documents, preuves, ambiguïtés
        │
   ┌────┴─────────────────────────┬───────────────────────────┐
   ▼                              ▼                           ▼
VALIDER                      CORRIGER puis VALIDER        REFUSER / QUALIFIER
statut=CONFIRMED             mêmes sentinelles +          statut=A_QUALIFIER
validated_by/at              modifications_apportees[]    ambiguities[] + motif
provenance.source=humain                                  (aucune sentinelle posée)
        │
        ▼
UPDATE crm_emails SET ai_context = ... (garde Q.11 complète)
   0 ligne → conflit_concurrent : rechargement, aucune retentative
```

Règle de non-dégradation : un email dont l'état observé porte **déjà** une sentinelle (`validated_by`, `validated_at`, `provenance.source = "humain"`, ou `analyse.statut = "CONFIRMED"`) est présenté en **lecture seule**. Aucune action de l'IHM ne peut le ramener à `DETECTED`, `PROPOSED`, `AMBIGUOUS` ou `A_QUALIFIER`, ni effacer `validated_by`/`validated_at`. Une re-validation par un autre opérateur est un no-op idempotent (mêmes valeurs, message « déjà validé »), jamais un écrasement.

## 4. Architecture et fichiers

Fichiers créés (implémentation ultérieure) :
- `docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.0.md` — le document de conception issu de ce plan.
- `src/lib/email-context-validation.ts` — moteur **pur**, sans I/O : application d'une intention humaine sur un `EmailContext`, contrôles de non-dégradation, idempotence, clé déterministe.
- `src/lib/email-context-validation.server.ts` — orchestration serveur : lecture de l'email, appel du moteur pur, **unique** `UPDATE` gardé, réutilisation stricte de `composerGardeQ11`, `sentinellesHumaines`, `updatedAtExploitable`, `preserverSentinellesHumaines` du Lot 3 (aucune duplication de la garde).
- `src/lib/email-context-validation.functions.ts` — server functions `createServerFn` + `requireSupabaseAuth` (lecture file d'attente, lecture détail, application d'une intention).
- `src/components/email-context-qualification-panel.tsx` — IHM.
- `src/lib/email-context-validation.test.ts` — tests du moteur pur et de l'orchestration (doubles en mémoire).

Fichiers modifiés :
- `src/routes/_authenticated/espace.relation-client.tsx` — ajout d'une section `contexte` dans la `SectionNav` existante, montant le panneau. Aucun autre changement.
- `src/components/emails-lies-panel.tsx` — **facultatif et purement présentationnel** : badge « contexte validé le … par … » lu depuis `ai_context`, sans action.

Fichiers **non** modifiés : `email-context-resolver.server.ts`, `email-context-resolution.ts`, `email-context-types.ts`, `email-context-schema.ts`, `src/lib/schemas/email-context-v1.2.json`, `email-fk-authorization*.ts`, tout le Lot 2, `src/integrations/supabase/*`.

## 5. Contrats de fonctions

Moteur pur (`email-context-validation.ts`) :

```ts
export type IntentionHumaine =
  | { type: "valider" }
  | { type: "corriger_et_valider"; corrections: CorrectionContexte[] }
  | { type: "renvoyer_qualification"; motif: string };

export type MotifRefusValidation =
  | "email_introuvable"
  | "contexte_invalide"
  | "deja_valide"          // idempotent, aucune écriture
  | "degradation_interdite"
  | "correction_hors_perimetre"
  | "updated_at_inexploitable"
  | "conflit_concurrent"
  | "erreur_base";

export function appliquerIntentionHumaine(input: {
  observe: EmailContext;
  intention: IntentionHumaine;
  operateurId: string;   // auth.uid() côté serveur, jamais fourni par le client
  valideLe: string;      // horodatage serveur
}): { autorise: true; contexte: EmailContext; cle: string }
 | { autorise: false; motif: MotifRefusValidation };
```

`CorrectionContexte` est une union fermée limitée aux chemins autorisés du schéma 1.1.0 (aucun chemin libre, aucun `any`, aucun `as unknown as`).

Serveur (`email-context-validation.server.ts`) :

```ts
export async function validerContexteEmail(params: {
  emailId: string;
  intention: IntentionHumaine;
  operateurId: string;
  db?: LecteurValidation;   // injectable pour les tests
}): Promise<{ ecrit: boolean; motif: MotifRefusValidation | null; cle: string | null }>;
```

`LecteurValidation` expose exactement `lireEmail(emailId): Promise<LigneEmailLot3 | null>` et `ecrireAiContext(params: ParamsEcritureAiContext)` — types réutilisés du Lot 3, aucune nouvelle abstraction d'écriture.

Server functions : `fileContexteAQualifier` (GET-like, lecture), `detailContexteEmail`, `appliquerValidationContexte` (POST). Toutes sous `requireSupabaseAuth` ; `operateurId` vient de `context.userId`, jamais du payload.

## 6. Comportement transactionnel

- Un seul aller-retour mutant : lecture T0 (état observé complet, `updated_at` opaque) → calcul pur → un unique `UPDATE ... SET ai_context` portant les 6 prédicats Q.11 (`ai_context` complet, `analyse.statut` NULL-SAFE, `validated_by`, `validated_at`, `provenance.source`, `updated_at`).
- 0 ligne affectée → `conflit_concurrent` : **aucune retentative, aucun second UPDATE**, l'IHM recharge et demande une nouvelle décision explicite.
- Erreur BDD → `erreur_base`, aucun retry.
- `updated_at` absent/vide → refus sûr.
- `force` n'existe pas dans ce chantier : aucun paramètre ne permet de franchir une sentinelle.
- Idempotence : clé déterministe `emailId + statut cible + validated_by + validated_at + hash des corrections` ; une intention déjà appliquée retourne `deja_valide` sans écriture.

## 7. Invariants

1. `schema_version` reste `"1.1.0"` ; aucun champ JSON nouveau.
2. Aucune FK écrite ; le Lot 4 n'est pas appelé.
3. Une sentinelle posée n'est jamais retirée ni dégradée.
4. `provenance.source = "humain"` uniquement lorsqu'un opérateur authentifié agit.
5. `validated_by` = UUID serveur de l'opérateur ; `validated_at` = horodatage serveur.
6. Un refus (`A_QUALIFIER`) ne pose aucune sentinelle et reste réversible.
7. Une seule mutation BDD dans tout le chantier.
8. Zéro `any`, zéro `as unknown as`.
9. Aucune action Gmail / Gemini / tâche / entité.

## 8. Tests (doubles en mémoire, aucune écriture réelle)

| Réf | Scénario |
|---|---|
| IHM-01 | Validation simple : `CONFIRMED` + 3 sentinelles + `validation_humaine_requise=false` |
| IHM-02 | Correction puis validation : `modifications_apportees[]` renseigné |
| IHM-03 | Renvoi en qualification : `A_QUALIFIER` + `ambiguities[]`, aucune sentinelle |
| IHM-04 | Email déjà validé → `deja_valide`, aucune écriture |
| IHM-05 | Tentative de dégradation `CONFIRMED` → `DETECTED` → `degradation_interdite` |
| IHM-06 | Tentative d'effacement de `validated_by`/`validated_at` → refus |
| IHM-07 | `provenance.source = "humain"` non retirable |
| IHM-08 | Conflit concurrent (0 ligne) → `conflit_concurrent`, aucun retry, aucun second UPDATE |
| IHM-09 | Erreur BDD → `erreur_base`, aucun retry |
| IHM-10 | `updated_at` absent/vide → refus sûr |
| IHM-11 | Garde composée = 6 prédicats Q.11 exacts, `is.null` si statut absent |
| IHM-12 | Aucune FK dans le payload d'UPDATE |
| IHM-13 | Correction hors chemins autorisés → `correction_hors_perimetre` |
| IHM-14 | Contexte invalide au schéma → `contexte_invalide` |
| IHM-15 | Idempotence : double soumission identique → une seule écriture |
| IHM-16 | Contrôles statiques d'étanchéité : aucun `insert/upsert/delete/rpc`, aucun Gemini/Gmail, aucun `eq.""` |

Vérifications finales : `bunx vitest run` (suite complète Lots 1/2/3/Q.11/Lot 4 + nouveaux tests) et `bunx tsgo --noEmit`.

## 9. Risques

- Garde sur `ai_context` complet : une réécriture identique par un tiers provoque un conflit → rechargement demandé (comportement voulu, jamais de perte).
- Le Lot 3, s'il est un jour branché en production, pourra générer des conflits sur les emails validés : refus sûr par construction, aucune dégradation.
- Volume de la file d'attente : pagination bornée, aucune lecture exhaustive non plafonnée.

## 10. Verdict proposé

Périmètre compatible avec les gels en vigueur (Lot 3 → Lot 4 gelé, Lot 5 gelé, Q.11 préservé). Après validation de ce plan, l'action suivante sera la **rédaction du document** `docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.0.md`, sans aucun code.
