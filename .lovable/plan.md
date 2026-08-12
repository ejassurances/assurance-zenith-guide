# Recueil des besoins adaptatif + équipements client

## Ce qu'on construit

1. Un parcours de recueil unique, public, partageable par lien, qui s'adapte aux réponses et ne redemande jamais une information déjà connue.
2. Une gestion des équipements assurables du client (logement, véhicule, EDPM, épargne…), avec détection automatique d'opportunités et passerelle directe vers le recueil de la bonne branche.

## 1. Recueil des besoins — workflow adaptatif

### Modèle de parcours
Le socle actuel (`recueil-besoins-schemas.ts` + `recueil-workflow.tsx`) contient déjà des étapes, du conditionnel par champ (`showIf`), des cartes illustrées et des blocs pédagogiques. On le fait évoluer plutôt que le remplacer :

- **Étapes conditionnelles** : ajouter `showIf` au niveau d'une étape entière (aujourd'hui uniquement au niveau du champ), pour sauter des étapes non pertinentes. La progression et le numéro d'étape se calculent sur les étapes réellement visibles.
- **Étapes système réutilisables**, communes à toutes les branches, insérables dans n'importe quel ordre :
  - `contact` (nom, prénom, email, téléphone, consentements contact + RGPD)
  - `equipement` (rattachement à un équipement existant ou création)
  - `recap` (récapitulatif, déjà présent)
- **Ordre non figé** : le parcours est décrit par une séquence d'étapes calculée à l'ouverture selon le contexte d'entrée :
  - entrée « je veux une étude » (site public, branche connue) → recueil d'abord, contact ensuite ;
  - entrée « contactez-moi » (formulaire simple) → contact d'abord, puis proposition d'enchaîner le recueil ;
  - entrée depuis l'espace client / un tag « Demander une étude » → contact déjà connu, on démarre directement au recueil.

### Lien public
- Nouvelle route publique `/-/recueil/$token` (SSR, sans authentification), plus une variante `/-/recueil?branche=auto` pour un lien générique intégrable sur le futur site EJ Assurances (iframe ou lien).
- Les jetons sont stockés en base (`recueil_liens`) : branche visée, client rattaché éventuel, équipement rattaché éventuel, date d'expiration, usage unique ou non, réponses partielles.
- **Aucune donnée client n'est lisible par la clé publique** : le préremplissage et l'enregistrement passent par des server functions non authentifiées qui ne prennent que le jeton et ne renvoient que les champs stricts du préremplissage (prénom/nom/email/téléphone/équipement du client rattaché). Un lien générique sans client rattaché ne préremplit rien.
- À la soumission : création ou mise à jour de la fiche client, création du dossier avec `recueil_besoins`, création de la tâche admin de reprise de contact — en réutilisant la logique déjà en place dans `api/public/leads`.
- Sauvegarde automatique de l'avancement sur le jeton : le client peut reprendre son parcours plus tard avec le même lien.

### Préremplissage
Sources, par ordre de priorité : réponses déjà saisies sur le jeton → fiche client rattachée (identité, coordonnées) → équipement rattaché (type, libellé, valeur, date d'acquisition) → vide. Les champs préremplis restent modifiables et sont marqués « déjà connu » dans l'interface.

## 2. Équipements et opportunités

### Stockage
La table `client_equipements` existe déjà (type, libellé, valeur, date d'acquisition, notes) et est éditable dans le back-office. On l'enrichit :

- `branche` : branche d'assurance visée par l'équipement (auto, habitation, emprunteur, EDPM, épargne…)
- `assure_chez_nous` : booléen
- `contrat_id` : contrat interne rattaché le cas échéant
- `assureur_actuel`, `echeance_contrat_actuel` : contexte concurrent
- `opportunite_statut` : `aucune` / `a_etudier` / `etude_demandee` / `traitee`
- `ajoute_par_client` : distingue une saisie client d'une saisie back-office

Les règles d'accès permettront au client de gérer ses propres équipements (lecture/ajout/modification sur sa fiche), le staff conservant l'accès complet.

### Détection d'opportunité
Déclenchée en base (trigger) à l'ajout ou à la modification d'un équipement, pour rester cohérente quelle que soit l'origine de la saisie. Règle : un équipement est `a_etudier` s'il n'est pas rattaché à un contrat actif chez nous, et qu'aucun dossier en cours ne couvre déjà sa branche pour ce client. Passe à `etude_demandee` quand le recueil est lancé depuis le tag, puis `traitee` à la signature d'un contrat rattaché.

### Espace client
- Nouvel onglet « Mes équipements » : liste, ajout, modification, avec badge d'opportunité.
- Le tag « Demander une étude » génère un lien de recueil préconfiguré (branche déduite de l'équipement, équipement et client rattachés) et ouvre directement le parcours à l'étape de recueil.
- Bandeau de notification en tête d'espace quand au moins une opportunité est `a_etudier`.
- **Onboarding léger** : au premier accès, si aucun équipement n'est déclaré, un encart en 3 écrans invite à ajouter logement / véhicule / épargne, avec possibilité de passer. État stocké sur le profil du client pour ne pas réafficher.

### Back-office
Onglet équipements de la fiche client enrichi des mêmes champs et badges, plus un filtre « clients avec opportunités » dans la liste clients.

## Détails techniques

- **Schémas** : `SectionConfig` gagne `id` et `showIf`; nouveau type `ParcoursContext` (branche, client, équipement, point d'entrée) et fonction `buildParcours(context)` retournant la séquence d'étapes. Les branches existantes restent compatibles.
- **Composant** : `recueil-workflow.tsx` refactoré pour consommer une séquence d'étapes filtrée dynamiquement, avec un rendu dédié pour les étapes système (contact, équipement).
- **Server functions** (`src/lib/recueil-public.functions.ts`, non authentifiées, validation Zod) : `ouvrirRecueil(token)`, `sauverBrouillon(token, values)`, `soumettreRecueil(token, values)`. Rate limiting simple par jeton et expiration à 30 jours. Les écritures passent par le client admin côté serveur uniquement.
- **Migrations** : table `recueil_liens` (+ grants et politiques : aucun accès direct anon/authenticated, tout passe par les server functions), colonnes ajoutées sur `client_equipements` (+ politiques client), trigger de détection d'opportunité, énumération des branches d'équipement.

## Découpage proposé

1. Migrations (équipements enrichis + `recueil_liens` + trigger opportunité).
2. Moteur de parcours adaptatif (schémas, étapes système, refonte du composant) — le recueil interne existant continue de fonctionner.
3. Route publique par lien + server functions + préremplissage.
4. Espace client : onglet équipements, notifications, onboarding, tag « Demander une étude ».
5. Back-office : équipements enrichis, filtre opportunités.

## Hypothèses à confirmer

- Le lien public est valable 30 jours et réutilisable jusqu'à soumission (pas usage unique).
- La branche « habitation » n'existe pas encore comme branche de recueil distincte (aujourd'hui regroupée dans `iard`) : je créerais `habitation` et `auto` comme branches propres, nécessaires pour que le mapping équipement → recueil soit précis.
