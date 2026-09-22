# Rétablissement de la publication

**DOMAINE** : Socle technique

**MODULE** : Dossiers

**SOUS-MODULE** : Fiche dossier

## OBJECTIF
Rétablir une compilation valide afin de débloquer la publication.

## ÉTAT ACTUEL
Deux lignes de texte appartenant à un commentaire sont isolées dans la fiche dossier, vers la ligne 1097. Elles provoquent les erreurs de syntaxe qui interrompent la compilation. Les avertissements liés aux e-mails ne sont pas la cause de cet échec de compilation et restent hors périmètre.

## MODIFICATION PROPOSÉE
Supprimer uniquement ces deux lignes orphelines et leur fermeture de commentaire isolée, sans toucher au fonctionnement du dossier ni au système e-mail.

## DÉPENDANCES
Aucune.

## IMPACT
Correction technique limitée à un seul fichier. Aucun changement métier, visuel, de données ou de conformité.

## TESTS
Relancer la vérification complète du typage après correction. Si une autre erreur bloquante apparaît, la diagnostiquer dans le même chantier avant de conclure.

## VALEUR PRODUITE
La publication redevient possible sans modifier les fonctionnalités existantes.
