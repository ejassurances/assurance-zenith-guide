# CD-SI-001-B — LOT 3 — CORRECTIF Q.11 : PROTECTION DES SENTINELLES HUMAINES
## DESIGN V1.2 — DOCUMENT DE CONCEPTION (AUCUN CODE)

Version : V1.2. Remplace fonctionnellement la V1.1 (conservée, non supprimée).
Objet de la révision : lever l'écart **M-1** identifié lors de l'**AUDIT DG FINAL — ACTION 23**
sur le prédicat `analyse.statut` lorsque ce champ est absent de `ai_context`.

Aucune doctrine existante n'est modifiée : N1→N9 inchangés, aucun nouveau niveau,
aucun scoring, `schema_version = "1.1.0"`, aucun nouveau champ JSON, aucune FK écrite
par Q.11, aucun INSERT / UPSERT / DELETE / RPC, aucun Gemini, aucun Gmail,
aucun changement Lot 1, Lot 2, Lot 3 de production, Lot 4.

Statut : conception uniquement. Aucun code, aucune migration, aucune modification BDD,
aucun test ajouté, aucun Lot 4 modifié, aucun branchement Lot 3 → Lot 4, aucun Gmail,
aucun Lot 5. Le gel du branchement Lot 3 → Lot 4 est maintenu.

---

## A. MAJEUR À LEVER — M-1

### A.1 Constat de l'audit ACTION 23

La garde `composerGardeQ11` produisait, dans le design V1.1, un prédicat systématique
sur `ai_context->analyse->>statut` de la forme :

```text
.filter("ai_context->analyse->>statut", "eq", <statut observé ou "">)
```

Lorsque `analyse.statut` est **absent** de l'état observé, cette formulation compare
le chemin JSON à une chaîne vide (`""`).

Or :

- le JSON Schema 1.1.0 ne rend pas `analyse.statut` obligatoire ;
- le Lot 3 amont (`peutCroiserContexte`) traite l'absence de statut comme un état
  compatible avec `DETECTED` (contexte frais issu du Lot 2, non encore qualifié) ;
- PostgREST évalue `ai_context->analyse->>statut` à `NULL` SQL lorsque le champ est
  absent.

La comparaison `eq.""` ne matche donc pas le `NULL` SQL réel et provoquerait un
**faux refus** (`garde_optimiste`) sur un état parfaitement valide et inchangé.

### A.2 Impact

Sans correction documentaire :

- un email fraîchement extrait par le Lot 2 (`ai_context` valide, `analyse.statut` absent)
  ne pourrait pas être résolu par le Lot 3 en l'absence de concurrence ;
- la garde deviendrait plus restrictive que la réalité de l'état observé ;
- cela contredirait le principe de défense en profondeur : un prédicat secondaire ne
  doit jamais être plus restrictif que le prédicat principal (`ai_context` complet).

---

## B. ARBITRAGE DG RETENU POUR M-1

### B.1 Principe

Conserver la défense en profondeur sur `analyse.statut`, mais la rendre
**explicitement NULL-SAFE**.

### B.2 Règle normative

```text
SI analyse.statut EST PRÉSENT dans l'état observé :
    la garde compare exactement la valeur observée
    (prédicat PostgREST : eq.<valeur>)

SI analyse.statut EST ABSENT de l'état observé :
    la garde vérifie l'ABSENCE du statut
    (prédicat PostgREST : is.null)
    et NE COMPARE PAS à une chaîne vide.
```

### B.3 Interdictions explicites

- `eq.""` (chaîne vide) est interdit ;
- aucune valeur par défaut artificielle (`DETECTED`, `A_QUALIFIER`, etc.) n'est injectée ;
- aucune promotion implicite vers `DETECTED` dans le JSON ;
- aucune écriture d'un nouveau champ `analyse.statut` par le Lot 3 ;
- aucune modification du JSON Schema 1.1.0.

### B.4 Sémantique de « statut absent »

```text
« statut absent » = état observé absent
```

et non :

```text
« statut absent » → écriture de DETECTED
```

Le Lot 3 n'a pas à normaliser le contexte. Sa mission est de protéger l'état réel
tel qu'il est lu, pas de le transformer.

---

## C. COHÉRENCE AVEC LE SCHÉMA JSON 1.1.0

- `schema_version` reste `"1.1.0"` ;
- `analyse.statut` reste optionnel dans le schéma (propriété de `analyse`, non requise) ;
- aucun champ JSON nouveau n'est créé ;
- aucune évolution du fichier `src/lib/schemas/email-context-v1.2.json` ;
- aucune normalisation destructive du contexte (pas de suppression/ajout de clés
  pour faire plaisir à la garde).

---

## D. COHÉRENCE AVEC LE LOT 3 AMONT

La fonction `peutCroiserContexte` considère l'absence de `analyse.statut` comme un
état traitable (contexte `DETECTED` implicite, sans validation humaine, sans provenance
`humain`).

La garde Q.11 doit protéger cet état réel sans le transformer artificiellement.

---

## E. COHÉRENCE AVEC LA GARDE COMPLÈTE

Le prédicat principal reste l'égalité de `ai_context` complet (objet JSON tel que lu).

Le prédicat `analyse.statut` est une **défense en profondeur** supplémentaire.

Il ne doit jamais être **plus restrictif** que l'état réellement observé : s'il
refuse là où le prédicat principal aurait accepté, il perd son rôle de défense et
introduit une régression fonctionnelle.

---

## F. GARDE OPTIMISTE CORRIGÉE

### F.1 État observé (inchangé)

| # | Élément observé | Source |
|---|---|---|
| 1 | `ai_context` complet | `crm_emails.ai_context` |
| 2 | `ai_context->analyse->>statut` | dérivé, **NULL-SAFE** |
| 3 | `ai_context->analyse->>validated_by` | dérivé (sentinelle) |
| 4 | `ai_context->analyse->>validated_at` | dérivé (sentinelle) |
| 5 | `ai_context->analyse->provenance->>source` | dérivé (sentinelle) |
| 6 | `updated_at` | `crm_emails.updated_at` |

### F.2 Prédicats PostgREST cibles (V1.2 corrigée)

```text
update({ ai_context: <nouveau> })
  .eq("id", emailId)
  .filter("ai_context", "eq", JSON.stringify(<ai_context observé>))
  .filter("ai_context->analyse->>statut", <"eq" | "is">, <valeur | null>)
  .filter("ai_context->analyse->>validated_by", <"eq" | "is">, <valeur | null>)
  .filter("ai_context->analyse->>validated_at", <"eq" | "is">, <valeur | null>)
  .filter("ai_context->analyse->provenance->>source", <"eq" | "is">, <valeur | null>)
  .filter("updated_at", "eq", <updated_at observé — chaîne brute, R-UA-1>)
  .select("id")
```

Pour le prédicat `statut` :

- si `analyse.statut` est présent → `eq.<valeur>` ;
- si `analyse.statut` est absent → `is.null` ;
- jamais `eq.""`.

### F.3 Comportement (inchangé)

- 1 ligne affectée → succès ;
- 0 ligne affectée → refus `garde_optimiste` ;
- erreur BDD → refus `erreur_base` ;
- > 1 ligne → traité comme refus `garde_optimiste` (anomalie).

### F.4 `updated_at` — inchangé (R-UA-1 / R-UA-2 / R-UA-3)

Transmission opaque, échec sûr, garde combinée. Voir V1.1 F.5.

### F.5 Prérequis expérimental F.5.5 — non exécuté

Le prérequis P-1 à P-5 reste documenté mais **non exécuté** dans cette action.
Aucune base de test, aucune requête PostgREST réelle n'est lancée.

---

## G. PRÉSERVATION DES SENTINELLES HUMAINES

Inchangée par rapport à la V1.1 : Option B reste une défense en profondeur.
Les sentinelles (`validated_by`, `validated_at`, `provenance.source = "humain"`,
`statut = CONFIRMED`) sont protégées.

`force` ne franchit jamais une sentinelle humaine.

---

## H. INTERFACES ET SÉQUENCE

Inchangées par rapport à la V1.1.

Signature cible :

```text
ecrireAiContext({ emailId, observe, contexte }) -> { lignesAffectees, erreur }
```

`observe` reste l'unique état observé.

---

## I. TESTS DE RECETTE À PRÉVOIR (documentaires — non écrits)

Les scénarios Q11-01 à Q11-22 de la V1.1 sont conservés tels quels.
Les scénarios suivants sont **ajoutés** pour couvrir M-1 :

| ID | Scénario | Attendu |
|---|---|---|
| **Q11-23** | `analyse.statut` présent dans T0 → égalité exacte → état inchangé | garde admissible, 1 ligne affectée |
| **Q11-24** | `analyse.statut` absent dans T0 → garde vérifie l'absence (`is.null`) et ne compare pas à `''` | aucune erreur de comparaison à chaîne vide, 1 ligne affectée |
| **Q11-25** | `analyse.statut` absent à T0 puis ajouté avant T2 | conflit détecté → refus `garde_optimiste`, 0 ligne affectée |
| **Q11-26** | `analyse.statut` présent à T0 puis supprimé avant T2 | conflit détecté → refus `garde_optimiste`, 0 ligne affectée |
| **Q11-27** | `analyse.statut` absent + autres sentinelles inchangées + `updated_at` inchangé | pas de faux refus, 1 ligne affectée |

Ces scénarios restent **strictement documentaires** : aucun fichier de test n'est
créé dans cette action.

---

## J. NON-RÉGRESSION

Inchangée par rapport à la V1.1 :

- `schema_version` `"1.1.0"` ;
- JSON Schema inchangé ;
- aucun nouveau champ JSON ;
- doctrine N1–N9 inchangée ;
- Lot 1, Lot 2, Lot 3, Lot 4 non modifiés ;
- aucun changement BDD ;
- motifs de refus existants conservés (ajout additif uniquement).

---

## K. ÉTANCHÉITÉ

Inchangée par rapport à la V1.1 :

- aucune FK écrite ;
- aucun `insert`, `upsert`, `delete`, RPC mutante ;
- aucune création d'entité ;
- aucun appel Gemini / Gmail ;
- aucun branchement production ;
- aucune modification de `triage_ia` / `triage_le`.

---

## L. GO / NO-GO

- **M-1 levé** au niveau documentaire par la règle NULL-SAFE sur `analyse.statut` ;
- **Code non encore corrigé** : cette action est strictement documentaire ;
- **Aucun GO de développement supplémentaire** n'est déclaré ;
- La V1.2 doit être soumise à un **audit DG** avant toute implémentation ;
- Le gel du branchement Lot 3 → Lot 4 est maintenu.

---

## M. ÉCARTS CLASSÉS

| ID | Statut | Objet | Traitement |
|---|---|---|---|
| M-1 | 🟢 Levé | Prédicat `analyse.statut` incompatible avec l'absence de champ | Règle NULL-SAFE : `eq.<valeur>` si présent, `is.null` si absent |
| m-r1 | 🟡 Mineur | Prérequis expérimental F.5.5 non exécuté | Conservé comme étape ultérieure, post-audit DG V1.2 |

---

## RAPPORT FINAL — ACTION 24

**A. Fichier créé**
- `docs/CD-SI-001-B-LOT3-Q11-DESIGN-V1.2.md`

**B. Sections modifiées par rapport à V1.1**
- F.2 : prédicats PostgREST cibles rendus NULL-SAFE pour `analyse.statut` ;
- I. Tests de recette : ajout des scénarios Q11-23 à Q11-27.

**C. Traitement exact de M-1**
- Le prédicat sur `ai_context->analyse->>statut` est désormais conditionnel :
  - présent → `eq.<valeur>` ;
  - absent → `is.null` ;
- `eq.""` est explicitement interdit.

**D. Règle NULL-SAFE retenue**
- La garde vérifie l'état **tel qu'il est observé**, sans normalisation artificielle.

**E. Scénarios Q11-23 → Q11-27**
- Q11-23 : statut présent, égalité exacte ;
- Q11-24 : statut absent, vérification d'absence, pas de comparaison à `''` ;
- Q11-25 : statut absent T0 puis ajouté → conflit ;
- Q11-26 : statut présent T0 puis supprimé → conflit ;
- Q11-27 : absence de statut + sentinelles inchangées → pas de faux refus.

**F. Invariants préservés**
- `schema_version = "1.1.0"` ;
- aucun champ JSON nouveau ;
- aucune FK écrite par Q.11 ;
- une seule mutation autorisée (`UPDATE public.crm_emails SET ai_context = ...`) ;
- transmission opaque de `updated_at` (R-UA-1) ;
- Option B / protection des sentinelles humaines ;
- `force` ne franchit jamais une sentinelle humaine.

**G. Fichiers non touchés**
- Tous les fichiers TS/TSX (Lot 1, Lot 2, Lot 3, Lot 4) ;
- tous les fichiers de test ;
- toutes les migrations ;
- la base de données et ses données ;
- le JSON Schema ;
- Gmail ;
- CD-SI-002 (Lots 2A/2B/2C/2D).

**H. État de l'expérimentation F.5.5**
- Non exécutée dans cette action ;
- Conservée comme prérequis documentaire P-1 → P-5 pour une étape ultérieure.

**I. État du gel**
- Branchement Lot 3 → Lot 4 : gel maintenu ;
- Lot 5 : non ouvert ;
- Implémentation code : non autorisée dans cette action.

---

🟡 **DESIGN Q.11 V1.2 — PRÊT POUR AUDIT DG**
