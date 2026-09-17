# Commission prévisionnelle par assuré (dossiers multi-emprunteurs)

## Constat de l'audit (lecture seule)

- Chaque assuré a bien son contrat individuel, et le panneau de l'étape « Analyse et décision » affiche déjà une commission par contrat.
- Mais la commission prévisionnelle n'est écrite qu'au moment exact de la création des contrats : sur les dossiers à plusieurs emprunteurs déjà créés, elle manque (EJ-2026-EMP-0002 : deux contrats sans commission ; EJ-2026-EMP-0005 : un seul des deux contrats en a une).
- Dans l'onglet Contrats de la fiche client, une commission enregistrée au niveau du dossier est attribuée au hasard à l'un des assurés du même prêt — chiffre faux sur un prêt à deux emprunteurs.

## Correctif demandé (périmètre strict)

1. Calcul par assuré isolé dans un module dédié (part de quotité, cotisation de l'assuré, mois restants), réutilisé par la création de contrats — un seul calcul, celui du taux du devis retenu.
2. Nouvelle action interne « Recalculer la commission par assuré » sur le suivi par contrat : recalcule et enregistre la commission de chaque contrat du prêt, de façon idempotente, y compris pour les contrats créés avant cette correction.
3. Une commission enregistrée au niveau du dossier alors que les contrats individuels existent est reprise au niveau des contrats, pour éviter le double comptage en comptabilité.
4. Onglet Contrats : la commission affichée n'est plus celle du dossier, uniquement celle du contrat de l'assuré.

## Hors périmètre

Aucune modification du système email, du barème, du devoir de conseil, du KYC ni des vues comptables existantes.

## Détails techniques

- Nouveau `src/lib/commission-contrats.ts` (pur, testé) + `commission-contrats.server.ts` / `.functions.ts` (accès staff via `requireSupabaseAuth`).
- `contrat-depuis-dossier.server.ts` appelle le module partagé au lieu de son calcul en ligne.
- `dossier-references-externes-panel.tsx` : bouton de recalcul + rafraîchissement.
- `contrats-tab.tsx` : correspondance sur `contrat_id` uniquement.
- Vérification : TypeScript, Vitest ciblé, puis capture réelle sur un dossier à deux emprunteurs.
