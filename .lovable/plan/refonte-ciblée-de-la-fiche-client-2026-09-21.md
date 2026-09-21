# Refonte ciblée de la fiche client

## DOMAINE
Relation client & dossiers

## MODULE
CRM — Clients

## SOUS-MODULE
Fiche client 360

## OBJECTIF
Transformer la fiche actuelle en espace de travail dense à trois colonnes, inspiré de la référence fournie et de la direction « Professional density dashboard », tout en conservant la charte EJ Partners marine et dorée.

## ÉTAT ACTUEL
- En-tête client large, puis indicateurs empilés verticalement.
- Treize sections accessibles par une navigation latérale séparée.
- Les informations utiles sont présentes mais dispersées et demandent beaucoup de défilement.
- Les actions, scores, données client et historique ne sont pas visibles ensemble.

## MODIFICATION PROPOSÉE
- Créer un en-tête compact : identité, statut, référence, ancienneté, conseiller, nombre de contrats, prime annuelle et actions existantes.
- Organiser le bureau en trois colonnes sur grand écran :
  - gauche : copilote client, score de valeur, complétude et informations de marque/DDA ;
  - centre : toutes les sections existantes sous forme d’onglets compacts, sans suppression de contenu ni d’action ;
  - droite : résumé chronologique des dernières activités réelles.
- Conserver une présentation adaptée aux petits écrans : blocs empilés et sélection compacte de la section.
- Appliquer strictement les couleurs EJ Partners : marine `#0A192F`, doré `#B99B3F`, surfaces claires et densité professionnelle.
- Ne pas intégrer l’image Courtigo : elle reste uniquement une référence visuelle.

## DÉPENDANCES
- Données déjà présentes : client, contrats, activités, score, complétude, marque et statut DDA.
- Aucun changement de base de données, d’authentification, de calcul, de conformité, d’email ou de document.

## IMPACT
- Impact limité à la présentation de la fiche client.
- Les treize sections, permissions et actions actuelles restent disponibles.
- Aucun changement sur les dossiers, commissions ou règles métier.

## TESTS
- Vérifier l’ouverture d’une fiche réelle et l’affichage des données existantes.
- Vérifier le changement entre les treize sections.
- Vérifier les actions selon le rôle connecté.
- Contrôler visuellement les formats ordinateur et mobile, sans chevauchement ni texte coupé.
- Lancer les contrôles automatiques ciblés puis produire une capture de la nouvelle fiche.

## VALEUR PRODUITE
Une fiche client plus lisible et plus rapide à exploiter, avec les informations essentielles, les actions et l’historique visibles dans un même écran, sans modifier le fonctionnement métier.
