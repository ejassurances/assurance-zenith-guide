# CD-SI-001-B — BRANCHEMENT INGESTION → LOT 2 → LOT 3 — DESIGN V1.0

Statut : DESIGN (aucun code, aucun test, aucune migration, aucune écriture réelle).
Périmètre : conception du branchement de la chaîne `ingestion Gmail existante → Lot 2 Extraction → Lot 3 Résolution`.
Gels : **Lot 4 (autorisation/écriture FK) et Lot 5 sont strictement gelés**. Aucun branchement Lot 3 → Lot 4 n'est conçu ici.

---

## 1. Objet et non-objet

### 1.1 Objet
Définir comment, à partir du code réellement existant, alimenter `public.crm_emails.ai_context`
avec un contexte `DETECTED` (Lot 2) puis le faire évoluer en `PROPOSED` / `AMBIGUOUS` / `A_QUALIFIER`
(Lot 3) sans perturber la chaîne opérationnelle actuelle (`triage_ia`, agents, libellés Gmail).

### 1.2 Non-objet
- Aucune écriture de FK maîtresse (`client_id`, `dossier_id`, `contrat_id`, `compagnie_id`).
- Aucune création d'entité, de tâche, de prospect, ni aucune modification de libellé Gmail.
- Aucun appel Gmail supplémentaire : la chaîne réutilise exclusivement les messages déjà lus.
- Aucune modification du scoring, des prompts ou des seuils des Lots 1–4.
- Aucune IHM nouvelle : l'IHM Qualification existante (V1.2) reste le seul point humain.

---

## 2. Architecture actuelle constatée

### 2.1 Points d'entrée Gmail réels
| Point d'entrée | Fichier | Rôle |
| --- | --- | --- |
| Endpoint cron public | `src/routes/api/public/scan-emails.ts` | Authentifie (`x-relance-token` ou `apikey`), résout une identité technique (`identiteTechnique`), lit les files `A_Traiter` (`listerFilesATraiter`), corrige l'aiguillage (`aiguillerLot`), rattache (`rattacherLot`) puis exécute les agents (`executerAgents`). Bornes : `limite` 1–30, `maxResults` 5–100, cadence 20 min en heures ouvrées. |
| Reprise | `src/routes/api/public/reprendre-mails-ignores.ts` | Reprise des mails restés sans traitement. |
| Agents métier | `src/lib/emails-agents.server.ts` | `rattacherLot` (persistance `crm_emails` + rattachements) et `executerAgents` (agents veille / finance / juridique / commercial). |
| Triage commercial | `src/lib/email-triage.server.ts` | `analyserEmailProspect` : appel Lovable AI Gateway (`google/gemini-3.6-flash`, repli `google/gemini-2.5-flash`), sortie **`TriageResultat`** écrite dans `triage_ia`. |

**Constat clé** : la boîte de réception générale n'est jamais lue. La source est uniquement les
sous-étiquettes `A_Traiter` des services. Le branchement Lot 2 doit donc se greffer *après*
`rattacherLot` (l'email existe alors en base avec un `id`), pas au niveau Gmail.

### 2.2 Producteurs / consommateurs de `triage_ia`
- **Producteurs** : `src/lib/emails-agents.server.ts` uniquement (4 écritures : agent veille, finance,
  juridique/conformité, commercial), chaque fois accompagnées de `triage_le = now()`.
- **Consommateurs** : `src/lib/email-triage-affichage.ts` (dérivation d'affichage conseiller),
  `src/lib/emails.functions.ts` (`select ... triage_ia, triage_le`), et l'IHM Emails.
- **Aucun** module des Lots 1–4 ne lit ni n'écrit `triage_ia` / `triage_le`.

### 2.3 Fonctions Lot 2 disponibles (non branchées)
| Fonction | Fichier | Nature |
| --- | --- | --- |
| `analyserContexteEmail(email, options)` | `email-context-analyzer.server.ts` | Appel Gateway + validation + `construireContexteDetecte`. Timeout 30 s, température 0, `response_format` JSON schema strict. |
| `peutEcrireContexte(existant, {force})` | idem | Garde d'idempotence : refus si `validated_at/by`, statut `CONFIRMED`/`PROPOSED`, provenance `humain`, ou `DETECTED` déjà présent (hors `force`). |
| `persisterContexteEmail(emailId, contexte)` | idem | **Unique** mutation : `UPDATE crm_emails SET ai_context`. |
| `extraireEtEnregistrerContexteEmail(emailId, email, options)` | idem | Orchestrateur Lot 2 complet — **point d'accroche unique du branchement**. |
| Contrats purs | `email-context-extraction.ts`, `email-context-schema.ts`, `email-context-types.ts` | Prompt, schéma Gemini, normalisation, validation runtime. |

### 2.4 Fonctions Lot 3 disponibles (non branchées)
| Fonction | Fichier | Nature |
| --- | --- | --- |
| `croiserContexteEmail(contexte, referentiel, options)` | `email-context-resolution.ts` | Moteur pur, doctrine N1–N9, sans scoring, produit `ambiguities[]`. |
| `lireReferentiel(db, contexte, fks)` | `email-context-resolver.server.ts` | Lecture des référentiels réels. |
| `composerGardeQ11`, `sentinellesHumaines`, `preserverSentinellesHumaines`, `updatedAtExploitable` | idem | Garde optimiste NULL-SAFE Q.11 V1.2 (6 prédicats atomiques). |
| `croiserEtEnregistrerContexteEmail(emailId, options)` | idem | Orchestrateur Lot 3 — **second point d'accroche unique**. Aucun retry. |

### 2.5 Schéma réel de `crm_emails.ai_context`
- Colonne `jsonb` **NOT NULL**, valeur par défaut objet vide (`Row.ai_context: Json` dans les types générés).
- `schema_version = "1.1.0"` (`EMAIL_CONTEXT_SCHEMA_VERSION`).
- Statuts : `DETECTED | PROPOSED | CONFIRMED | AMBIGUOUS | A_QUALIFIER`.
- Provenance : `gemini | regle_deterministe | humain | import | inconnu`.
- Sentinelles humaines : `analyse.validated_by`, `analyse.validated_at`, `analyse.provenance.source = "humain"`.
- Blocs : `correspondant`, `personnes_detectees[]`, `references_detectees`, `ambiguities[]`, `analyse`.
- Validation runtime obligatoire avant toute persistance (`lireContexteEmail`, Zod).

### 2.6 Volumétrie constatée (mesurée le 28/08/2026)
| Mesure | Valeur |
| --- | --- |
| `crm_emails` total | 146 |
| avec `triage_ia` non nul | 146 |
| avec `ai_context` renseigné | **0** |
| reçus < 7 jours | 4 |
| reçus < 30 jours | 66 |
| fenêtre | 01/07/2026 → 21/08/2026 |

Conclusion : volumétrie très faible (≈ 2 mails/jour, pointes ≈ 10/jour). Le branchement est
budgétairement négligeable et un pilote sur backlog complet reste envisageable.

---

## 3. Architecture cible proposée

```text
scan-emails.ts (cron, inchangé)
  └─ listerFilesATraiter        (Gmail, inchangé — AUCUN appel supplémentaire)
     └─ aiguillerLot            (inchangé)
        └─ rattacherLot         (inchangé) ──► crm_emails.id disponible
           └─ executerAgents    (inchangé) ──► triage_ia / triage_le
              └─ [NOUVEAU] orchestrateur de branchement (Lot 2 → Lot 3)
                   ├─ sélection des candidats (voir §3.2)
                   ├─ extraireEtEnregistrerContexteEmail   → ai_context.DETECTED
                   └─ croiserEtEnregistrerContexteEmail    → PROPOSED / AMBIGUOUS / A_QUALIFIER
                        └─ ✋ STOP — Lot 4 gelé (aucune FK écrite)
```

### 3.1 Position exacte du greffon
Un module serveur dédié (`*.server.ts`), appelé **en fin** de `scan-emails`, après `executerAgents`,
dans un `try/catch` isolé : un échec du branchement ne doit jamais faire échouer l'ingestion
ni la réponse HTTP de l'endpoint. Réutilisation stricte des messages déjà en mémoire du lot
(sujet, expéditeur, texte, pièces jointes) — donc **zéro appel Gmail supplémentaire**.

### 3.2 Conditions de déclenchement (candidats)
Un email est candidat au Lot 2 si **toutes** ces conditions sont vraies :
1. il vient d'être rattaché/traité dans le lot courant (ou est sélectionné par le pilote de backlog) ;
2. `peutEcrireContexte(ai_context)` autorise l'écriture (donc pas de `DETECTED`, pas de sentinelle humaine) ;
3. `direction = 'entrant'` ;
4. le texte utile n'est pas vide ;
5. le quota du passage (`plafondLot`) n'est pas atteint.

Un email est candidat au Lot 3 si `ai_context.analyse.statut = 'DETECTED'` et si
`peutCroiserContexte` autorise (aucune sentinelle humaine, `updated_at` exploitable).

Enchaînement Lot 2 → Lot 3 **dans le même passage** autorisé uniquement si le Lot 2 a répondu
`ecrit: true` ; sinon l'email est laissé au passage suivant (pas de retry immédiat).

### 3.3 Coexistence `triage_ia` / `ai_context`
Deux univers strictement disjoints, garantis par construction :

| | `triage_ia` / `triage_le` | `ai_context` |
| --- | --- | --- |
| Producteur | `emails-agents.server.ts` | Lot 2 / Lot 3 / IHM Qualification |
| Consommateur | IHM Emails, affichage conseiller | IHM Qualification |
| Effets métier | crée prospects, dossiers, tâches, libellés | **aucun** |
| Schéma | JSON libre | versionné 1.1.0 + Zod |

Règle : le branchement **ne lit pas** `triage_ia` pour décider, **ne l'écrit jamais**, et n'en
dépend pas. Réciproquement, aucun agent existant n'est modifié.

---

## 4. Risques de double écriture et parades

| Risque | Scénario | Parade existante / à respecter |
| --- | --- | --- |
| R-1 Double extraction | deux passages cron concurrents sur le même email | `peutEcrireContexte` refuse un `DETECTED` existant (hors `force`) ; plafond de lot ; cadence 20 min |
| R-2 Écrasement d'une validation humaine | IHM valide pendant un passage | sentinelles + garde optimiste Q.11 NULL-SAFE (6 prédicats) ; `lignesAffectees !== 1` ⇒ abandon |
| R-3 Course Lot 2 / Lot 3 | Lot 3 lit un contexte modifié entre lecture et écriture | garde optimiste ; aucun retry |
| R-4 Collision avec `triage_ia` | agent écrit la même ligne au même instant | colonnes disjointes ; `UPDATE` ciblé colonne `ai_context` uniquement |
| R-5 Contexte non conforme persisté | dérive de schéma Gemini | `lireContexteEmail` (Zod) avant persistance, dans les deux lots |
| R-6 Amplification de coût | reprise massive du backlog | `plafondLot`, mode dry-run, pilote borné (§7) |
| R-7 Échec bloquant l'ingestion | erreur Gateway | greffon isolé en `try/catch`, jamais dans le chemin critique |

---

## 5. Invariants du branchement

1. Unique mutation base autorisée : `UPDATE public.crm_emails SET ai_context = ...`.
2. Aucune écriture de `client_id`, `dossier_id`, `contrat_id`, `compagnie_id` (Lot 4 gelé).
3. Aucune écriture de `triage_ia`, `triage_le`, statut métier, tâche, entité, prospect.
4. Aucun appel Gmail supplémentaire, aucune modification de libellé.
5. Aucune promotion vers `CONFIRMED` par la machine : `CONFIRMED` reste exclusivement humain.
6. Aucun retry automatique, aucun `force` en production.
7. `schema_version` reste `1.1.0` ; aucun champ ajouté au schéma.
8. Idempotence : rejouer le branchement sur un email déjà traité est un NO-OP explicite.
9. Aucune modification des Lots 1–4 ni de leurs tests.
10. Aucune migration, aucun changement de schéma BDD.

---

## 6. Stratégies opérationnelles

### 6.1 Idempotence
Portée par l'état lui-même, pas par un journal externe : `ai_context.analyse.statut` est la clé
d'idempotence. `DETECTED` ⇒ Lot 2 refusé ; `PROPOSED`/`AMBIGUOUS`/`A_QUALIFIER`/`CONFIRMED` ⇒
Lot 3 refusé. Aucune table ni colonne supplémentaire n'est nécessaire.

### 6.2 Dry-run
Mode `dryRun` par défaut **actif** au premier déploiement : la chaîne exécute sélection, extraction
et croisement, **journalise** le contexte qui *aurait* été écrit, et n'appelle ni
`persisterContexteEmail` ni `ecrireAiContext`. Le passage en écriture réelle se fait par bascule
explicite (paramètre du corps de requête, puis valeur par défaut), jamais par déduction.

### 6.3 Reprise / rollback
- **Reprise** : relancer l'endpoint ; les emails non traités sont naturellement repris grâce à §6.1.
- **Rollback fonctionnel** : remettre `dryRun` à `true`, ou retirer l'appel du greffon — aucune
  donnée métier n'a été touchée, seul `ai_context` est concerné.
- **Rollback données** : `ai_context` peut être remis à `{}` par lot pour les lignes dont
  `analyse.provenance.source = 'gemini'` et sans sentinelle humaine. Les lignes portant
  `validated_by`/`validated_at` ne doivent **jamais** être réinitialisées.
- Aucun rollback de schéma n'est requis (aucune migration).

### 6.4 Coût et limites Gemini
- Modèles : `google/gemini-3.6-flash` puis repli `google/gemini-2.5-flash`, température 0,
  timeout 30 s, sortie JSON schema strict.
- 1 appel Gateway par email pour le Lot 2 ; **0 appel** pour le Lot 3 (moteur déterministe).
- Volumétrie ≈ 2 mails/jour ⇒ coût marginal. Backlog complet = 146 appels au maximum.
- Erreurs 429 / 402 / 403 : arrêt immédiat de la boucle de modèles (comportement déjà implémenté),
  l'email reste candidat au passage suivant.
- Plafond par passage (`plafondLot`, valeur cible 5) pour borner toute dérive.

### 6.5 Métriques et logs nécessaires
Réponse JSON de l'endpoint enrichie (champs additifs, aucun champ existant modifié) :
`contexte_candidats`, `contexte_extraits`, `contexte_refuses` (par motif), `contexte_resolus`,
`contexte_ambigus`, `contexte_erreurs`, `dry_run`.
Logs préfixés `[branchement-contexte]` : identifiant email, motif de refus, modèle utilisé,
statut de sortie. **Interdiction** de journaliser le contenu du mail, une donnée personnelle,
ou une clé.

---

## 7. Périmètre exact du premier pilote

| Élément | Valeur |
| --- | --- |
| Portée | emails **entrants** du lot courant uniquement (pas de reprise de backlog) |
| Volume | `plafondLot = 5` par passage |
| Mode | `dryRun = true` sur les 3 premiers jours, puis écriture réelle |
| Lots actifs | Lot 2 puis Lot 3 |
| Lots gelés | Lot 4, Lot 5 — aucune FK, aucune tâche |
| Sortie attendue | `ai_context` en `DETECTED` puis `PROPOSED`/`AMBIGUOUS`/`A_QUALIFIER` |
| Observation | IHM Qualification existante (aucune évolution IHM) |
| Sortie de pilote | ≥ 20 emails traités, 0 sentinelle humaine écrasée, 0 FK écrite, 0 échec d'ingestion |

---

## 8. Garde-fous requis AVANT toute écriture réelle

1. Dry-run exécuté et journal relu sur au moins 10 emails représentatifs.
2. Vérification que `ai_context` reste à `{}` pendant tout le dry-run (contrôle par requête de comptage).
3. Confirmation que `triage_ia` / `triage_le` sont inchangés sur la période.
4. Plafond de lot en place et testé.
5. Isolation `try/catch` vérifiée : un échec Gateway simulé ne casse pas `scan-emails`.
6. Aucune importation, directe ou transitive, de `email-fk-authorization*` dans le greffon (étanchéité Lot 4).
7. Aucun `force: true` dans le chemin de production.
8. Procédure de rollback (§6.3) écrite et validée par la DG.

---

## 9. Dépendances

- Amont : `gmail.server.ts` (`listerFilesATraiter`), `emails-agents.server.ts` (`rattacherLot`),
  `agent-taches.server.ts` (`identiteTechnique`), `client.server.ts` (`supabaseAdmin`).
- Cœur : Lot 1 (types/schéma), Lot 2 (analyzer + extraction), Lot 3 (resolution + resolver, Q.11 V1.2).
- Aval : IHM Qualification V1.2 (lecture/validation humaine) — inchangée.
- Externe : Lovable AI Gateway (`LOVABLE_API_KEY`), Supabase (`crm_emails`).
- Aucune nouvelle dépendance npm, aucun nouveau secret.

---

## 10. Critères GO / NO-GO

**GO** si : les 8 garde-fous du §8 sont satisfaits ; le pilote §7 est borné ; les 10 invariants du §5
sont documentés et testables ; la stratégie de rollback est validée.

**NO-GO** si : une écriture FK est envisagée, un `force` figure dans le chemin production, un retry
automatique est introduit, un appel Gmail supplémentaire est nécessaire, `triage_ia` est lu ou écrit
par le branchement, ou le dry-run est absent.

---

## 11. Déploiement progressif

| Phase | Contenu | Sortie |
| --- | --- | --- |
| P0 | Design (ce document) validé DG | GO FERME de conception |
| P1 | Greffon isolé, `dryRun = true`, plafond 5 | journaux conformes, 0 écriture |
| P2 | Écriture réelle Lot 2 seule | `DETECTED` présents, 0 sentinelle écrasée |
| P3 | Activation Lot 3 | `PROPOSED`/`AMBIGUOUS` présents, 0 FK |
| P4 | Revue humaine via IHM Qualification | taux de qualification mesuré |
| P5 | Décision DG séparée sur le dégel du Lot 4 | hors périmètre |
