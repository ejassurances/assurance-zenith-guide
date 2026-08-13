# Feuille de route CRM — LCB-FT, pipeline projet & DDA, scoring, emails

Tout est faisable. Découpage en 6 lots livrés dans l'ordre de priorité, chaque lot testable seul.

## Lot 1 — Correctif LCB-FT / PPE (bloquant, en premier)

Constat vérifié : `src/lib/lcb-ft.functions.ts` et `src/lib/lcb-ft.server.ts` appellent
`https://api.opensanctions.org/search/default` sans en-tête d'authentification — d'où le 401.

- Clé lue côté serveur uniquement (`OPENSANCTIONS_API_KEY`), en-tête `Authorization: ApiKey <clé>`.
- Passage à `POST /match/default` : envoi d'une entité (nom, prénom, date de naissance, pays) au lieu d'une
  requête texte — c'est le mode prévu pour le screening réglementaire, avec un score de correspondance par entité.
- L'historique reste écrit dans `client_lcb_verifications` (même format de résultats, `fournisseur` inchangé).
- Message d'erreur explicite dans l'écran conformité si la clé manque ou si l'API répond en erreur
  (aujourd'hui l'échec est silencieux et enregistré comme « clair »).

Prérequis : ajoutez la clé dans Réglages du projet → Secrets sous le nom `OPENSANCTIONS_API_KEY`.

## Lot 2 — Scoring KYC & conformité 0-100 %

- Barème : CNI valide non expirée 30 pts · RIB + justificatif de domicile de moins de 3 mois 30 pts ·
  KBIS/Sirene à jour si client pro 20 pts · questionnaire LCB-FT (PPE + gel des avoirs) validé 20 pts.
- Client non pro : les 20 pts KBIS sont neutralisés et le score ramené sur 100 (pas de plafond à 80).
- Seuils : rouge < 50 %, orange 50-89 %, vert 90-100 %.
- Badge en haut de la fiche client, avec le détail des points manquants.
- Recalcul automatique à chaque ajout, validation, suppression de pièce ou changement de date d'expiration.
- Blocage réel sous 50 % : impossible de générer un devis ou un devoir de conseil, et impossible de créer un
  contrat — refus côté serveur, pas seulement bouton grisé.

## Lot 3 — Pipeline projet & générateur de devoir de conseil natif

### Étapes portées par le dossier

```text
1  lettre de mission à signer      client : voit + signe
2  lettre de mission signée        document signé visible dans l'onglet Projet
3  devis                           STAFF UNIQUEMENT
4  devoir de conseil pré-rempli    STAFF UNIQUEMENT
5  devoir de conseil validé staff  STAFF UNIQUEMENT
6  devoir de conseil à signer      client : signe / refuse / demande une modification
7  souscription envoyée            lien envoyé par mail + trace d'envoi
8  en traitement auprès de l'assureur
9  contrat validé                  accès direct au contrat
10 contrat actif
```

Étapes 3 à 5 : le client voit « Étude en cours par votre conseiller », jamais les devis. Masquage appliqué en
base (règles de lecture), pas seulement à l'écran.

### Traçabilité ACPR

Journal `dossier_etapes` en ajout seul : statut atteint, auteur, rôle, horodatage, commentaire. Aucune
suppression ni modification possible, pour personne. Un retour à l'étape 4 crée une nouvelle version du devoir
de conseil au lieu d'écraser la précédente. Export « dossier de preuve » depuis le back-office.

### Devoir de conseil

- Modèles fixes par typologie (emprunteur, santé/prévoyance, MRH, auto, pro, épargne/retraite, trottinette) :
  mentions légales identiques par branche, et zones dynamiques cadrées remplies par l'IA — pas de rédaction libre.
- Jusqu'à 3 devis comparés (moins s'il y a moins de partenaires), classés par prix parmi les offres adaptées.
- Compagnies favorites classées top 1/2/3 **par branche** (référentiel à saisir dans l'espace admin). Si une
  favorite est retenue alors qu'elle est légèrement plus chère, aucun devis moins cher qu'elle n'est affiché.
- Recommandation toujours justifiée par un lien de causalité explicite avec les besoins exprimés dans le recueil.
- Emprunteur : Capital Initial retenu par défaut, Capital Restant Dû seulement s'il est moins cher, avec
  explication obligatoire du mécanisme CI/CRD dans le document.
- Génération native dans l'application, signature avec le pavé de signature existant (pas de Yousign).
  Le PDF signé est archivé sur Drive dans `02_Conformite_DDA` comme copie de preuve.

### Refus du devoir de conseil

Motif obligatoire côté client. Une analyse IA du motif produit soit une contre-proposition présentée au
mandataire/admin, soit une proposition de clôture en « perdu ». La décision finale reste humaine.

### Fin de parcours

Au passage en contrat actif : le projet disparaît de l'espace client, reste consultable en back-office, et le
lien Projet ↔ Contrat est navigable dans les deux sens. Les documents signés restent accessibles au client
depuis son contrat.

## Lot 4 — Co-emprunteur

Le recueil emprunteur accepte un second emprunteur (identité, date de naissance, statut fumeur, quotité).
Deux devis distincts sont générés, un par emprunteur, jamais un devis combiné. Aucun questionnaire de santé
n'est intégré : il relève de la relation directe assureur ↔ client.

## Lot 5 — Migration email Gmail + Brevo

- **Gmail (réception)** : remplacement du webhook Apps Script par le connecteur Gmail, en connexion partagée
  unique. Les mails entrants sont rattachés automatiquement au client/dossier correspondant (adresse, puis
  référence de dossier) ; si aucun client ne correspond, une fiche est créée avec le mail en pièce d'origine.
- **Brevo (envois)** : tous les envois automatisés à sens unique — lettre de mission, devoir de conseil,
  relances de pièces manquantes, demande d'avis Google — avec suivi délivré/ouvert conservé comme trace.
- Le script Apps Script / Gemini actuel reste actif tant que la réception Gmail n'est pas vérifiée en
  conditions réelles ; bascule ensuite, en une étape explicite.

## Lot 6 — Avis Google

Mail Brevo déclenché au passage du contrat au statut **actif** (pas à la signature), après un délai de
3 jours ouvrés (lundi-vendredi, jours fériés non pris en compte sauf demande).

## Hors lots (notés, pas d'action maintenant)

- Domaine `ejpartners.fr` : vérification d'affichage à faire en fin de chantier.
- Charte graphique CRM (menu regroupé par logique métier, cartes KPI) : finition, en dernier.
- Deux API compagnies supplémentaires : en attente de documentation.

## Détails techniques

- Lot 1 : `src/lib/lcb-ft.server.ts` devient l'unique point d'appel (le server fn authentifié et
  l'automatisation des leads partagent la même logique). Clé lue dans le handler, jamais au niveau module.
- Lot 2 : barème dans une fonction `SECURITY DEFINER` déjà existante (`calculer_score_conformite_client`)
  réécrite, déclenchée par trigger sur `client_kyc_documents`, `documents` et `client_lcb_verifications`.
  Blocage < 50 % appliqué dans les server functions de génération de devis/DDA/contrat.
- Lot 3 : nouvelles tables `dossier_etapes` (append-only), `devoirs_conseil` (versionné, mêmes colonnes de
  preuve que `lettres_mission`), `devis`, `souscription_envois`, `compagnie_favoris` (compagnie, branche, rang).
  Enum `dossier_statut` étendu, anciens statuts conservés et rattachés au pipeline. Transitions validées côté
  serveur (statut de départ attendu + rôle requis + prérequis).
- Lot 3 : génération PDF côté serveur en JS pur (contrainte du runtime serverless : pas de binaire natif).
- Lot 5 : appels Gmail et Brevo via la passerelle de connecteurs, exclusivement côté serveur ; réception Gmail
  par une route planifiée sous `src/routes/api/public/` avec vérification de l'appelant.

## Ordre d'exécution proposé

Lot 1 dès validation (rapide, débloque la conformité), puis Lot 2, puis Lot 3 (le plus gros, livré en
sous-étapes : pipeline et traces d'abord, générateur DDA ensuite), puis Lots 4, 5, 6.
