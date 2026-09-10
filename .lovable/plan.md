# Référence assureur au niveau du contrat individuel

## DOMAINE
D5 — Portefeuille & contrats (avec D1 relation client pour le rattachement des e-mails).

## MODULE / SOUS-MODULE
Parcours emprunteur (étape 11 « Analyse et décision ») · Contrats · Rapprochement e-mails · Commissions prévisionnelles.

## OBJECTIF
Un dossier = un prêt (documents communs). Un assuré = un contrat auprès de la compagnie, avec sa propre référence assureur, son propre statut, sa propre commission prévisionnelle et son propre suivi réglementaire.

## ÉTAT ACTUEL (audit lecture seule)
- La création de contrat produit **déjà** un contrat par assuré du prêt (quotité et prime au prorata), via le passage du dossier en « contrat validé » ou en retour compagnie. Rien à refaire sur ce point, seulement à sécuriser et à rendre visible.
- Les références assureur sont stockées uniquement au niveau dossier ; une colonne « rang de l'assuré » existe mais n'est jamais renseignée ni affichée.
- Le rapprochement des e-mails par référence retourne le **dossier**, jamais le contrat : un message concernant l'assuré A peut viser le dossier commun de A et B.
- La commission prévisionnelle et le suivi réglementaire sont déjà portés par contrat en base, mais l'écran d'étape 11 ne les montre qu'au niveau dossier.

## MODIFICATION PROPOSÉE
1. **Référence par contrat** : la référence assureur est rattachée à un contrat individuel (colonne contrat ajoutée, référence unique par contrat). Les références déjà saisies restent visibles au niveau dossier tant qu'aucun contrat n'est choisi.
2. **Écran étape 11** : le panneau des références liste les contrats du dossier (assuré, quotité, prime, statut) et impose de choisir l'assuré concerné avant d'enregistrer une référence. Ajout par contrat, suppression inchangée.
3. **Création automatique** : au passage en « validé » à l'étape 11, création d'un contrat par assuré (comportement existant), avec message clair indiquant le nombre de contrats créés et l'assuré de chacun. Idempotence conservée : aucun doublon si les contrats existent déjà.
4. **Rattachement des e-mails** : une référence citée dans un e-mail cible désormais le **contrat** correspondant (et son dossier parent). Si la référence est portée par un contrat, le mail se rattache à ce contrat précis ; si la référence est ambiguë ou absente, le mail reste « à qualifier » par un humain — aucune déduction par nom.
5. **Suivi par assuré** : sur l'étape 11, statut du contrat, commission prévisionnelle et documents réglementaires affichés ligne par ligne, pour qu'un assuré puisse être actif avant l'autre. Le prêt, la lettre de mission et le devoir de conseil restent communs au dossier.

## DÉPENDANCES
- Table des références externes (ajout d'un lien contrat), table contrats, résolveur de contexte e-mail, panneau étape 11, fonction de création de contrat depuis dossier.
- Aucune modification du système e-mail lui-même (cron, triage, accusés) ni des garde-fous partenaires.

## IMPACT
- Aucune perte de données : les références existantes sont conservées et pourront être affectées à un assuré.
- Le rattachement devient plus strict : moins de rattachements automatiques erronés, un peu plus de mails « à qualifier » au début, le temps que les références par assuré soient saisies.

## TESTS
- Typecheck complet.
- Tests unitaires du résolveur : référence de contrat → contrat A uniquement, jamais l'assuré B ; référence inconnue → à qualifier.
- Vérification sur un dossier réel à deux emprunteurs : deux contrats, deux références distinctes, statuts indépendants.

## VALEUR PRODUITE
Fin des confusions entre co-emprunteurs : chaque assuré a son contrat, sa référence compagnie, son suivi et sa commission, tout en gardant un seul dossier de prêt côté conseil.
