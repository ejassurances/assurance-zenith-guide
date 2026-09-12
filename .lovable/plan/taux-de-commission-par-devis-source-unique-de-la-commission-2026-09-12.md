# Taux de commission par devis — source unique de la commission prévisionnelle

## DOMAINE
D6 — Rémunération & Commissions (interface : parcours emprunteur, étape 6 Simulations).

## MODULE / SOUS-MODULE
Devis & valorisation (`dossier-devis-panel`) · Commission prévisionnelle du contrat individuel.

## OBJECTIF
Saisir manuellement un taux de commission par devis, prérempli selon compagnie + branche, et en faire la
seule source du montant prévisionnel porté par le contrat de chaque assuré. Jamais visible client/prescripteur.

## ÉTAT ACTUEL (audit lecture seule)
- `dossier_devis.taux_commission` existe déjà, mais n'est saisissable qu'au moment de la **création** d'un devis
  (formulaire), pas modifiable ensuite ; affiché en simple badge « Commission X % » dans le comparatif.
- Aucun préremplissage : le barème cabinet (`commission_bareme`, niveaux branche/compagnie, défaut emprunteur
  5 % de l'économie) n'est pas branché sur le formulaire de devis.
- `contrat-depuis-dossier.server.ts` recopie `devis.taux_commission` dans `contrats.commission_cabinet_taux`,
  **mais avec une incohérence d'unité** : le devis stocke un pourcentage (5) et la fiche contrat attend une
  fraction (0,05). À corriger, sinon la commission est surévaluée ×100.
- La commission prévisionnelle (`commission_previsions`) est aujourd'hui calculée **indépendamment** dans
  `devoir-conseil-panel` à partir du barème, au niveau dossier, sans ligne par contrat : c'est le deuxième
  calcul que vous voulez supprimer. Le panneau de l'étape 11 lit déjà `commission_previsions.contrat_id`.
- Confidentialité : `dossier_devis` et `commission_previsions` sont staff-only en base (OK). En revanche
  `contrats` est lisible par le client et le bloc « Commissionnement » de la fiche contrat n'est pas réservé
  au staff → fuite possible du taux.

## MODIFICATION PROPOSÉE
1. **Étape 6 — taux par devis, éditable en place.** Sur chaque carte du comparatif (staff uniquement) :
   champ « Taux de commission (%) » + base (prime / économies) modifiable et enregistrable sans recréer le devis.
2. **Défaut compagnie + branche.** À la création comme à l'ouverture du champ, valeur préremplie via
   `resoudreRegle(commission_bareme, branche, compagnie)` — donc 5 % des économies en emprunteur — avec mention
   de l'origine (règle compagnie / règle branche / défaut cabinet). Toute modification manuelle prime.
3. **Source unique.** Au passage en contrat, chaque contrat d'assuré reçoit le taux du devis retenu
   (unité corrigée) et une ligne `commission_previsions` par `contrat_id` calculée depuis ce taux
   (assiette prime ou économies selon la base retenue, au prorata de la quotité de l'assuré).
   Le calcul indépendant du devoir de conseil n'est plus déclenché quand le devis porte un taux :
   il devient un simple repli quand aucun devis n'en porte.
4. **Confidentialité.** Le bloc « Commissionnement » de la fiche contrat et les montants prévisionnels sont
   réservés à admin/mandataire ; aucun affichage dans l'espace client, l'espace prescripteur ou les PDF client.

## DÉPENDANCES
`commission_bareme`, `dossier_devis`, `contrats`, `commission_previsions`, `commissions-bareme.ts`,
`commission-previsions.ts`, `contrat-depuis-dossier.server.ts`, `dossier-devis-panel.tsx`,
`devoir-conseil-panel.tsx`, `espace.contrats.$id.tsx`, panneau étape 11.

## IMPACT
- Migration légère : ajout de `dossier_devis.commission_base` (`prime` / `economie_realisee`) et
  `commission_source` (traçabilité : défaut barème ou saisie manuelle). Aucune donnée existante perdue.
- Comportement corrigé pour les nouveaux contrats ; les contrats déjà créés ne sont pas recalculés
  d'office (correction manuelle possible depuis la fiche contrat).
- Aucun changement sur le triage email, le cron, les accusés ou les garde-fous partenaires.

## TESTS
- Test unitaire : résolution du taux par défaut (compagnie > branche > défaut 5 % économies).
- Test unitaire : montant prévisionnel par assuré = taux du devis × assiette × quotité, unité fraction/%.
- Vérification interface : édition du taux sur un devis, passage en contrat, montant identique à l'étape 11
  et dans le module comptabilité ; absence totale d'affichage côté client/prescripteur.
- `tsgo --noEmit` + suite Vitest.

## VALEUR PRODUITE
Un seul taux, saisi là où l'offre est choisie, qui alimente sans recalcul la prévision comptable par assuré,
et une confidentialité de la rémunération garantie côté client comme côté apporteur.
