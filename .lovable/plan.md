# Lecture automatique de la pièce d'identité dès son dépôt

## DOMAINE
Relation client & conformité

## MODULE
CRM — Clients (KYC / LCB-FT)

## SOUS-MODULE
Pièces d'identité de la fiche client

## OBJECTIF
Dès qu'une carte d'identité (ou passeport / titre de séjour) est présente sur la fiche client, l'IA lit la pièce et complète automatiquement les informations d'état civil manquantes de la fiche.

## ÉTAT ACTUEL
- La lecture automatique existe déjà, mais elle s'arrête immédiatement dans deux cas très fréquents :
  - si aucun contrôle LCB-FT n'est « en attente d'informations », rien n'est lu ;
  - seules la date et le lieu de naissance peuvent être complétés.
- Résultat : dans la plupart des dépôts de pièce d'identité, aucune donnée n'est remplie.

## MODIFICATION PROPOSÉE
- Lire la pièce d'identité à chaque dépôt, sans exiger un contrôle LCB-FT en attente.
- Compléter uniquement les champs vides de la fiche, jamais une valeur saisie par un humain :
  civilité, prénom, nom de naissance, date de naissance, ville et pays de naissance, nationalité.
- Compléter aussi la date d'expiration de la pièce quand elle est lisible (utile pour les rappels).
- Conserver les garde-fous actuels :
  - si le nom ou le prénom de la pièce ne correspond pas à la fiche, ou si la lecture est peu fiable : aucune écriture, une tâche est créée et l'écart est tracé dans l'historique ;
  - le contrôle LCB-FT n'est relancé automatiquement que s'il attendait justement ces informations.
- Ajouter un bouton « Relire la pièce » sur chaque pièce d'identité déjà déposée, pour traiter les fiches existantes.

## DÉPENDANCES
- Lecture IA déjà en place (`cni-extraction.server.ts`), fiche client, pièces KYC, contrôle LCB-FT, tâches et historique.
- Aucun changement de base de données, d'authentification, de calcul de commission, de document PDF ni du système email.

## IMPACT
- Fiches clients mieux renseignées sans saisie manuelle, score de conformité plus rapidement atteint.
- Aucune donnée saisie par un conseiller n'est écrasée.
- Aucun impact sur les dossiers, contrats ou commissions.

## TESTS
- Dépôt d'une pièce d'identité sur une fiche sans contrôle LCB-FT en attente : les champs vides se remplissent.
- Fiche déjà renseignée : les valeurs existantes restent inchangées.
- Pièce illisible ou nom différent : aucune écriture, tâche créée, écart visible dans l'historique.
- Contrôles automatiques ciblés + vérification sur une fiche réelle.

## VALEUR PRODUITE
L'état civil du prospect est renseigné automatiquement dès réception de sa pièce d'identité, ce qui accélère la conformité et supprime une saisie répétitive.
