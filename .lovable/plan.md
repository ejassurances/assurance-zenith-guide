# Automatisation Gmail — audit lecture seule et proposition

## 1. Résultat de l'audit (rien n'a été modifié)

**Base de données** : Lovable Cloud (base unique, partagée entre la préversion et l'application publiée).

**Tables des personnes et des affaires** : `clients` (prospects et clients, 54 colonnes), `compagnies` et `compagnies_api_config` (partenaires assureurs), `fournisseurs`, `prescripteurs`, `tiers`, `contrats`, `dossiers`, `documents` (pièces), `activites` (historique d'échanges), `taches`.

**Historique des emails** : table `crm_emails` (identifiant du message Gmail, identifiant du fil, date de réception, rattachements client / dossier / contrat / compagnie, direction, résultat du tri, notes). Elle ne conserve **pas** aujourd'hui : l'expéditeur, le lien Gmail, le lien du brouillon, la décision prise, le niveau de confiance, ni l'état d'avancement du traitement.

**Automatisation actuelle des emails** : le passage automatique (`/api/public/scan-emails`, toutes les 20 minutes) **ne lit jamais la boîte de réception**. Il lit uniquement les messages qu'un membre du cabinet a étiquetés à la main, puis les fait passer en « A valider » ou « Archives ». Les étiquettes utilisées sont à plat : 3 directions (Commerciale, Financière, Juridique et Conformité) + 2 états (« A valider », « Archives »). Une réponse automatique existe pour la gestion courante, avec délai de 45 minutes et heures d'ouverture, l'envoi passant par une file d'attente. Une lecture « boîte principale » existe déjà dans le code mais n'est branchée sur rien.

**Pièces jointes** : téléchargées depuis Gmail, déposées dans le stockage du projet et enregistrées dans `documents` (nom, type, lien avec le client / dossier / contrat). L'anti-doublon repose aujourd'hui sur le chemin du fichier qui contient l'identifiant du message.

**Gmail / Google Workspace déjà en place** : lecture des messages, lecture d'un fil, détection d'une réponse du cabinet postérieure, téléchargement des pièces jointes, pose et retrait d'étiquettes, archivage, corbeille, envoi, dépôt d'une copie des envois, plus l'archivage Google Drive. L'accès Gmail passe par la passerelle Lovable avec une autorisation Google déjà accordée (clé `GOOGLE_MAIL_API_KEY`). **Aucun brouillon Gmail n'est créé aujourd'hui.**

## 2. Deux points qui demandent votre décision

**a) Les étiquettes.** Votre règle enregistrée impose les étiquettes à plat 3 directions + « A valider » / « Archives », sans sous-étiquette. Vous demandez maintenant `01_Brouillon_IA_A_Relire`, `02_Alerte_Humain_A_Traiter`, `03_Archives_Traitees`. Proposition : garder l'étiquette de direction (elle sert au classement métier) et remplacer les deux états par vos trois nouveaux états. Les messages déjà classés gardent leurs anciennes étiquettes ; aucune n'est supprimée dans Gmail.

**b) La connexion Gmail.** L'autorisation Google du cabinet existe déjà et fonctionne. La refaire en « OAuth par utilisateur » n'apporterait rien pour une boîte unique de cabinet et coûterait un chantier entier. Proposition : conserver la connexion existante et n'ajouter qu'un écran indiquant si l'accès Gmail est actif, avec le bouton de reconnexion.

## 3. Ce qui serait ajouté ou modifié

### Base de données (aucune suppression, aucune donnée touchée)
- `crm_emails` : nouvelles colonnes expéditeur, objet, lien Gmail du message, lien de la réponse, identifiant et lien du brouillon, décision, niveau de confiance, état du traitement, date de traitement, motif d'alerte ; contrainte d'unicité sur l'identifiant du message Gmail (anti-doublon).
- `documents` : colonnes identifiant du message Gmail d'origine et empreinte du fichier, plus unicité (message + nom de fichier) pour l'anti-doublon des pièces.
- Nouvelle table `email_decisions` : historique des décisions (automatique ou humaine), avec l'auteur et la date, pour l'écran de contrôle.
- Droits d'accès et règles de sécurité : lecture et écriture réservées aux administrateurs et mandataires.

### Fichiers
- `src/lib/gmail-labels.ts` — ajout des trois nouveaux états.
- `src/lib/gmail.server.ts` — filtrage boîte principale hors Promotions / Réseaux sociaux / Notifications / Forums, messages lus et non lus, création de brouillon Gmail, lien Gmail d'un message.
- Nouveau `src/lib/gmail-inbox.server.ts` — réception et enregistrement des messages, attente de 45 minutes, détection d'une réponse déjà envoyée dans le fil, choix du classement, anti-doublon.
- Nouveau `src/routes/api/public/gmail-inbox.ts` — passage régulier déclenchant ce traitement (protégé par jeton, non planifié tant que vous n'avez pas validé).
- `src/lib/pieces-partenaire.server.ts` — anti-doublon renforcé et mise en alerte en cas de rattachement incertain.
- Nouveau `src/routes/_authenticated/espace.gmail-controle.tsx` + composant d'écran de contrôle — alertes, brouillons à relire, correction du rattachement, validation ou refus d'un brouillon, historique des décisions.

### Secrets
Aucun nouveau secret : `GOOGLE_MAIL_API_KEY`, `LOVABLE_API_KEY` et le jeton des passages automatiques existent déjà.

## 4. Périmètre de ce premier lot
Analyse, connexion Gmail vérifiée, réception et enregistrement des messages, délai de 45 minutes, classement, détection d'une réponse déjà envoyée, écran de contrôle en lecture. **Aucun envoi automatique**, aucun passage en production : le traitement ne se lance que sur déclenchement manuel tant que vous ne validez pas.

## 5. Tests
Tests unitaires sur le délai de 45 minutes, la détection de réponse existante et l'anti-doublon ; vérification technique du projet ; contrôle à l'écran sur la boîte réelle avec captures, sans aucun envoi.
