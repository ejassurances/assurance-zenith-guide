# Souscription : distinguer devis issu d'une API et devis externe

**DOMAINE** — Production / Souscription
**MODULE** — Dossiers
**SOUS-MODULE** — Étape « Souscription » et passage dossier → contrat

## OBJECTIF
Ne plus imposer la transmission par API/email quand le devis retenu ne vient pas
d'un partenaire connecté : dans ce cas, permettre d'enregistrer la souscription
directement dans le CRM et de créer le contrat.

## ÉTAT ACTUEL
- L'écran de souscription propose toujours deux boutons : « Envoyer par API /
  email » (bouton principal) et « Valider le dépôt sur l'intranet compagnie ».
- Rien n'indique d'où vient le devis retenu. En base, les devis du dossier
  portent une origine (`manuel`, `pdf`, parcours partenaire), jamais exploitée ici.
- Le passage au contrat n'existe qu'après « Enregistrer le retour compagnie »,
  sans possibilité de saisir la date d'effet, la prime ni la compagnie retenue.
- Les garde-fous de complétude (recueil, devis, devoir de conseil signé, pièces)
  restent obligatoires dans tous les cas.

## MODIFICATION PROPOSÉE
1. L'écran affiche l'origine du devis retenu : « devis partenaire connecté »
   (parcours Neoliane / SimulAssur relié au dossier) ou « devis externe »
   (saisi, importé ou reçu en PDF).
2. Devis externe : le bouton d'envoi par API/email n'est plus proposé par défaut.
   À la place, un bloc « Souscription enregistrée hors API » avec : compagnie et
   produit retenus, n° de contrat/adhésion, date d'effet, prime, mode de
   transmission (intranet, email, courrier, agence) et commentaire.
3. La validation de ce bloc crée le contrat du portefeuille (un contrat par
   assuré, comme aujourd'hui), trace l'acte dans l'historique du dossier et
   stoppe les relances automatiques.
4. Devis issu d'un partenaire connecté : l'écran reste identique à aujourd'hui.
5. Les prérequis de complétude bloquent la souscription dans les deux cas,
   sans dérogation.

## DÉPENDANCES
Écran de souscription, fonctions serveur de souscription et de création de
contrat, prérequis de complétude, prévisions de commission par assuré.

## IMPACT
Aucun changement de base de données, de calcul de commission, de document PDF,
de conformité ni du système e-mail. Les dossiers rattachés à un parcours
partenaire gardent exactement le fonctionnement actuel.

## TESTS
Vérification technique du projet, test unitaire de la détection d'origine, puis
contrôle à l'écran sur un dossier avec devis externe (bloc CRM affiché, contrat
créé) et sur un dossier partenaire (écran inchangé), avec captures.

## VALEUR PRODUITE
Fin des envois API inutiles : chaque dossier est souscrit par le canal réellement
disponible, et le contrat entre au portefeuille sans ressaisie.
