# CD-SI-001-B — BRANCHEMENT INGESTION → LOT 2 → LOT 3 — DESIGN V1.4

Statut : DESIGN DOCUMENTAIRE (aucune modification technique, aucun code, aucun test, aucune migration, aucune écriture réelle).
Périmètre : conception du branchement de la chaîne `ingestion Gmail existante → Lot 2 Extraction → Lot 3 Résolution`.
Gels : **Lot 4 (autorisation/écriture FK) et Lot 5 sont strictement gelés**. Aucun branchement Lot 3 → Lot 4 n'est conçu ici.

## Historique des révisions

| Version | Date | Objet |
| --- | --- | --- |
| V1.0 | 28/08/2026 | Conception initiale (ACTION 38). |
| V1.1 | 28/08/2026 | Corrections documentaires imposées par le RAPPORT ACTION 39 (audit DG) : trancher MAJEUR-1 (point d'insertion, option a), MAJEUR-2 (résolution `gmail_message_id → crm_emails.id`), MINEUR-1 (dry-run), MINEUR-2 (rollback), plus la sémantique `direction` et le critère de couverture du pilote. Aucune autre modification. |
| V1.2 | 28/08/2026 | Corrections documentaires imposées par le RAPPORT ACTION 41 (audit DG final V1.1) : MAJEUR-1 (point d'insertion unique et précis dans la boucle de triage général), MAJEUR-2 (dry-run sans orchestrateurs persistants), MINEUR-1 (isolation d'erreur dédiée au greffon), MINEUR-2 (métriques strictement additives), INFO-1 (lecture préalable `SELECT ai_context` non mutatrice). Aucune autre modification. |
| V1.3 | 28/08/2026 | Corrections documentaires imposées par le RAPPORT ACTION 44 (audit DG final du dry-run) : MAJEUR-1 (borner la sémantique de la métrique `contexte_couverture` au seul périmètre présenté au greffon), MINEUR-1 (requalifier la simulation Lot 3 avec `referentielVide()`), MINEUR-2 (figer la sémantique du mode dry-run), ajout des sections « Limites du pilote dry-run », « Critères de sortie du dry-run » et « Décision DG à conserver explicitement ». **Aucune modification technique.** |
| V1.4 | 28/08/2026 | Corrections documentaires imposées par le RAPPORT ACTION 54 (diagnostic de l'ordre d'insertion CRM) : documentation de l'ordre réel d'insertion `crm_emails` vs point d'insertion du greffon (§13.1), qualification du problème `sans_ligne_crm` (§13.2), **conception de l'option B — post-traitement dans la même itération, sans second appel Gmail** (§13.3), machine d'état et idempotence du post-traitement (§13.4), métriques et nouveaux compteurs additifs (§13.5), formule de couverture auditable et non gonflable (§13.6), revue des `continue` métier (§13.7), comparaison Options A/B/D et recommandation DG (§13.8-13.9). **Aucune modification technique, aucun code, aucun test, aucune migration, aucun appel Gmail ni Gemini. `BRANCHEMENT_CONTEXTE_DRY_RUN` reste `true` ; l'écriture `DETECTED` reste non autorisée.** |

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
sous-étiquettes `A_Traiter` des services. Le branchement Lot 2 doit donc se greffer là où l'email
est déjà persisté **et** où son corps complet est déjà en mémoire (voir §3.1).

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
| `extraireEtEnregistrerContexteEmail(emailId, email, options)` | idem | Orchestrateur Lot 2 complet. **Point d'accroche unique du branchement en écriture réelle** ; **NON utilisé en dry-run** (§6.2). |
| Contrats purs | `email-context-extraction.ts`, `email-context-schema.ts`, `email-context-types.ts` | Prompt, schéma Gemini, normalisation, validation runtime. |

### 2.4 Fonctions Lot 3 disponibles (non branchées)
| Fonction | Fichier | Nature |
| --- | --- | --- |
| `croiserContexteEmail(contexte, referentiel, options)` | `email-context-resolution.ts` | Moteur pur, doctrine N1–N9, sans scoring, produit `ambiguities[]`. |
| `lireReferentiel(db, contexte, fks)` | `email-context-resolver.server.ts` | Lecture des référentiels réels. |
| `composerGardeQ11`, `sentinellesHumaines`, `preserverSentinellesHumaines`, `updatedAtExploitable` | idem | Garde optimiste NULL-SAFE Q.11 V1.2 (6 prédicats atomiques). |
| `croiserEtEnregistrerContexteEmail(emailId, options)` | idem | Orchestrateur Lot 3 — **second point d'accroche unique en écriture réelle**. Aucun retry. **NON utilisé en dry-run** (§6.2). |

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

### 2.7 Sémantique réelle de `direction`
Constat sur le code existant (ingestion dans `emails-agents.server.ts`), **inchangé par le présent design** :
- `direction = 'entrant'` est la valeur **par défaut** ;
- la direction `sortant` est **déduite par présence du label Gmail `SENT`** sur le message ;
- conséquence : un message portant le label `SENT` présent dans une file `A_Traiter` (cas rare,
  par exemple un envoi réaiguillé) serait classé `sortant` et donc exclu du branchement par la
  condition §3.2-3 ; réciproquement, un courriel mal étiqueté côté Gmail pourrait être classé de
  façon imparfaite. Ce risque de **classification imparfaite est assumé et documenté** ;
- le branchement **ne modifie en rien** cette logique : il consomme `direction` tel quel.

---

## 3. Architecture cible proposée

```text
scan-emails.ts (cron, inchangé)
  └─ listerFilesATraiter        (Gmail, inchangé — AUCUN appel supplémentaire)
     └─ aiguillerLot            (inchangé)
        └─ rattacherLot         (inchangé) ──► crm_emails persisté (gmail_message_id connu)
           └─ executerAgents    (agents inchangés)
              ├─ lireMessage(m.id)  (Gmail, déjà existant — réutilisé tel quel)
              │    └─ detail : { sujet, expediteur_nom, expediteur_email, texte, snippet, pieces_jointes, thread_id, date }
              ├─ agents veille/finance/juridique/commercial (inchangés) ──► triage_ia / triage_le
              └─ [NOUVEAU] greffon de branchement (Lot 2 → Lot 3)
                   ├─ résolution gmail_message_id → crm_emails.id (lecture seule, §3.4)
                   ├─ sélection des candidats (voir §3.2)
                   ├─ en écriture réelle : extraireEtEnregistrerContexteEmail   → ai_context.DETECTED
                   ├─ en écriture réelle : croiserEtEnregistrerContexteEmail    → PROPOSED / AMBIGUOUS / A_QUALIFIER
                   └─ en dry-run : chemin dédié sans persistance (§6.2)
                        └─ ✋ STOP — Lot 4 gelé (aucune FK écrite)
```

### 3.1 Position exacte du greffon (MAJEUR-1 — tranché : option a, précisé en V1.2, borne sémantique ajoutée en V1.3)

**Décision (option a retenue, déterminée de façon univoque)** : le branchement Lot 2 → Lot 3 est
effectué **dans `executerAgents`**, au point où le `detail` du message Gmail est **déjà chargé**.

**Point d'insertion unique et exact (V1.2/V1.3)** :
- il existe **une seule boucle** de branchement : la **boucle principale de traitement du triage
  général** de `executerAgents` ;
- le greffon est invoqué **après `detail = await lireMessage(m.id)`** (et après les agents qui
  produisent `triage_ia`) ;
- le greffon est invoqué **avant les `continue` métier** qui terminent l'itération courante, de
  sorte qu'aucun chemin de sortie anticipée ne prive un email candidat du branchement ni ne le
  duplique ;
- **aucun second point d'insertion n'est créé dans la seconde boucle « Relation client »** de
  `executerAgents` : le branchement n'existe qu'en un seul endroit du code.

**Borne sémantique du point d'insertion (V1.3)** : le greffon n'est présent que dans la boucle
principale de triage général de `executerAgents`. Par conséquent :
- les messages écartés **avant** leur entrée dans le lot `aTrier` ne sont **pas vus** par le greffon ;
- la boucle « Relation client » n'est **volontairement pas couverte** par le branchement ;
- les `continue` situés **après** le point d'insertion n'empêchent **pas** le greffon de s'exécuter,
  puisque celui-ci est placé **avant** ces `continue` ;
- la métrique `contexte_couverture` ne mesure donc que le **taux de couverture du périmètre présenté
  au greffon**, et ne doit **jamais** être interprétée comme un « pourcentage de tous les emails
  ingérés traités par Lot 2 ». Voir §7 pour la distinction des univers A–F.

Pourquoi ce point précis garantit les propriétés requises :
- **corps complet disponible** : `detail.texte` (avec repli `detail.snippet` déjà appliqué par le
  code existant) est en mémoire à cet endroit ; le greffon ne reçoit jamais un résumé tronqué ;
- **aucun appel Gmail supplémentaire** : `lireMessage(m.id)` est déjà invoqué par le chemin nominal
  d'ingestion pour chaque message ; le greffon réutilise strictement ce `detail` en mémoire ;
- **couverture mesurable du périmètre présenté** : chaque message du lot `aTrier` passe exactement
  une fois devant le greffon, ce qui rend le **taux de couverture du périmètre présenté au greffon**
  dénombrable sans ambiguïté ;
- **absence de duplication** : point d'insertion unique ⇒ impossible d'exécuter deux fois le
  branchement pour un même message au sein d'un même passage.

**Données disponibles au point d'insertion** (vérifiées dans le code réel) :
`detail.sujet`, `detail.expediteur_nom`, `detail.expediteur_email`, `detail.texte`
(repli `detail.snippet` déjà appliqué par le code existant), `detail.pieces_jointes`
(nom/mime), `detail.thread_id`, `detail.date`, `m.id` (`gmail_message_id`), `m.thread_id`,
`m.date`. Ces champs suffisent au contrat d'entrée de `analyserContexteEmail`.

**Isolation d'erreur dédiée (MINEUR-1 V1.2)** : le greffon est invoqué dans son **propre
`try/catch` dédié**, distinct du `catch` historique d'`executerAgents`. Une erreur du greffon :
- ne **déclenche pas** le `catch` historique d'`executerAgents` ;
- ne **crée aucune tâche administrative parasite** (le catch historique en créerait une) ;
- ne **fausse pas** le compteur historique `erreurs` du retour d'`executerAgents` ;
- n'**interrompt pas** le traitement des autres messages du lot (la boucle continue à l'itération
  suivante) ;
- est uniquement **journalisée** sous le préfixe `[branchement-contexte]` et comptabilisée dans la
  métrique additive `contexte_erreurs` (§6.5).

### 3.2 Conditions de déclenchement (candidats)
Un email est candidat au Lot 2 si **toutes** ces conditions sont vraies :
1. il vient d'être rattaché/traité dans le lot courant (ou est sélectionné par le pilote de backlog) ;
2. `peutEcrireContexte(ai_context)` autorise l'écriture (donc pas de `DETECTED`, pas de sentinelle humaine) ;
3. `direction = 'entrant'` (sémantique §2.7, inchangée) ;
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

### 3.4 Résolution `gmail_message_id → crm_emails.id` (MAJEUR-2)

Section dédiée, règles strictes :

1. La résolution est **en lecture seule** : `SELECT id FROM public.crm_emails WHERE gmail_message_id = :id`
   (la colonne `gmail_message_id` existe et est alimentée par l'ingestion actuelle, avec contrainte
   d'unicité exploitée par `onConflict: "gmail_message_id"`).
2. La clé de correspondance est **`gmail_message_id`** (identifiant Gmail du message), valeur
   disponible au point d'insertion §3.1 (`m.id`).
3. **Si aucune ligne `crm_emails` n'est trouvée : SKIP.** L'email est comptabilisé dans la métrique
   « ignoré car `crm_emails.id` absent » (§7) et laissé au passage suivant ; aucune autre action.
4. Le branchement **ne crée jamais** de ligne `crm_emails` : **aucun `INSERT`, aucun `UPSERT`**.
   La persistance de la ligne reste l'affaire exclusif de l'ingestion existante.
5. **Aucune migration** : aucune colonne, index, table ou contrainte nouvelle n'est requise.
6. **Lecture préalable `SELECT ai_context` (INFO-1 V1.2)** : la sélection des candidats (§3.2)
   peut effectuer un `SELECT ai_context FROM public.crm_emails WHERE id = :id` **strictement non
   mutateur** pour déterminer si un contexte est déjà présent et alimenter la ventilation du taux
   de couverture du périmètre présenté au greffon (§7). Cette lecture préalable **ne remplace jamais
   la garde finale en BDD** : l'autorisation d'écriture reste décidée par `peutEcrireContexte`, les
   sentinelles humaines et la garde optimiste Q.11 NULL-SAFE appliquée au moment de l'`UPDATE`. Toute
   divergence entre la lecture préalable et l'état réel au moment de l'écriture est tranchée par la
   garde BDD, jamais par la lecture.

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
| R-8 Email sans ligne `crm_emails` | rattachage non effectué pour ce message | résolution §3.4 : SKIP explicite, aucun insert/upsert |

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
11. Aucun `INSERT`/`UPSERT` dans `crm_emails` par le branchement : ligne absente ⇒ SKIP (§3.4).
12. Aucune modification de la sémantique `direction` (§2.7).

---

## 6. Stratégies opérationnelles

### 6.1 Idempotence
Portée par l'état lui-même, pas par un journal externe : `ai_context.analyse.statut` est la clé
d'idempotence. `DETECTED` ⇒ Lot 2 refusé ; `PROPOSED`/`AMBIGUOUS`/`A_QUALIFIER`/`CONFIRMED` ⇒
Lot 3 refusé. Aucune table ni colonne supplémentaire n'est nécessaire.

### 6.2 Dry-run (MAJEUR-2 V1.2 — refonte, sémantique figée en V1.3)
Le dry-run est une propriété du **greffon**, pas du cron existant. **Aucun paramètre du cron
`scan-emails` ne permet actuellement de le piloter**, et ce design ne prétend pas qu'une bascule
opérationnelle à chaud du cron existe.

**Règle fondamentale (V1.2/V1.3)** : en dry-run, le greffon **n'appelle PAS les orchestrateurs de
production** `extraireEtEnregistrerContexteEmail` ni `croiserEtEnregistrerContexteEmail`, car ces
orchestrateurs persistent `ai_context`. Le dry-run suit un chemin dédié, sans aucune persistance :

1. **Sélection** : application des conditions de candidature §3.2, incluant la lecture préalable
   non mutatrice `SELECT ai_context` (§3.4-6) ;
2. **Résolution CRM** : `SELECT id FROM public.crm_emails WHERE gmail_message_id = :id` (§3.4),
   avec SKIP et métrique `contexte_sans_ligne_crm` si absent ;
3. **Extraction Lot 2 sans persistance** : appel de l'analyse Gemini (`analyserContexteEmail`)
   et validation Zod du contexte produit, **sans** appeler `persisterContexteEmail` ;
4. **Simulation du résultat** : **journalisation** du contexte `DETECTED` qui *aurait* été écrit
   (sans contenu du mail, sans donnée personnelle — §6.5) et comptabilisation dans les métriques ;
5. **Simulation du croisement** : le croisement Lot 3 est simulé via les **fonctions pures**
   (`croiserContexteEmail` **avec `referentielVide()`**) **sans** `lireReferentiel` et sans aucune
   écriture. Le **Lot 3 de production n'est PAS exécuté en dry-run**, puisqu'il exige un `DETECTED`
   réellement persisté en base ; sa simulation est donc nécessairement approchée et le design
   l'assume explicitement (§7.1).

**Sémantique du mode dry-run (V1.3)** :
- `BRANCHEMENT_CONTEXTE_DRY_RUN` est actuellement `true` dans le code déployé ;
- le champ métrique `contexte_dry_run` reflète le mode du passage ;
- la fonction interne accepte techniquement un paramètre `dryRun` pour les tests, mais le chemin de
  production actuel utilise la **constante de module** ;
- **aucune bascule à chaud par le cron n'existe** ;
- le passage au mode réel nécessitera un **changement de code contrôlé**, une **revue DG** et un
  **nouveau déploiement** ;
- **AUCUNE décision de passage en écriture n'est prise par ACTION 45** (§7.3).

Modalités exactes d'activation dans l'implémentation :
1. Le mode dry-run est matérialisé par une **constante de configuration du module du greffon**
   (`BRANCHEMENT_CONTEXTE_DRY_RUN = true`), avec `true` comme valeur **au premier déploiement**.
2. En dry-run, aucun appel à `persisterContexteEmail` ni `ecrireAiContext` n'est possible :
   `ai_context` reste à `{}` pendant toute la durée du dry-run (contrôle §8-2).
3. Le passage en écriture réelle est un **changement de code déployé** (constante passée à
   `false`), soumis à validation DG préalable — jamais une déduction, jamais un paramètre
   d'exécution du cron.
4. Un paramétrage d'exécution (corps de requête d'un appel manuel de pilote) pourra être ajouté
   *dans l'implémentation* uniquement pour le pilote borné §7 ; il n'existe pas aujourd'hui et
   n'est pas requis par le chemin nominal.

### 6.3 Reprise / rollback (MINEUR-2)
- **Reprise** : relancer l'endpoint ; les emails non traités sont naturellement repris grâce à §6.1
  et §3.4.
- **Rollback fonctionnel** : repasser la constante du greffon en dry-run, ou retirer l'appel du
  greffon dans `executerAgents` — aucune donnée métier n'a été touchée, seul `ai_context` est
  concerné.
- **Réinitialisation de données (opération exceptionnelle)** : la remise de `ai_context` à `{}`
  est une **opération d'exploitation exceptionnelle, réalisée manuellement et uniquement après
  validation DG**, au cas par cas. Elle est **hors du chemin nominal** du branchement et **ne doit
  jamais être implémentée comme un mécanisme automatique de rollback** (ni dans le greffon, ni dans
  le cron, ni dans une tâche planifiée). Périmètre maximal de cette opération manuelle : lignes
  dont `analyse.provenance.source = 'gemini'` et sans sentinelle humaine ; les lignes portant
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

### 6.5 Métriques et logs nécessaires (MINEUR-2 V1.2)
Réponse JSON de l'endpoint enrichie de champs **strictement additifs** :
`contexte_dry_run`, `contexte_selectionnes`, `contexte_traites`, `contexte_ignores_contexte_present`,
`contexte_sans_ligne_crm`, `contexte_refus_securises`, `contexte_erreurs`,
`contexte_simules_proposes`, `contexte_simules_ambigus`, `contexte_couverture`.

**Caractère additif garanti (V1.2/V1.3)** : aucun champ historique du retour d'`executerAgents` ni de
la réponse de `scan-emails` ne change de sémantique, de nom, de type ou de valeur — notamment le
compteur historique `erreurs`, qui n'est **jamais** incrémenté par le greffon (§3.1, isolation
d'erreur dédiée). Les nouvelles métriques `contexte_*` sont calculées par le greffon seul et
fusionnées dans la réponse sans toucher aux champs existants.

**Sémantique de `contexte_couverture` (V1.3)** :
- formule : `contexte_traites / contexte_selectionnes` ;
- nom du champ runtime inchangé : `contexte_couverture` ;
- nom conceptuel dans ce document et dans les rapports d'audit : **« taux de couverture du périmètre
  présenté au greffon »** ;
- cette métrique **ne doit jamais être présentée comme** : « pourcentage de tous les emails ingérés
  traités par Lot 2 ».

Logs préfixés `[branchement-contexte]` : identifiant email, motif de refus, modèle utilisé,
statut de sortie. **Interdiction** de journaliser le contenu du mail, une donnée personnelle,
ou une clé.

---

## 7. Périmètre exact du premier pilote

| Élément | Valeur |
| --- | --- |
| Portée | emails **entrants** du lot courant uniquement (pas de reprise de backlog) |
| Volume | `plafondLot = 5` par passage |
| Mode | dry-run actif sur les 3 premiers jours (constante du greffon, §6.2), puis écriture réelle |
| Lots actifs | Lot 2 puis Lot 3 |
| Lots gelés | Lot 4, Lot 5 — aucune FK, aucune tâche |
| Sortie attendue | `ai_context` en `DETECTED` puis `PROPOSED`/`AMBIGUOUS`/`A_QUALIFIER` |
| Observation | IHM Qualification existante (aucune évolution IHM) |

### 7.1 Distinction des univers de couverture (MAJEUR-1 V1.3)

Pour éviter toute extrapolation abusive de la métrique `contexte_couverture`, les univers suivants
sont distingués :

| Univers | Définition | Inclus dans `contexte_couverture` ? |
| --- | --- | --- |
| **A. Emails ingérés** | Tous les messages lus par `scan-emails` depuis Gmail (files `A_Traiter`, etc.) | **Non** — le greffon ne les voit pas tous |
| **B. Emails atteignant `aTrier`** | Messages qui entrent dans la boucle principale de triage général de `executerAgents` | Partiellement — c'est le plafond qui filtre |
| **C. Emails présentés au greffon** | Messages qui passent les conditions §3.2 (entrant, texte non vide, pas de sentinelle, etc.) avant application du plafond | Partiellement — le plafond limite C à D |
| **D. Emails sélectionnés par le plafond** | Messages retenus par le greffon après application de `plafondLot` | Dénominateur de `contexte_couverture` |
| **E. Emails effectivement traités** | Messages pour lesquels `analyserContexteEmail` a produit un contexte valide en mémoire | Numérateur de `contexte_couverture` |
| **F. Emails ignorés / refusés / en erreur** | Messages SKIP (CRM absent), refus sécurisés, erreurs Gateway/Zod/BDD | Ventilation du dénominateur |

**Règle d'interprétation** : le critère de couverture du pilote doit être calculé sur **C/D/E**
et ne doit **pas** être extrapolé à **A**. Le rapport d'audit doit toujours préciser que
`contexte_couverture` = « taux de couverture du périmètre présenté au greffon ».

### 7.2 Limites du pilote dry-run (V1.3)

Le dry-run V1.3 est techniquement étanche mais soumis aux limites suivantes, qui doivent être
explicitement communiquées avant toute interprétation métier :

1. **Couverture limitée au périmètre présenté au greffon** : voir §7.1 ; la métrique ne couvre
   ni les emails écartés avant `aTrier`, ni la boucle « Relation client ».
2. **Plafond de 5 emails par passage** : le dénominateur est artificiellement borné ; le taux de
   couverture mesuré sur un volume faible peut être instable.
3. **Simulation Lot 3 sur référentiel vide** : le dry-run utilise `referentielVide()` pour
   `croiserContexteEmail`. Les statuts simulés `PROPOSED` ne sont **pas représentatifs** des
   référentiels CRM réels. `contexte_simules_proposes` est une **métrique technique**, non une
   métrique décisionnelle du pilote.
4. **Coût potentiel du fallback multi-modèles Gateway** : en cas d'indisponibilité du modèle
   principal, le repli peut consommer des crédits ; le dry-run borne ce risque via `plafondLot`.
5. **Classification `direction` héritée du label `SENT`** : un message mal étiqueté dans Gmail
   peut être classé `sortant` à tort et exclu du périmètre (§2.7).
6. **Absence de mesure fiable de la qualité réelle du rattachement CRM** : sans référentiels
   réels et sans écriture `DETECTED`, le dry-run ne peut pas évaluer la qualité métier du Lot 3.
7. **Absence de toute écriture `DETECTED` en production** : par construction, aucun contexte
   n'est persisté pendant le dry-run ; les seules validations possibles sont structurelles
   (chemin, garde-fous, étanchéité, statuts).

**Avertissement explicite** : **Aucun jugement de qualité métier du Lot 3 ne doit être déduit des
résultats du dry-run V1.2/V1.3.** Le véritable croisement Lot 3 avec référentiels réels sera
évalué dans une phase ultérieure, après décision DG distincte.

### 7.3 Critères de sortie du dry-run (V1.3)

Le dry-run peut être considéré comme **techniquement satisfaisant** si les conditions suivantes
sont réunies :

1. Aucune mutation BDD (`INSERT`, `UPDATE`, `DELETE`, `UPSERT`, RPC d'écriture) ;
2. Aucune FK maîtresse écrite (`client_id`, `dossier_id`, `contrat_id`, `compagnie_id`) ;
3. Aucune écriture dans `triage_ia` / `triage_le` imputable au greffon ;
4. Aucun branchement Lot 4 / Lot 5 ;
5. Aucun retry automatique ;
6. Aucun `force` ;
7. Aucun appel Gmail supplémentaire ;
8. Protection effective des sentinelles humaines (Q.11) ;
9. Tests et typecheck verts ;
10. Métriques de couverture correctement interprétées comme « taux de couverture du périmètre
    présenté au greffon » (§7.1) ;
11. Absence d'erreur bloquant le flux nominal (`executerAgents`, `scan-emails`) ;
12. Journaux `[branchement-contexte]` conformes et sans donnée personnelle.

**Ces critères ne constituent PAS une autorisation de passage en écriture.** Le passage à l'écriture
`DETECTED` reste soumis à une décision DG distincte après revue des résultats du dry-run.

### 7.4 Critères de sortie du pilote (historique — inchangés, à réévaluer après dry-run)

1. **Taux de couverture du périmètre présenté au greffon** : `emails éligibles effectivement traités / emails éligibles identifiés par le greffon`, avec ventilation obligatoire entre :
   - **traité** : Lot 2 exécuté (et Lot 3 si `DETECTED` écrit) ;
   - **ignoré car `crm_emails.id` absent** (SKIP §3.4) ;
   - **ignoré car contexte déjà présent** (garde d'idempotence §6.1) ;
   - **refus sécurisé** (sentinelle humaine, `peutEcrireContexte`, garde Q.11) ;
   - **erreur** (Gateway, validation Zod, BDD).
2. ≥ 20 emails traités ;
3. 0 sentinelle humaine écrasée ;
4. 0 FK écrite ;
5. 0 échec d'ingestion imputable au greffon ;
6. 0 ligne `crm_emails` créée par le branchement.

---

## 8. Garde-fous requis AVANT toute écriture réelle

1. Dry-run exécuté et journal relu sur au moins 10 emails représentatifs.
2. Vérification que `ai_context` reste à `{}` pendant tout le dry-run (contrôle par requête de comptage).
3. Confirmation que `triage_ia` / `triage_le` sont inchangés sur la période.
4. Plafond de lot en place et testé.
5. Isolation `try/catch` vérifiée : un échec Gateway simulé ne casse ni `executerAgents` ni `scan-emails`.
6. Aucune importation, directe ou transitive, de `email-fk-authorization*` dans le greffon (étanchéité Lot 4).
7. Aucun `force: true` dans le chemin de production.
8. Procédure d'exploitation exceptionnelle (§6.3) écrite et validée par la DG.
9. Vérification du SKIP §3.4 : un email sans ligne `crm_emails` ne déclenche aucun insert/upsert.
10. Relecture DG de ce DESIGN V1.3 et confirmation que la sémantique de couverture (§7.1) et les
    limites du dry-run (§7.2) sont comprises et acceptées.

---

## 9. Dépendances

- Amont : `gmail.server.ts` (`listerFilesATraiter`, `lireMessage`), `emails-agents.server.ts`
  (`rattacherLot`, `executerAgents`), `agent-taches.server.ts` (`identiteTechnique`),
  `client.server.ts` (`supabaseAdmin`).
- Cœur : Lot 1 (types/schéma), Lot 2 (analyzer + extraction), Lot 3 (resolution + resolver, Q.11 V1.2).
- Aval : IHM Qualification V1.2 (lecture/validation humaine) — inchangée.
- Externe : Lovable AI Gateway (`LOVABLE_API_KEY`), Supabase (`crm_emails`).
- Aucune nouvelle dépendance npm, aucun nouveau secret.

---

## 10. Critères GO / NO-GO

**GO** si : les 10 garde-fous du §8 sont satisfaits ; le pilote §7 est borné ; les 12 invariants du §5
sont documentés et testables ; la procédure d'exploitation exceptionnelle est validée.

**NO-GO** si : une écriture FK est envisagée, un `force` figure dans le chemin production, un retry
automatique est introduit, un appel Gmail supplémentaire est nécessaire, `triage_ia` est lu ou écrit
par le branchement, le dry-run est absent, un `INSERT`/`UPSERT` `crm_emails` est introduit par le
branchement, ou un mécanisme automatique de rollback/réinitialisation de `ai_context` est implémenté.

---

## 11. Déploiement progressif

| Phase | Contenu | Sortie |
| --- | --- | --- |
| P0 | Design (ce document) validé DG | GO FERME de conception |
| P1 | Greffon isolé dans `executerAgents`, **dry-run actif**, plafond 5 | journaux conformes, 0 écriture, métriques de couverture du périmètre présenté au greffon |
| P2 | **Décision DG distincte** : écriture réelle Lot 2 seule | `DETECTED` présents, 0 sentinelle écrasée |
| P3 | **Décision DG distincte** : activation Lot 3 | `PROPOSED`/`AMBIGUOUS` présents, 0 FK |
| P4 | Revue humaine via IHM Qualification | taux de qualification mesuré |
| P5 | **Décision DG séparée** sur le dégel du Lot 4 | hors périmètre |

---

## 12. Décision DG à conserver explicitement (V1.3)

**ACTION 45 ne constitue pas une autorisation de passage en écriture.**

Statut à la fin de l'ACTION 45 :

| Thème | Statut |
| --- | --- |
| Dry-run | 🟢 AUTORISÉ |
| Écriture `DETECTED` | 🟠 NON AUTORISÉE |
| Lot 4 | 🔒 GELÉ |
| Lot 5 | 🔒 GELÉ |

Tout passage à l'écriture `DETECTED` devra faire l'objet d'une **décision DG distincte** après
revue des résultats du dry-run. Aucun basculement ne peut être déduit de la seule conformité
du dry-run.

---

## 13. Post-traitement du cas `sans_ligne_crm` (V1.4 — conséquences de l'ACTION 54)

Cette section est la **seule** nouveauté de la V1.4. Elle est strictement documentaire : elle
**conçoit** l'option B identifiée par le RAPPORT ACTION 54 sans l'implémenter. Les §1 à §12
restent valides et inchangés.

### 13.1 Ordre réel d'insertion CRM constaté (ACTION 54)

Séquence réelle d'un passage `POST /api/public/scan-emails` :

```text
1. auth + identiteTechnique
2. listerFilesATraiter          (Gmail — seule lecture de liste)
3. aiguillerLot                 (renvoi des mails mal libellés, retirés du lot)
4. rattacherLot                 (upsert crm_emails pour les messages du lot)
5. executerAgents
     pour chaque message :
       5.a lireMessage(m.id)     (Gmail — UNIQUE appel détail, déjà existant)
       5.b agents métier         (veille / finance / juridique / commercial)
           → certains chemins créent ou complètent crm_emails APRÈS 5.a
       5.c [greffon] brancherContexteEmail(...)   ← point d'insertion actuel
```

**Constat structurant** : la ligne `crm_emails` d'un message n'est pas garantie présente au
moment où le greffon s'exécute. Selon le chemin métier emprunté, la persistance/complétion de
la ligne peut intervenir **au cours de la même itération**, avant ou après 5.c, ou lors d'un
passage ultérieur.

### 13.2 Qualification du problème `sans_ligne_crm`

Observation ACTION 53 : sur 5 emails présentés au greffon, **3** ont été comptés
`contexte_sans_ligne_crm` alors que leur ligne `crm_emails` existait à la fin du passage.

Conséquences :
- ce ne sont **pas des erreurs** : le SKIP §3.4 est conforme (aucun `INSERT`/`UPSERT`) ;
- mais la métrique `contexte_couverture` est **structurellement dégradée** par un simple effet
  d'ordonnancement, et non par une incapacité du Lot 2 ;
- le message est laissé au passage suivant, où il peut être écarté par d'autres filtres
  (libellé d'état posé entre-temps, contexte déjà présent, direction), d'où une **perte
  d'observabilité** du pilote.

### 13.3 Option B — post-traitement dans la même itération (conception)

**Principe** : conserver le premier passage du greffon à son point d'insertion actuel, puis
autoriser **un seul** second passage *logique* en fin d'itération métier du même message,
**exclusivement** avec le `detail` Gmail déjà chargé en 5.a.

Déroulé conçu :

1. **Premier passage (inchangé)** : le greffon est invoqué au point §3.1. Toutes les conditions
   §3.2 s'appliquent à l'identique (direction, texte non vide, plafond, gardes).
2. **Identification `sans_ligne_crm`** : si la résolution §3.4 ne trouve pas de ligne, le message
   est marqué en mémoire — pour la durée de l'itération courante seulement — comme
   `EN_ATTENTE_LIGNE_CRM`. Aucune persistance, aucune table, aucune colonne, aucun cache
   inter-passages.
3. **Poursuite normale de l'itération métier** : aucun agent, aucun `continue`, aucun ordre
   d'exécution métier n'est modifié. Le greffon n'attend rien et ne bloque rien.
4. **Détection de la création éventuelle de `crm_emails`** : en fin d'itération du message, et
   **uniquement si** l'état mémoire est `EN_ATTENTE_LIGNE_CRM`, une **seconde lecture seule**
   `SELECT id, ai_context, updated_at FROM public.crm_emails WHERE gmail_message_id = :id`
   est effectuée. C'est une lecture BDD, **jamais** un appel Gmail.
5. **Second passage logique** : si et seulement si la ligne existe désormais, le greffon rejoue
   son chemin dry-run (§6.2) avec le **même objet `detail`** déjà en mémoire. `lireMessage`
   n'est **jamais** rappelé. Aucun champ n'est rechargé, reconstruit ni deviné.
6. **Aucun second appel Gmail** : invariant absolu du post-traitement (voir §13.4-I3).
7. **Aucun double comptage** : garanti par la machine d'état §13.4 et les règles de comptage
   §13.5.

### 13.4 Conditions d'autorisation / d'interdiction et machine d'état

**Le post-traitement est autorisé si et seulement si toutes ces conditions sont vraies :**
- C-A1 : le premier passage du même message, dans la même itération, a renvoyé exactement
  `sans_ligne_crm` (aucun autre statut n'ouvre le post-traitement) ;
- C-A2 : le `detail` Gmail du message est encore en mémoire et non modifié ;
- C-A3 : la seconde résolution CRM (lecture seule) retourne une ligne ;
- C-A4 : `peutEcrireContexte(ai_context)` autorise encore l'écriture au moment du second passage ;
- C-A5 : le plafond du passage n'est pas dépassé (le message est déjà compté une seule fois dans
  `contexte_selectionnes`, il ne consomme donc pas un second jeton) ;
- C-A6 : `direction = 'entrant'` et texte utile non vide (inchangé) ;
- C-A7 : le mode dry-run est actif (`BRANCHEMENT_CONTEXTE_DRY_RUN = true`) ou, à défaut, une
  décision DG distincte a autorisé l'écriture.

**Le post-traitement est interdit dans tous les cas suivants :**
- I1 : le premier passage a renvoyé `hors_perimetre`, `plafond_atteint`, `contexte_deja_present`,
  `refus_securise`, `traite` ou `erreur` ;
- I2 : le message a déjà fait l'objet d'un post-traitement dans la même itération
  (**une seule tentative, jamais deux**) ;
- I3 : le post-traitement exigerait un appel Gmail, un rechargement de détail, un `force`,
  un retry ou une temporisation ;
- I4 : la ligne `crm_emails` est toujours absente (le SKIP reste définitif pour ce passage) ;
- I5 : une sentinelle humaine ou la garde Q.11 s'oppose ;
- I6 : le post-traitement supposerait un `INSERT`/`UPSERT` `crm_emails` (interdit, §5-11) ;
- I7 : l'état mémoire est perdu (nouvelle itération, nouveau passage cron) — le report se fait
  alors par le mécanisme naturel du passage suivant, pas par le post-traitement.

**Machine d'état (mémoire d'itération, non persistée) :**

```text
NON_PRESENTE
   └─(conditions §3.2 OK)→ PRESENTEE ──┬─→ TRAITEE            (terminal)
                                       ├─→ IGNOREE            (terminal : contexte présent)
                                       ├─→ REFUSEE            (terminal : Q.11 / garde)
                                       ├─→ ERREUR             (terminal)
                                       └─→ EN_ATTENTE_LIGNE_CRM
                                              ├─(ligne trouvée, 1 seule tentative)→ TRAITEE_POST
                                              └─(ligne absente)→ SANS_LIGNE_CRM_DEFINITIF (terminal)
```

Invariants de la machine d'état :
- tout état terminal est **définitif pour l'itération** ;
- `EN_ATTENTE_LIGNE_CRM` est le **seul** état qui autorise une seconde tentative ;
- une seule transition sortante de `EN_ATTENTE_LIGNE_CRM` est possible par itération ;
- l'idempotence de fond reste portée par `ai_context.analyse.statut` (§6.1) : la machine d'état
  n'y substitue rien, elle évite seulement un double travail intra-itération.

### 13.5 Métriques (V1.4 — strictement additives)

| Métrique | Sémantique V1.4 | Effet du post-traitement |
| --- | --- | --- |
| `contexte_selectionnes` | messages présentés au greffon (après conditions §3.2 et plafond) | **inchangé** : incrémenté **une seule fois** au premier passage, jamais au post-traitement |
| `contexte_traites` | messages dont le Lot 2 a produit un contexte valide en mémoire | incrémenté au premier passage **ou** au post-traitement, **jamais les deux** |
| `contexte_sans_ligne_crm` | messages restés **définitivement** sans ligne `crm_emails` à la fin de l'itération | **redéfini** : n'est plus incrémenté à la détection, mais **à la clôture** de l'itération, uniquement si le post-traitement n'a pas récupéré la ligne |
| `contexte_couverture` | voir §13.6 | dénominateur inchangé |

Nouveaux compteurs additifs proposés (aucun renommage, aucun champ existant modifié) :

| Nouveau compteur | Sémantique |
| --- | --- |
| `contexte_sans_ligne_crm_initial` | nombre de messages sans ligne `crm_emails` **au premier passage** (mesure l'effet d'ordonnancement, §13.1) |
| `contexte_recuperes_post_traitement` | nombre de messages dont la ligne est apparue en cours d'itération et qui ont été traités au second passage logique |
| `contexte_post_traitements_tentes` | nombre de secondes résolutions CRM effectuées (audit du coût en lectures BDD) |

Relation d'audit obligatoire :
`contexte_sans_ligne_crm_initial = contexte_recuperes_post_traitement + contexte_sans_ligne_crm`

Ventilation `contexte_motifs` : les motifs `sans_ligne_crm_initial`,
`recupere_post_traitement` et `sans_ligne_crm_definitif` sont ajoutés ; les motifs existants
conservent leur sémantique.

### 13.6 Couverture auditable et non gonflable

Règles impératives :
1. Formule inchangée : `contexte_couverture = contexte_traites / contexte_selectionnes`.
2. Le dénominateur **ne change pas** du fait du post-traitement (C-A5 : pas de second jeton).
3. Le numérateur ne peut augmenter que d'au plus `contexte_recuperes_post_traitement`, valeur
   **publiée séparément** : toute lecture de la couverture doit être accompagnée de ce compteur.
4. Deux lectures obligatoires dans tout rapport d'audit :
   - **couverture brute** : `contexte_traites / contexte_selectionnes` ;
   - **couverture hors post-traitement** :
     `(contexte_traites − contexte_recuperes_post_traitement) / contexte_selectionnes`.
5. Le post-traitement **ne doit jamais** être présenté comme une amélioration de la qualité du
   Lot 2 : il ne corrige qu'un **effet d'ordonnancement** (§13.1).
6. La sémantique bornée de la V1.3 (§7.1, univers A–F) reste intégralement applicable : la
   couverture reste « taux de couverture du périmètre présenté au greffon ».

### 13.7 Revue des `continue` métier

Vérification documentaire de la boucle de triage général d'`executerAgents` :
- les `continue` existants (message hors périmètre, message déjà traité, détail indisponible,
  agent non applicable) sortent de l'itération **avant** le point d'insertion §3.1 ; dans ce cas
  le greffon **n'est pas appelé du tout** : ni premier passage, ni post-traitement — donc aucun
  état `EN_ATTENTE_LIGNE_CRM` ne peut rester pendant ;
- lorsqu'un `continue` survient **après** l'appel du greffon, le message est déjà dans un état
  terminal ou en `EN_ATTENTE_LIGNE_CRM` ; pour rester compatible, le post-traitement doit être
  conçu comme **la dernière étape logique du greffon lui-même** (fin d'itération du message),
  et non comme une étape métier séparée susceptible d'être court-circuitée par un `continue` ;
- conséquence de conception : **aucun `continue` métier n'est modifié**, et aucun cas ne rend le
  post-traitement structurellement impossible ; au pire il n'a pas lieu, et le compteur
  `contexte_sans_ligne_crm` reste correct.

### 13.8 Comparaison des options

| Critère | **A — Statu quo** | **B — Post-traitement** | **D — Correction documentaire seule** |
| --- | --- | --- | --- |
| Code à modifier | aucun | greffon uniquement (aucune modification métier) | aucun |
| Appels Gmail supplémentaires | 0 | **0** (detail réutilisé) | 0 |
| Lectures BDD supplémentaires | 0 | +1 `SELECT` par message en attente | 0 |
| Appels Gemini supplémentaires | 0 | 1 par message récupéré (borné par le plafond) | 0 |
| Couverture observable du pilote | faible et instable (0,40 mesuré) | nettement améliorée, auditable | inchangée |
| Risque d'écriture | nul (dry-run) | nul (dry-run) | nul |
| Risque de double traitement | nul | maîtrisé par la machine d'état §13.4 | nul |
| Complexité ajoutée | nulle | faible et localisée | nulle |
| Auditabilité des métriques | correcte mais peu informative | renforcée (3 compteurs additifs) | correcte |
| Délai d'observation utile du pilote | long (reports de passage) | court (même itération) | long |

### 13.9 Recommandation DG

**Recommandation : Option B, en dry-run strict, après validation DG de la présente V1.4.**

Justification : l'option B est la seule qui rende le pilote réellement observable sans toucher
au pipeline métier, sans appel Gmail supplémentaire et sans lever le gel des écritures. Son coût
est borné par le plafond existant (5), et son auditabilité est renforcée par la double lecture de
couverture (§13.6).

Conditions de la recommandation :
1. `BRANCHEMENT_CONTEXTE_DRY_RUN` **reste `true`** ; l'écriture `DETECTED` **reste non autorisée** ;
2. Lots 4 et 5 **restent gelés** ;
3. aucune modification de `triage_ia` / `triage_le`, des protections humaines, de Q.11, de `force`
   ou de retry ;
4. l'implémentation éventuelle fera l'objet d'une ACTION distincte, avec tests dédiés
   (double comptage, machine d'état, absence de second `lireMessage`) ;
5. la publication des métriques respectera §13.6 (couverture brute **et** hors post-traitement).

Options écartées : **A** (pilote non observable dans un délai raisonnable) ; **D** (documente le
problème sans le résoudre — acceptable seulement si la DG refuse toute évolution du greffon).

### 13.10 Statut DG à la fin de l'ACTION 55

| Thème | Statut |
| --- | --- |
| Dry-run | 🟢 AUTORISÉ (inchangé) |
| Option B (post-traitement) | 🟡 CONÇUE — implémentation **non** lancée |
| Écriture `DETECTED` | 🟠 NON AUTORISÉE |
| Lot 4 | 🔒 GELÉ |
| Lot 5 | 🔒 GELÉ |

**ACTION 55 est une correction documentaire. Aucune implémentation n'est autorisée par ce document.**
