# CD-SI-001-B — LOT 3 : MOTEUR DE CROISEMENT / RÉSOLUTION — DOSSIER DE CONCEPTION

Références : CD-SI-001-B-TECH-V1.2, CD-SI-001-B-DESIGN-V1.1 (+ erratum modèle),
Audit technique Étape 1, LOT 1 et LOT 2 validés DG.

Statut : **conception uniquement**. Aucun code, aucune migration, aucune modification
de BDD, aucun branchement Gmail. Gemini n'est pas rappelé.

---

## 0. ÉCARTS RELEVÉS ENTRE LE DÉPÔT ET LES DOCUMENTS VALIDÉS

À traiter avant le GO, sans interprétation silencieuse :

| # | Écart | Constat dans le dépôt | Conséquence Lot 3 |
|---|---|---|---|
| E1 | `prospect_id` | Aucune table `prospects`, aucune colonne `prospect_id`. Un prospect est une ligne de `public.clients` avec `statut = 'prospect'` (enum `client_statut`). | Le Lot 3 ne propose pas de `prospect_id` : il propose un `client_id_propose` accompagné du statut lu (`prospect`/`actif`/…). |
| E2 | `organisation_id` / `company_id` | Inexistants. Les entités morales sont : `compagnies` (assureurs), `fournisseurs`, `tiers`, `prescripteurs`, `client_entreprise` (personne morale rattachée à un client). | Aucune proposition d'`organisation_id`/`company_id`. `compagnie_id` est le seul identifiant d'entité morale porté par `ai_context.correspondant`. |
| E3 | `fn_match_email_sender` | Aucune occurrence dans le dépôt (fonction citée par l'audit Étape 1 mais non présente en base ni en code). | Le Lot 3 ne peut pas s'appuyer dessus. Voir §17/§18. |
| E4 | Schéma `ai_context` v1.1.0 | Les entités détectées portent **un seul** `*_id_propose` (scalaire) et `Ambiguity.candidats` est un `string[]`. | Le multi-candidat s'exprime par `statut = AMBIGUOUS`, `*_id_propose = null` et la liste des UUID candidats dans `ambiguities[].candidats`. Aucun champ « candidats scorés » n'existe : si la DG l'exige, cela impose une évolution de schéma (LOT 1 bis), hors périmètre actuel. |
| E5 | `crm_emails.status` | La colonne n'existe pas (déjà constaté au Lot 2). | Aucun statut d'email n'est écrit par le Lot 3. |
| E6 | `ai_metadata` | Absent du schéma réel. | Les métadonnées de résolution vivent dans `ai_context.analyse` / `provenance` uniquement. |

---

## 1. ARCHITECTURE DU MOTEUR DE RÉSOLUTION

Découpage identique à l'esprit du Lot 2 : une couche pure testable, une couche serveur
de lecture/persistance.

```text
crm_emails.ai_context (DETECTED)
        |
        v
[1] Collecteur de requêtes  (lecture seule, admin client, batch par entité)
        |  -> candidats bruts par entité (clients, dossiers, contrats, produits, compagnies…)
        v
[2] Moteur de preuves N1..N9 (pur)  -> score + niveau de preuve par candidat
        |
        v
[3] Arbitrage / convergence (pur)   -> unique | multiple | aucun
        |
        v
[4] Constructeur de contexte (pur)  -> PROPOSED | AMBIGUOUS | A_QUALIFIER
        |
        v
[5] Validation LOT 1 (lireContexteEmail)  -> refus si non conforme
        |
        v
[6] Persistance : UPDATE crm_emails.ai_context uniquement
```

Fichiers prévus (à créer au moment de l'implémentation, pas maintenant) :

- `src/lib/email-context-resolution.ts` — couche pure : niveaux de preuve, scoring,
  arbitrage, transitions de statut, construction du contexte PROPOSED/AMBIGUOUS.
- `src/lib/email-context-resolver.server.ts` — couche serveur : requêtes de lecture,
  orchestration, validation LOT 1, persistance `ai_context`.
- `src/lib/email-context-resolution.test.ts` — plan de tests §19.

Contraintes d'architecture :

- réutilisation du validateur et des types du LOT 1 (aucun second schéma, aucun second
  modèle TypeScript, aucune duplication Zod) ;
- aucune écriture hors `crm_emails.ai_context` ;
- aucun appel réseau externe (pas de passerelle IA) ;
- lectures groupées (`in (...)`) pour éviter le N+1, budget de requêtes borné.

---

## 2. TABLES ET COLONNES INTERROGÉES (LECTURE SEULE)

| Table | Colonnes lues | Usage |
|---|---|---|
| `crm_emails` | `id, gmail_message_id, gmail_thread_id, direction, recu_le, client_id, dossier_id, contrat_id, compagnie_id, ai_context, triage_ia, triage_le` | source du contexte + contexte de fil ; FK lues **jamais écrites** |
| `clients` | `id, reference, civilite, prenom, nom, nom_naissance, email, email2, mobile, mobile2, telephone, telephone2, date_naissance, code_postal, ville, statut, commercial_id, apporteur_id, created_at` | résolution personne physique / client / prospect |
| `client_entreprise` | `id, client_id, raison_sociale, siret` | rebond personne morale → client |
| `client_conjoint` | `id, client_id, nom, prenom, date_naissance` | rôle conjoint / co-emprunteur |
| `client_enfants` | `id, client_id, prenom, date_naissance` | rôle enfant |
| `dossiers` | `id, reference, client_id, statut, type_assurance, compagnie_id, produit_id, client_nom, client_email, client_phone, created_at, updated_at` | résolution dossier |
| `contrats` | `id, numero, client_id, dossier_id, compagnie_id, produit_id, assureur, produit, statut, date_effet, date_echeance` | résolution contrat |
| `produits` | `id, nom, code_produit, compagnie_id, famille_id, statut, reference_contrat` | résolution produit |
| `produit_familles` | `id, code, nom, branches` | normalisation de famille/branche |
| `compagnies` | `id, nom, slug, contact_email, email_reclamations, statut` | résolution compagnie / rebond compagnie |
| `fournisseurs` | `id, nom, slug, email, domaines_email, categorie, statut` | rebond fournisseur → client |
| `prescripteurs` | `id, nom, prenom, email, type, statut` | rebond partenaire → client |
| `tiers` | `id, nom, type, email, siret` | qualification d'un correspondant tiers |
| `documents` | `id, client_id, dossier_id, contrat_id, file_name, type_document, classification_ia` | rapprochement `documents_associes` |
| `recommandations_prescripteur` | `id, prescripteur_id, client_id` | rebond partenaire → client |

Aucune autre table n'est interrogée. Aucune table n'est écrite.

---

## 3. ORDRE DE RÉSOLUTION DES PREUVES N1 → N9

Ordre strictement décroissant de force ; le premier niveau qui produit **un seul**
candidat gagne. Un niveau plus faible ne peut jamais annuler un niveau plus fort ; il
peut seulement produire une contradiction (§9).

| Niveau | Preuve | Exemple | Poids | Décision maximale atteignable |
|---|---|---|---|---|
| **N1** | Identifiant technique explicite et vérifié en base (référence unique : `clients.reference`, `dossiers.reference`, `contrats.numero`) | « dossier EJ-2026-EMPRUNTEUR-0012 » | 0.98 | PROPOSED |
| **N2** | Référence externe unique vérifiée (numéro de police + compagnie concordante) | « police POL-441122 chez Néoliane » | 0.95 | PROPOSED |
| **N3** | Email exact d'un enregistrement unique (`clients.email/email2`, `dossiers.client_email`) | expéditeur = email client | 0.92 | PROPOSED |
| **N4** | Fil de discussion : `gmail_thread_id` déjà rattaché **et validé humainement** sur un email antérieur | réponse dans un fil qualifié | 0.85 | PROPOSED |
| **N5** | Téléphone normalisé exact + nom concordant | mobile identique | 0.80 | PROPOSED si unique |
| **N6** | Nom + prénom exacts + un discriminant (date de naissance, code postal, ville) | homonyme lever par CP | 0.75 | PROPOSED si unique |
| **N7** | Domaine d'email d'entité morale (`compagnies`, `fournisseurs.domaines_email`) | @neoliane.fr | 0.70 | PROPOSED pour compagnie/fournisseur **uniquement** |
| **N8** | Correspondance approchée (nom seul, raison sociale seule, libellé produit) | « Dupont » | 0.50 | AMBIGUOUS |
| **N9** | Facteur contextuel non probant : dossier unique actif, contrat unique actif, ancienneté, dernier échange | un seul dossier ouvert | 0.20 | jamais décisif seul — voir §7 |

Règle de cumul : le score final d'un candidat est le maximum des niveaux atteints,
majoré au plus de +0.05 par niveau de confirmation indépendant, plafonné à 0.98.
Aucun cumul ne permet d'atteindre 1.0 ni le statut CONFIRMED.

---

## 4. RÈGLES PAR ENTITÉ

### 4.1 Client (personne physique)
1. N1 `clients.reference` citée → candidat unique → PROPOSED.
2. N3 email exact (`email`, `email2`) → unique → PROPOSED.
3. N5 téléphone normalisé (E.164, suppression espaces/points, `0X` → `+33X`).
4. N6 nom+prénom + discriminant.
5. Si plusieurs candidats à niveau égal → AMBIGUOUS + `ambiguities[type=client_multiple]`.
6. Si aucun candidat → aucune proposition, `personnes_detectees[].statut` reste `DETECTED`,
   l'analyse globale peut devenir `A_QUALIFIER` (§10).

### 4.2 Prospect
Voir écart E1 : un prospect est un `clients` avec `statut='prospect'`. Mêmes règles que
4.1. Le statut lu est reporté en clair dans `provenance.champ`
(ex. `clients.statut=prospect`). **Aucune création de prospect** (§15).

### 4.3 Organisation
Voir écart E2 : notion non matérialisée. Le Lot 3 résout à la place :
- `client_entreprise.siret` / `raison_sociale` → rebond vers `client_id` (N1 si SIRET, N6 sinon) ;
- `fournisseurs` / `tiers` / `prescripteurs` → qualification du correspondant uniquement
  (`correspondant.role_suppose`), sans identifiant porté par le schéma v1.1.0.

### 4.4 Compagnie
1. N1/N2 : `compagnies.slug` ou nom exact cité, ou compagnie déduite d'un contrat résolu.
2. N3 : `contact_email` / `email_reclamations` exact.
3. N7 : domaine de l'expéditeur mappé à une compagnie unique.
4. Multi-candidats → AMBIGUOUS. `correspondant.compagnie_id` reste `null` dans ce cas.

### 4.5 Dossier
1. N1 `dossiers.reference`.
2. N2 dossier porté par un contrat résolu en N1/N2.
3. N4 fil qualifié.
4. Sinon, restriction aux dossiers du client proposé :
   - un seul dossier **et** un autre niveau ≥ N5 concordant (branche/produit cité) → PROPOSED ;
   - un seul dossier sans autre concordance → **N9 seulement** → AMBIGUOUS (§7) ;
   - plusieurs dossiers → AMBIGUOUS + `dossier_multiple`.
5. Un dossier n'est jamais proposé sans client proposé ou identifié en N1/N2.

### 4.6 Contrat
1. N1/N2 `contrats.numero` (normalisé : trim, majuscules, suppression des séparateurs)
   + cohérence compagnie si citée.
2. Numéro identique sur plusieurs compagnies → AMBIGUOUS + `contrat_multiple`.
3. Sans numéro : restriction aux contrats du client/dossier proposé ; un seul contrat actif
   est un facteur N9 → AMBIGUOUS, jamais PROPOSED seul.

### 4.7 Produit
1. `produits.code_produit` ou `reference_contrat` exact → N2.
2. `produits.nom` exact (insensible à la casse/accents) + compagnie cohérente → N6.
3. Libellé approchant ou famille seule (`produit_familles.code/branches`) → N8 → AMBIGUOUS,
   `produit_id_propose = null`, `famille` renseignée en texte.

---

## 5. GESTION DES REBONDS

| Rebond | Chemin de lecture | Niveau maximal | Résultat |
|---|---|---|---|
| Partenaire → client | `prescripteurs.email` → `recommandations_prescripteur.prescripteur_id` → `client_id` ; ou `clients.apporteur_id` | N7 pour le partenaire, puis le client doit être confirmé par une preuve propre ≥ N5 citée dans l'email | Sans preuve propre : AMBIGUOUS (liste des clients du partenaire en `candidats`, plafonnée à 20) |
| Fournisseur → client | `fournisseurs.domaines_email`/`email` → puis référence citée dans le corps | N7 pour le fournisseur ; le client exige N1/N2/N3 | Jamais de client proposé sur le seul fournisseur |
| Compagnie → contrat → client | `compagnies` (N1/N7) + `contrats.numero` cité (N1/N2) → `contrats.client_id` et `contrats.dossier_id` | Hérite du niveau du contrat (N1/N2) | PROPOSED en cascade, provenance `regle_deterministe`, chaîne de rebond décrite dans `provenance.champ` (ex. `rebond:compagnie>contrat>client`) |

Règle générale : un rebond ne crée jamais de preuve plus forte que son maillon le plus faible.

---

## 6. HOMONYMES ET MULTI-CANDIDATS

- Normalisation avant comparaison : minuscules, suppression des accents et de la
  ponctuation, espaces réduits ; `nom_naissance` testé en plus de `nom`.
- Discriminants admis pour lever un homonyme : date de naissance, code postal, ville,
  email, téléphone, référence dossier/contrat citée.
- Aucun discriminant → AMBIGUOUS, `*_id_propose = null`,
  `ambiguities[].candidats` = UUID des candidats (ordre de score décroissant, **max 10**),
  `resolution_requise = true`.
- Le nombre de candidats et le motif sont exposés dans `ambiguities[].description`.
- Aucun tirage au sort, aucun « premier trouvé », aucune préférence par ancienneté.

---

## 7. DOSSIER UNIQUE ACTIF

- Le dossier unique actif est **exclusivement un facteur contextuel de niveau N9**.
- Interdiction formelle de le promouvoir en N1, N2 ou N3, et interdiction d'en dériver
  un `dossier_id_propose` sans preuve indépendante ≥ N5.
- Effet autorisé : majoration de score bornée (+0.05) d'un candidat déjà porté par une
  autre preuve, et ordonnancement des `candidats` d'une ambiguïté.
- Le test T-07 (§19) verrouille cette règle : un email sans référence, avec un client à
  dossier unique, doit produire AMBIGUOUS et non PROPOSED.

---

## 8. MULTI-CONTRAT

- Chaque contrat cité produit une entrée distincte dans `contrats_detectes`, résolue
  indépendamment. Un email peut donc contenir simultanément un contrat PROPOSED et un
  contrat AMBIGUOUS.
- Plusieurs contrats résolus sur des clients différents → contradiction (§9) :
  aucun `client_id_propose` global, `donnees_contradictoires`.
- Plusieurs contrats du même client → PROPOSED pour chacun ; le dossier n'est proposé que
  s'ils convergent vers un unique `dossier_id`.

---

## 9. CONTRADICTIONS

Détection systématique avant construction du contexte :

1. deux preuves de niveau ≥ N3 pointant vers des clients différents ;
2. contrat résolu dont `client_id` diffère du client résolu par email ;
3. dossier résolu dont `client_id` diffère du client résolu ;
4. compagnie citée incompatible avec la compagnie du contrat résolu ;
5. produit cité incompatible avec la compagnie résolue.

Traitement : les entités concernées passent en AMBIGUOUS, `*_id_propose = null`, ajout
d'une ambiguïté `donnees_contradictoires` décrivant les deux preuves opposées, et
`analyse.statut = AMBIGUOUS`. Aucune contradiction n'est arbitrée automatiquement.

---

## 10. TRANSITIONS DE STATUT

Par entité :

| Condition | Statut entité |
|---|---|
| candidat unique, niveau ≥ N5, aucune contradiction | `PROPOSED` |
| plusieurs candidats, ou N8/N9 seul, ou contradiction | `AMBIGUOUS` |
| aucun candidat en base | reste `DETECTED` |

Statut global `analyse.statut` :

- `PROPOSED` — au moins une entité PROPOSED et aucune AMBIGUOUS bloquante ;
- `AMBIGUOUS` — au moins une ambiguïté ou contradiction ;
- `A_QUALIFIER` — aucune entité résolue, ou contexte d'entrée déjà `A_QUALIFIER`
  (échec Lot 2), ou erreur de résolution (§16) ;
- `CONFIRMED` — **jamais produit par le Lot 3** ;
- `validation_humaine_requise` reste `true` dans tous les cas.

Entrée obligatoire : `analyse.statut = DETECTED`. Tout autre statut en entrée
(`PROPOSED`, `AMBIGUOUS`, `CONFIRMED`, validation humaine présente) est ignoré (§13).

---

## 11. STRUCTURE DES DONNÉES PROPOSÉES DANS `ai_context`

Aucun nouveau champ. Le Lot 3 renseigne uniquement, dans le schéma v1.1.0 :

- `correspondant.client_id`, `correspondant.compagnie_id`, `correspondant.role_suppose`,
  `correspondant.statut`, `correspondant.confiance`, `correspondant.provenance` ;
- `personnes_detectees[].client_id_propose`, `.statut`, `.confiance`, `.provenance` ;
- `dossiers_detectes[].dossier_id_propose`, `.branche`, `.statut`, `.confiance`, `.provenance` ;
- `contrats_detectes[].contrat_id_propose`, `.statut`, `.confiance`, `.provenance` ;
- `produits_cites[].produit_id_propose`, `.statut`, `.confiance`, `.provenance` ;
- `documents_associes[].document_id_propose`, `.statut`, `.confiance`, `.provenance` ;
- `preuves[]` — ajout de preuves de type `reference_explicite`, `email_expediteur`,
  `thread`, `autre`, avec identifiants préfixés `r1, r2…` (les preuves Gemini `g*` sont
  conservées intactes) ;
- `ambiguities[]` — ajout uniquement (les ambiguïtés du Lot 2 sont conservées) ;
- `analyse.statut`, `.confiance_globale`, `.analyse_le`, `.provenance`,
  `.modifications_apportees` (trace textuelle des champs renseignés par le Lot 3).

Les textes extraits par Gemini (`nom`, `prenom`, `numero_police`, `reference_citee`,
`libelle`…) ne sont jamais réécrits. `schema_version` reste `1.1.0`.

---

## 12. PROVENANCE DES PROPOSITIONS

Chaque valeur écrite par le Lot 3 porte :

```json
{
  "source": "regle_deterministe",
  "champ": "N1:dossiers.reference",
  "modele": null,
  "detecte_le": "<ISO 8601>",
  "preuve_ids": ["g3", "r2"]
}
```

- `source` = `regle_deterministe` systématiquement (jamais `gemini`, jamais `humain`) ;
- `champ` = `N<niveau>:<table>.<colonne>` ou `rebond:<chaîne>` — traçabilité exigée ;
- `preuve_ids` relie la proposition aux preuves Gemini d'origine et aux preuves de
  résolution ajoutées.

---

## 13. IDEMPOTENCE

Garde de traitement, avant toute écriture (réutilisation et extension de la garde
existante du Lot 2, sans modification de son comportement actuel) :

1. `analyse.validated_at` / `validated_by` renseignés → **abandon** (validation humaine) ;
2. `analyse.provenance.source = 'humain'` → abandon ;
3. `analyse.statut = 'CONFIRMED'` → abandon ;
4. `analyse.statut` ∈ {`PROPOSED`, `AMBIGUOUS`} → abandon sauf `force` explicite ;
5. `analyse.statut = 'DETECTED'` → résolution autorisée.

Déterminisme : à données CRM constantes, deux exécutions produisent un `ai_context`
identique hors `analyse.analyse_le` et `detecte_le`. Aucune ligne dupliquée : entités et
preuves sont dédupliquées par clé naturelle (UUID proposé, ou couple type+extrait).

---

## 14. AUCUNE ÉCRITURE DE FK MAÎTRESSE

Le Lot 3 exécute exactement un `UPDATE crm_emails SET ai_context = $1 WHERE id = $2`.
Interdits explicites, vérifiés par revue et par test T-12 : `crm_emails.client_id`,
`dossier_id`, `contrat_id`, `compagnie_id`, ainsi que toute écriture dans `clients`,
`dossiers`, `contrats`, `produits`, `documents`, `taches`, `activites`.
Les propositions vivent uniquement dans les champs `*_id_propose` et
`correspondant.client_id` / `correspondant.compagnie_id` du JSON.

---

## 15. AUCUNE CRÉATION DE PROSPECT

Aucun `INSERT`, `UPSERT` ni `RPC` mutant. Un correspondant inconnu produit
`role_suppose = 'inconnu'`, une ambiguïté `personne_inconnue` et
`analyse.statut = 'A_QUALIFIER'`. La création éventuelle relève du LOT 6.

---

## 16. ERREURS ET CAS LIMITES

| Cas | Traitement |
|---|---|
| `ai_context` vide ou `{}` | aucune résolution, aucune écriture, sortie `ignore:contexte_vide` |
| Contexte non conforme au schéma LOT 1 | abandon avant écriture, log serveur |
| Contexte `A_QUALIFIER` (échec Lot 2) | non traité, conservé tel quel |
| Erreur de lecture base | aucune écriture partielle ; l'email reste `DETECTED` et sera repris |
| Volumétrie : > 200 candidats sur un critère | critère jugé non discriminant, ignoré (N8 max), ambiguïté `autre` |
| Référence citée introuvable en base | preuve non retenue ; ambiguïté `autre` mentionnant la référence orpheline |
| Email interne (domaine du cabinet) | `role_suppose = 'interne'`, résolution du corps uniquement |
| Email sortant (`direction='sortant'`) | résolution sur les destinataires cités, pas sur l'expéditeur |
| Contexte trop volumineux (> 200 Ko) | troncature des `candidats` et des extraits, ambiguïté `autre` |
| Contradiction | §9 |

Aucun cas d'erreur ne produit de FK, de CONFIRMED, de tâche ni de création d'entité.

---

## 17. IMPACT SUR LES RPC EXISTANTES

Aucun. Le Lot 3 n'appelle et ne modifie aucune fonction existante ; en particulier :
`can_access_client`, `can_access_dossier`, `can_access_contrat`, `has_role`,
`log_audit`, `generer_reference`, ainsi que tous les triggers métier
(`trg_dossier_lier_client`, `trg_verrouiller_contrat_actif`, `trg_garde_fou_pipeline_documents`…)
restent inchangés. Aucun trigger n'est déclenché puisque seule la colonne `ai_context`
de `crm_emails` est mise à jour. Écart E3 : `fn_match_email_sender` n'existe pas ; sa
logique supposée est réimplémentée en TypeScript pur (niveaux N3/N5/N7), sans création
de fonction SQL.

---

## 18. BESOIN DE NOUVELLES RPC / FONCTIONS SERVEUR

- **Aucune nouvelle RPC SQL n'est nécessaire** pour la V1 du Lot 3 : les lectures se font
  par `select ... in (...)` sur les tables du §2, via le client serveur privilégié, en
  lecture seule.
- Option de performance différée (hors périmètre, à arbitrer après mesure) : une fonction
  `security definer` en lecture seule de recherche multi-critères de clients. Elle
  impliquerait une migration et n'est donc **pas** retenue à ce stade.
- Aucune fonction serveur exposée au client ; le moteur n'est appelé que côté serveur.

---

## 19. PLAN DE TESTS EXHAUSTIF

Tests unitaires purs (données CRM simulées) + tests d'intégration de la couche serveur
avec lectures injectées. Aucun appel réseau.

| # | Test | Attendu |
|---|---|---|
| T-01 | Référence dossier N1 valide | `dossier_id_propose` renseigné, statut `PROPOSED` |
| T-02 | Numéro de police N2 + compagnie | `contrat_id_propose` renseigné, `PROPOSED` |
| T-03 | Email expéditeur exact unique | `correspondant.client_id`, `PROPOSED` |
| T-04 | Email exact sur 2 clients | `AMBIGUOUS`, `client_multiple`, id `null` |
| T-05 | Homonyme sans discriminant | `AMBIGUOUS`, candidats listés |
| T-06 | Homonyme lever par date de naissance | `PROPOSED` |
| T-07 | Dossier unique actif sans référence | `AMBIGUOUS` — jamais `PROPOSED` |
| T-08 | Dossier unique actif + branche concordante | `PROPOSED` |
| T-09 | Multi-contrats même client | plusieurs `PROPOSED`, dossier `AMBIGUOUS` si divergent |
| T-10 | Multi-contrats clients différents | `donnees_contradictoires` |
| T-11 | Contrat dont le client contredit l'email | `AMBIGUOUS`, aucune FK |
| T-12 | Aucune FK maîtresse écrite | un seul `update` de `ai_context` |
| T-13 | Aucun `insert`/`delete`/`rpc` | zéro appel mutant |
| T-14 | Aucun prospect créé | table `clients` inchangée |
| T-15 | Jamais `CONFIRMED` | absent de toutes les sorties |
| T-16 | Idempotence : 2 exécutions | contexte identique hors horodatage |
| T-17 | Contexte déjà `PROPOSED` | non retraité sans `force` |
| T-18 | Validation humaine présente | non retraité même avec `force` |
| T-19 | Contexte `A_QUALIFIER` | non traité |
| T-20 | Contexte `{}` / vide | aucune écriture |
| T-21 | Rebond compagnie → contrat → client | `PROPOSED` avec `provenance.champ` de rebond |
| T-22 | Rebond partenaire sans preuve propre | `AMBIGUOUS` |
| T-23 | Rebond fournisseur sans référence | aucun client proposé |
| T-24 | Produit cité par famille seule | `AMBIGUOUS`, `produit_id_propose = null` |
| T-25 | Référence citée orpheline | ambiguïté `autre`, aucune proposition |
| T-26 | > 200 candidats | critère ignoré, ambiguïté `autre` |
| T-27 | Erreur de lecture base | aucune écriture, statut inchangé |
| T-28 | Contexte final validé par le schéma LOT 1 | `lireContexteEmail` renvoie un contexte valide |
| T-29 | Preuves Gemini `g*` préservées | présentes en sortie |
| T-30 | Non-régression `triage_ia` / `triage_le` | valeurs inchangées |

Les 21 tests des Lots 1 et 2 doivent rester verts (total attendu ≥ 51).

---

## 20. MATRICE GO / NO-GO DU LOT 3

| Critère | Exigence | GO si |
|---|---|---|
| C1 | Aucune écriture hors `crm_emails.ai_context` | vérifié par revue + T-12/T-13 |
| C2 | Aucune FK maîtresse écrite | T-12 vert |
| C3 | Aucune création de prospect/contrat/produit/tâche | T-14 vert |
| C4 | Aucun `CONFIRMED` produit | T-15 vert |
| C5 | Validation LOT 1 systématique avant écriture | T-28 vert |
| C6 | Aucun second schéma ni second modèle TS | revue de code |
| C7 | Dossier unique actif limité à N9 | T-07 vert |
| C8 | Idempotence et protection humaine | T-16/T-17/T-18 verts |
| C9 | Aucune migration, aucun changement de BDD | diff SQL vide |
| C10 | Aucun appel à Gemini | aucune référence à la passerelle IA |
| C11 | Aucun branchement Gmail | aucun point d'appel dans le pipeline |
| C12 | Traçabilité de provenance sur 100 % des propositions | revue + tests |
| C13 | Écarts E1 → E6 arbitrés par la DG | décision écrite |
| C14 | Non-régression Lots 1 et 2 | 21/21 verts |

NO-GO si l'un des critères C1 à C12 échoue, ou si les écarts E1/E2/E4 ne sont pas
arbitrés (ils déterminent la sémantique de `prospect_id`, `organisation_id` et la
représentation des multi-candidats).

---

🟡 LOT 3 — DOSSIER DE CONCEPTION PRÊT POUR AUDIT
