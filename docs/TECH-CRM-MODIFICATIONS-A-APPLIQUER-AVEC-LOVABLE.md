# CRM — actions restant à appliquer avec Lovable

Ce document sert de pense-bête pour les actions qui nécessitent une intervention/validation dans Lovable ou un déploiement applicatif non disponible depuis la connexion GitHub seule.

## À faire lorsque des crédits Lovable sont disponibles

### 1. Vue Dossier — correction de la colonne « Prime d'assurances »
La vue dossier doit afficher la prime d'assurance et non le capital/prêt immobilier.

Règle métier :
- Capital emprunté = montant du prêt.
- Prime d'assurance TTC = montant figurant sur le devis client.
- Prime HT = montant calculé selon le régime fiscal.
- Taxes/contributions = lignes fiscales séparées.
- Assiette de commission = base définie par le barème de la compagnie.

### 2. Vue des contrats actifs — contrôle documentaire
Ajouter une vue permettant d'identifier rapidement :
- contrat actif ;
- dossier rattaché ;
- devis retenu ;
- document du devis présent/manquant ;
- pièces obligatoires manquantes ;
- prime TTC source ;
- prime HT ;
- taxes ;
- assiette commission ;
- taux et commission prévisionnelle ;
- incohérences devis/contrat.

### 3. Fiche contrat
Afficher distinctement :
- Prime TTC client
- Prime HT
- Taxes/contributions
- Assiette commissionnable
- Taux de commission
- Commission prévisionnelle
- Devis retenu
- Document du devis
- Statut du contrôle financier/documentaire

### 4. Saisie du devis
La donnée saisie doit partir du TTC du devis client. Le HT ne doit pas être demandé lorsque seul le TTC est disponible.

### 5. Déploiement
Après validation des migrations SQL de `supabase/migrations/`, vérifier qu'elles sont bien appliquées sur l'environnement de production et que les types Supabase générés sont à jour si le projet utilise une génération de types.

## Déjà versionné sur main
- Référentiel `taxes_assurances`.
- Champs financiers/fiscaux des contrats.
- Calcul HT/taxes depuis le TTC lorsque le régime est connu.
- Fonction de calcul de commission depuis une assiette explicite.
- Migration de synchronisation du statut DDA depuis la lettre de mission.
- `prime_nette_annuelle` conservée pour compatibilité, avec priorité donnée à l'assiette de commission explicite.
