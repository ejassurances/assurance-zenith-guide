# Espaces authentifiés EJ Partners

Objectif : scaffolder 4 espaces (admin courtier, mandataire, client, prescripteur) avec authentification email/mot de passe et les 4 fonctionnalités demandées.

## 1. Infrastructure (Lovable Cloud)

Activer Lovable Cloud pour bénéficier d'une base de données PostgreSQL, de l'authentification et du stockage de fichiers intégrés — sans compte externe à créer.

Authentification : email + mot de passe uniquement. Pas d'inscription publique côté mandataires/prescripteurs (créés par l'admin) ; les clients pourront s'auto-inscrire depuis un lien envoyé.

## 2. Modèle de données

- `profiles` — informations utilisateur (nom, tél, société)
- `user_roles` (table séparée, énumération `app_role`) — `admin | mandataire | client | prescripteur`
- `dossiers` — dossier client : statut, capital, durée, économie estimée, propriétaire, apporteur
- `commissions` — par dossier : montant, statut (prévu/versé), bénéficiaire (mandataire ou prescripteur)
- `messages` — messagerie interne (dossier ↔ participants)
- `documents` — métadonnées + fichiers dans un bucket privé Storage

Sécurité : Row Level Security activée partout. Un rôle est vérifié via une fonction `has_role()` SECURITY DEFINER (jamais via une colonne sur profiles — sinon faille d'escalade).

Règles d'accès :
- Admin : tout voir/modifier
- Mandataire : voir/gérer ses dossiers (ceux qu'il a apportés)
- Prescripteur : voir uniquement ses apports et commissions
- Client : voir uniquement son propre dossier, ses documents, ses messages

## 3. Routes

Espace public (inchangé) :
```
/, /assurance-emprunteur, /coparentalite, /blog, /contact, /a-propos, ...
```

Nouvelles routes :
```
/auth                          → connexion / mot de passe oublié
/_authenticated/               → layout protégé (redirige vers /auth)
  espace/                      → hub qui redirige selon le rôle
  admin/                       → tableau de bord courtier
    dossiers, dossiers/$id, commissions, utilisateurs, messages
  mandataire/                  → tableau de bord mandataire
    dossiers, dossiers/$id, commissions, messages
  client/                      → espace client
    mon-dossier, documents, messages
  prescripteur/                → espace prescripteur
    apports, commissions
```

L'accès par rôle est vérifié dans un `beforeLoad` de chaque sous-layout.

## 4. Fonctionnalités

**Gestion de dossiers** — liste + fiche détail avec statut (Nouveau, En cours, Signé, Perdu), capital, taux, économie, apporteur lié.

**Commissions** — table filtrée par utilisateur, totaux prévus/versés, historique.

**Messagerie interne** — fil de discussion par dossier, participants selon rôle. Envoi via serverFn (RLS).

**Documents** — upload dans bucket privé `dossier-documents`, listés dans la fiche dossier. URL signée à la demande.

## 5. Header & navigation

- Ajout d'un lien « Espace » dans le header public : renvoie vers `/auth` si non connecté, vers `/espace` sinon.
- Bouton de déconnexion dans le layout authentifié.

## 6. Livraison en une passe

Je scaffolde tout en parallèle avec des vues fonctionnelles mais volontairement épurées (listes + fiches CRUD basiques + upload). Le style suit l'existant (typographie Newsreader / Inter, palette zinc).

## Détails techniques

- Base : Lovable Cloud (Supabase managé). Auth email/pw activée.
- Rôles via table `user_roles` séparée + fonction `has_role()` (pattern sécurité obligatoire).
- Fichiers via Storage bucket privé + URLs signées.
- Server functions `createServerFn` avec `requireSupabaseAuth` pour toutes les écritures.
- Le seed du 1er compte admin sera fait après activation (je créerai votre compte avec votre email).

Quand vous validez, j'active Lovable Cloud, je crée le schéma, puis je scaffolde les 4 espaces d'un coup.
