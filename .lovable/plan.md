# Automatisation dossier + espace client

## Ce qui existe déjà (vérifié)

- `src/routes/api/public/leads.ts` crée déjà le client, une activité, une tâche admin et envoie une invitation e-mail (`inviteUserByEmail` vers `/reset-password`). Il ne crée **pas** de dossier, ne lance **pas** la LCB-FT, ne classe **pas** les pièces jointes (elles sont seulement relayées au webhook en base64).
- LCB-FT : `rechercherSanctionsPPE` (`src/lib/lcb-ft.functions.ts`) — réutilisable tel quel.
- DER : `DerStatusCard` (`src/components/der-status-card.tsx`) — réutilisable tel quel.
- KYC : table `client_kyc_documents` (types `cni`, `justificatif_domicile`, `rib`) + score calculé par `calculer_score_conformite_client`.
- Documents dossier : table `documents` (`dossier_id`, `client_id`) + bucket `dossier-documents`.
- Layout `/espace` : la navigation masque déjà la plupart des entrées pour le rôle `client`.
- Attention : `dossiers.client_id` référence `auth.users.id` (pas `clients.id`). Le rattachement client se fait donc via `clients.user_id`. Les lectures côté espace client s'appuient sur ce lien.
- Charte : tokens `--crm-gold`, `--crm-brand-blue`, `--crm-brand-sage` dans `src/styles.css`, helpers dans `src/lib/crm-brands.ts`. Aucune nouvelle direction visuelle.

## Hypothèses retenues

- L'auto-inscription client est ouverte à toute adresse e-mail, mais un compte auto-inscrit n'accède qu'aux données rattachées à son e-mail (rôle `client`, aucune donnée si aucun `clients` ne correspond → écran « aucun dossier »). Le rattachement est fait par correspondance d'e-mail.
- Les pièces reçues sont classées par des règles sur le nom de fichier / le type déclaré (pas d'OCR ni d'IA à ce stade).

## 1. Base de données

**Nouvelle table `dossier_pieces_requises`** (suivi des pièces manquantes) :
- `dossier_id`, `client_id`, `code` (ex. `cni`, `justificatif_domicile`, `rib`, `offre_pret`, `tableau_amortissement`, `questionnaire_sante`), `libelle`, `categorie` (`kyc` | `dossier` | `contrat`), `obligatoire`, `statut` (`manquante` | `recue` | `validee` | `refusee`), `document_id`, `kyc_document_id`, `recue_le`, `notes`.
- GRANT `authenticated` + `service_role` ; RLS : admin/mandataire via les helpers existants, client via `can_access_client` / son `user_id`.

**Colonne `profiles.must_change_password`** (booléen, défaut `false`) : passé à `true` pour tout compte créé automatiquement, remis à `false` après changement.

**Colonne `dossiers.cree_automatiquement`** (booléen) pour distinguer les dossiers issus d'une automatisation.

Les pièces requises par branche sont dérivées d'une table de référence en code (`src/lib/pieces-requises.ts`), pas en base, pour rester alignée sur `recueil-besoins-schemas.ts`.

## 2. Automatisation à l'entrée (leads)

Extension de `src/routes/api/public/leads.ts` (ordre exact) :
1. Client créé ou retrouvé (existant).
2. **Dossier créé** avec `type_assurance` déduit du sujet/formulaire, référence auto, `client_nom/email/phone` recopiés.
3. **Pièces jointes classées** : chaque fichier est uploadé dans `dossier-documents` puis rangé selon des règles de nom/type — `cni|identite|passeport` → KYC `cni`, `domicile|edf|quittance|facture` → KYC `justificatif_domicile`, `rib|iban` → KYC `rib`, `offre|pret|amortissement|contrat` → document de dossier, reste → document de dossier « à qualifier ».
4. **Checklist générée** dans `dossier_pieces_requises` : tout ce qui n'a pas été reçu est marqué `manquante`.
5. **LCB-FT lancée** via un nouveau wrapper serveur non authentifié réservé à l'automatisation (même logique que `rechercherSanctionsPPE`, exécuté en service role, écriture dans `client_lcb_verifications`) — le score de conformité se recalcule par le trigger existant.
6. **Compte client** : invitation e-mail existante conservée, plus `must_change_password = true` et `clients.user_id` renseigné.
7. **Tâche admin** enrichie : liste des pièces manquantes et résultat LCB-FT dans la description.

Le tout en « best effort » : une étape en échec n'empêche pas les suivantes (le lead ne doit jamais être perdu).

## 3. Auto-inscription client

- Nouvel onglet « Créer mon compte » sur `/auth` (même charte bleu nuit / doré) : e-mail, mot de passe, confirmation, cases consentement/RGPD.
- Activation des inscriptions e-mail côté backend (sans auto-confirmation : l'e-mail de confirmation reste requis).
- Le trigger existant `handle_new_user` crée déjà le profil et le rôle `client` — rien à changer.
- Après confirmation, un server fn de rattachement associe le nouveau `user_id` au `clients` ayant le même e-mail (s'il existe), sinon le client voit un espace vide avec un message d'accueil.

## 4. Changement de mot de passe obligatoire

- Garde dans le layout `/espace` : si `profiles.must_change_password` est vrai, redirection vers `/espace/parametres` (bloc « définissez votre mot de passe » mis en avant) jusqu'au changement effectif.
- Après `updateUser({ password })`, remise du drapeau à `false`.

## 5. Espace client — 3 onglets

Nouvelle route `/espace/mon-espace` (rendue par défaut aux utilisateurs de rôle `client` depuis `/espace`), navigation à 3 onglets, composants shadcn/ui et tokens de marque existants :

- **Projet** : liste de ses dossiers (référence, branche, statut, badge de marque via `crm-brands`) + détail : avancement, pièces manquantes en évidence, messagerie/documents existants réutilisés.
- **Conformité** : `DerStatusCard` en lecture/signature (lien vers `/espace/signer-der` existant) + statut de sa lettre de mission.
- **Mon compte** : coordonnées, changement de mot de passe, et **upload par le client de ses pièces KYC manquantes** (réutilise le chemin d'upload de `conformite-client-tab.tsx`, en écriture seule sur ses propres documents).

La navigation latérale masque pour le rôle `client` tout ce qui ne le concerne pas et n'affiche que « Mon espace ».

## 6. Vue interne

Sur la fiche client et la fiche dossier : un bloc « Pièces du dossier » listant la checklist (reçues / manquantes / validées), avec validation manuelle par admin/mandataire.

## Détails techniques

- Migration unique : nouvelle table + GRANT + RLS + 2 colonnes.
- `src/lib/pieces-requises.ts` : référentiel des pièces par branche + règles de classement des fichiers (fonctions pures, testables).
- `src/lib/dossier-automation.functions.ts` (thin wrapper) + `dossier-automation.server.ts` pour la logique appelée depuis `leads.ts` et depuis un bouton « Relancer l'automatisation » côté admin.
- `src/lib/client-espace.functions.ts` : lectures/écritures scopées client via `requireSupabaseAuth`.
- Aucun changement du simulateur, du webhook existant, ni de la logique commissions.

## Points à confirmer

1. L'auto-inscription doit-elle être ouverte à tous, ou restreinte aux e-mails déjà présents dans la base clients ?
2. Les pièces manquantes doivent-elles déclencher une relance e-mail automatique au client (et à quelle fréquence) ?
