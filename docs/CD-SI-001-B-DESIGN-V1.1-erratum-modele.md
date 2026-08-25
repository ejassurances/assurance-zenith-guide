# CD-SI-001-B — DESIGN V1.1 — Erratum documentaire (modèle d'extraction)

Statut : correction **documentaire uniquement**, décidée par la Direction Générale
lors de la validation du LOT 2 (GO — LOT 2 VALIDÉ).

## Objet

Toute référence prescriptive au modèle :

> `gemini-1.5-flash`

est remplacée, dans le dossier de conception CD-SI-001-B-DESIGN V1.1 et dans
toute documentation dérivée, par la formulation générique suivante :

> « Modèle Gemini Flash disponible sur la passerelle IA du projet, avec
> mécanisme de repli sur un modèle Gemini Flash compatible. »

## Justification

La passerelle IA du projet n'autorise pas `gemini-1.5-flash` (réponse HTTP 400 —
modèle non autorisé). Les modèles Gemini Flash réellement disponibles répondent
en HTTP 200 et sont utilisés avec repli automatique. Le choix du modèle relève
donc de l'implémentation et de la disponibilité réelle de l'infrastructure, non
d'une contrainte de conception.

## Portée

- Aucun changement de code du LOT 2.
- Aucun changement du schéma BDD.
- Aucun changement de `ai_context` ni de son schéma de validation (LOT 1).
- Aucun branchement du LOT 2 au workflow Gmail.
- Aucun comportement métier modifié : extraction seule, statut `DETECTED`,
  aucune FK écrite, aucune création d'entité, aucune tâche créée.

## Gel

Le LOT 3 reste **GELÉ** jusqu'à nouvelle validation explicite de la Direction
Générale.
