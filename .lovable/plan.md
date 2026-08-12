# Pipeline projet (dossier) — de la lettre de mission au contrat actif

Le développement précédent (« générer une lettre de mission ») est mis en pause : la lettre de mission devient la première étape d'un pipeline plus large porté par le dossier.

## Principe

Le dossier porte un **statut de pipeline** unique qui avance étape par étape. Chaque étape définit :
- qui la voit (client / staff seulement),
- qui peut la faire avancer,
- quels documents et traces elle produit.

Les documents produits (lettre de mission, devoir de conseil, contrat) s'affichent dans l'onglet **Projet** du dossier, côté back-office comme côté espace client. L'onglet **Conformité** reste strictement réservé au KYC et au LCB-FT.

## Les étapes

```text
1  lettre_mission_a_signer        client : voit + signe
2  lettre_mission_signee          document signé visible dans le projet
3  devis_en_cours                 STAFF UNIQUEMENT — création des devis
4  conseil_prerempli              STAFF UNIQUEMENT — pré-remplissage
5  conseil_valide_staff           STAFF UNIQUEMENT — validé avant envoi
6  conseil_a_signer               client : voit + signe / refuse / demande modif
7a conseil_signe                  -> étape 8
7b conseil_refuse                 fin de parcours (ou reprise manuelle)
7c conseil_modif_demandee         retour possible à l'étape 4
8  souscription_envoyee           lien de souscription envoyé par mail, trace visible
9  en_traitement_assureur         suivi des demandes de l'assureur
10 contrat_valide                 bouton d'accès direct au contrat
11 contrat_actif                  entrée en vigueur réelle
```

Les statuts terminaux hors parcours restent disponibles : `perdu` / `abandonne`.

### Visibilité

| Étape | Client | Staff |
|---|---|---|
| 1, 2 | oui | oui |
| 3, 4, 5 | **non** (le client voit « étude en cours ») | oui |
| 6, 7a/b/c | oui | oui |
| 8, 9 | oui (trace d'envoi + « en traitement ») | oui + détail assureur |
| 10, 11 | oui + accès contrat | oui |

Le client ne voit jamais les étapes 3 à 5 : son espace affiche un libellé neutre « Étude en cours par votre conseiller ». Cette masquage est appliqué en base (politique de lecture) et pas seulement dans l'interface.

### Transitions

Chaque avancement est validé côté serveur : une transition n'est acceptée que si elle part du statut attendu, si l'auteur a le rôle requis, et si les prérequis sont remplis (lettre signée avant devis, devoir de conseil validé avant envoi au client, etc.). Toute transition est journalisée.

## Modélisation

### Statut du dossier
Le type actuel `dossier_statut` (nouveau / en_cours / signe / perdu) est trop pauvre. On ajoute les valeurs du pipeline ci-dessus à l'énumération, et on conserve les anciennes valeurs pour les dossiers existants, en les rattachant au pipeline (`nouveau` → étape 1, `signe` → `contrat_valide`).

### Historique du pipeline
Nouvelle table `dossier_etapes` : dossier, statut atteint, auteur, rôle, date, commentaire, données associées. Elle sert de journal (« qui a fait avancer quoi et quand ») et alimente la frise d'avancement affichée dans l'onglet Projet.

### Devoir de conseil
Nouvelle table `devoirs_conseil` : dossier, contenu (réponses du recueil figées), statut (`prerempli`, `valide_staff`, `a_signer`, `signe`, `refuse`, `modif_demandee`), motif de refus / demande de modification, signature, date, empreinte du document, IP et agent — même schéma de preuve que `lettres_mission`. Le retour en pré-remplissage crée une nouvelle version plutôt que d'écraser la précédente, pour garder la trace des allers-retours.

### Souscription
Nouvelle table `souscription_envois` : dossier, lien envoyé, email destinataire, date d'envoi, auteur, date de première ouverture éventuelle. Chaque envoi est une ligne, ce qui donne la trace visible sur le projet et permet les relances.

### Suivi assureur
Nouvelle table `dossier_suivi_assureur` : dossier, type (`piece_complementaire`, `question_medicale`, `tarification`, `autre`), description libre, statut (`en_attente`, `fourni`, `clos`), date. Un statut libre serait insuffisant : les demandes de l'assureur sont multiples et se cumulent, donc on les liste sous l'étape 9 sans changer le statut du dossier.

### Création du contrat depuis les informations compagnie
Nouvelle table `contrats_entrants` : source (`saisie_manuelle` ou `email_auto`), dossier rattaché (déductible d'une référence), payload brut, champs normalisés (numéro de contrat, date d'effet, prime, compagnie, produit, garanties), statut (`a_valider`, `valide`, `rejete`), contrat créé.

Le back-office propose un formulaire de saisie manuelle qui crée une ligne `a_valider`, puis un écran de contrôle qui la transforme en contrat réel (réutilisant la logique de calcul de commissions et d'économies déjà en place). Le futur script d'automatisation mail écrira dans la **même table** avec `source = 'email_auto'` : il n'aura qu'à alimenter le payload et les champs normalisés, la validation humaine et la création du contrat restent identiques. C'est ce qui rend l'automatisation future compatible sans refonte.

La transition vers `contrat_valide` exige un contrat rattaché (d'où le bouton d'accès direct), et `contrat_actif` exige une date d'effet atteinte — mise à jour automatique quotidienne possible, plus bascule manuelle.

### Lien bidirectionnel projet ↔ contrat
Le contrat porte déjà `dossier_id` : on l'exploite dans les deux sens.
- Depuis la fiche contrat : bloc « Projet d'origine » avec accès au dossier, à son historique d'étapes et à ses documents signés.
- Depuis le projet (back-office) : bloc « Contrat résultant » avec accès direct au contrat.
Le rattachement est posé au moment de la validation du contrat entrant, et l'index correspondant est ajouté pour la navigation dans les deux sens.

### Traçabilité ACPR
Le pipeline est conçu comme un dossier de preuve opposable en cas de contrôle ACPR. En conséquence :
- **Aucune suppression, aucun écrasement** : les étapes, versions du devoir de conseil, envois de lien de souscription et demandes assureur sont en append-only. Les politiques d'accès interdisent la suppression et la modification a posteriori des lignes de preuve (seul l'ajout est permis, y compris pour l'admin) ; une correction se matérialise par une nouvelle version.
- **Horodatage systématique** : chaque étape enregistre date, auteur, rôle. Chaque signature conserve date, empreinte du document signé, IP et agent — comme déjà fait pour la lettre de mission et le DER.
- **Consultation après finalisation** : l'historique complet reste consultable côté back-office indéfiniment, même une fois le contrat actif ou le projet perdu. Rien n'est purgé ni archivé hors de portée.
- **Vue « dossier de preuve »** : sur le projet en back-office, un panneau chronologique reprend étape par étape l'horodatage, l'auteur et le document associé, exportable en PDF pour transmission à un contrôleur.
- Les transitions restent journalisées dans `audit_logs` en plus de `dossier_etapes`.

### Projet finalisé : masqué côté client, conservé côté back-office
À `contrat_actif`, le projet sort de l'onglet Projet de l'espace client : le client ne suit plus un projet abouti, il consulte son contrat. Concrètement :
- La politique de lecture client sur `dossiers` exclut les dossiers `contrat_actif` (ainsi que les dossiers clos type `perdu`) ; le masquage est donc effectif en base, pas seulement dans l'interface.
- Les documents signés du projet restent accessibles au client via son contrat (bloc « Documents contractuels » sur le contrat), pour ne pas lui retirer ses propres pièces signées.
- Côté back-office, la fiche client conserve la totalité des projets, avec un filtre « projets finalisés / en cours » et l'historique intégral consultable.


## Interfaces

### Onglet Projet (back-office, fiche dossier)
- Frise d'avancement des 11 étapes, avec l'étape courante mise en avant.
- Un panneau par étape active, avec l'action possible pour le rôle courant.
- Bloc **Documents du projet** : lettre de mission (envoyée / signée), devoir de conseil (toutes versions), lien de souscription (historique des envois), contrat.
- Bloc **Demandes de l'assureur** sous l'étape 9.

### Espace client, onglet Projet
- Même frise, mais les étapes 3 à 5 fusionnées en un seul jalon « Étude en cours ».
- Actions client : signer la lettre de mission, signer / refuser / demander une modification du devoir de conseil, ouvrir le lien de souscription, accéder au contrat.
- Documents signés téléchargeables.
- Un projet passé en `contrat_actif` disparaît de cette liste ; le client le retrouve sous forme de contrat, avec ses documents signés rattachés.


### Onglet Conformité
Inchangé : KYC (CNI, justificatif de domicile, RIB) et LCB-FT uniquement. Les documents contractuels en sont retirés s'ils y figurent.

## Détails techniques

- **Source de vérité des étapes** : un module partagé `src/lib/pipeline-dossier.ts` décrivant chaque étape (clé, libellé, libellé client, visibilité, rôles autorisés, transitions permises, prérequis). L'interface et les server functions consomment ce même module, ce qui évite les divergences.
- **Transitions** : server functions authentifiées dans `src/lib/pipeline-dossier.functions.ts` (`avancerEtape`, `validerConseil`, `envoyerConseilAuClient`, `repondreConseilClient`, `envoyerLienSouscription`, `enregistrerContratEntrant`, `validerContratEntrant`), chacune vérifiant statut de départ, rôle et prérequis avant écriture, puis insérant la ligne d'historique.
- **Migrations** : extension de l'énumération `dossier_statut`, tables `dossier_etapes`, `devoirs_conseil`, `souscription_envois`, `dossier_suivi_assureur`, `contrats_entrants` — chacune avec grants explicites et politiques d'accès (staff complet ; client limité à ses dossiers et aux étapes visibles).
- **Emails** : lien de souscription et invitation à signer le devoir de conseil passent par le registre transactionnel existant.
- **Signature** : réutilisation de `SignaturePad` et du schéma de preuve déjà en place pour la lettre de mission et le DER.

## Découpage proposé

1. Migrations + module de pipeline partagé.
2. Onglet Projet back-office : frise, transitions, documents.
3. Devoir de conseil : pré-remplissage, validation, envoi, signature / refus / demande de modification.
4. Lien de souscription + suivi assureur.
5. Contrats entrants : saisie manuelle, validation, création du contrat, accès direct.
6. Espace client : frise simplifiée, actions et documents.

## Points à confirmer

- Un dossier peut-il porter **plusieurs devis** simultanément (étape 3) avec un devoir de conseil par devis, ou un seul devis retenu par dossier ? Je partirais sur plusieurs devis possibles mais un seul devoir de conseil, portant sur le devis retenu.
- Sur un refus client du devoir de conseil (7b), le dossier est-il clôturé automatiquement en `perdu`, ou reste-t-il ouvert pour reprise par le conseiller ? Je partirais sur « reste ouvert ».
