# Module comptabilité — partie double + PCG

Livré en 4 lots séquentiels. Chaque lot est utilisable indépendamment.

## Lot 1 — Fondations comptables (PCG + écritures)

**Base de données** (migration Supabase) :

- `plan_comptable` : comptes PCG (numero, libelle, classe 1-7, type, parent_id, actif). Pré-rempli avec ~40 comptes utiles au courtage (411 clients, 401 fournisseurs, 512 banque, 530 caisse, 606x achats, 613 locations, 622x commissions/honoraires, 626 postes, 641 salaires, 645 charges sociales, 706 prestations, 708 produits annexes, 44566/44571 TVA, etc.).
- `journaux` : AC (achats), VE (ventes), BQ (banque), OD (opérations diverses), NDF (notes de frais).
- `ecritures` : entête (date, journal, numero_piece, libelle, mandataire_id nullable, statut brouillon/validé, exercice).
- `ecritures_lignes` : ligne (compte_numero, debit, credit, libelle, tiers_id nullable, mandataire_id nullable). Contrainte : somme débits = somme crédits par écriture.
- `exercices` : période comptable (date_debut, date_fin, cloturé).
- `tiers` : fournisseurs et clients tiers (nom, siret, adresse, compte_auxiliaire).

**RLS** :
- Admin : CRUD complet.
- Mandataire : lecture seule des écritures où `mandataire_id = auth.uid()`, création sur journal NDF pour ses propres charges.

**UI** `/espace/comptabilite/journaux` : saisie d'écriture (admin), vue grand livre par compte, balance, journal centralisateur.

## Lot 2 — Factures d'achat + OCR

- Table `factures_achat` : fournisseur, date, numero, montant_ht, tva, ttc, compte_charge, pdf_url, statut, ecriture_id, mandataire_id nullable.
- Bucket privé `factures-achat` (RLS : admin tout, mandataire ses fichiers).
- Composant upload PDF → server function `parseFactureAchat` qui appelle Lovable AI (`google/gemini-3.6-flash`) avec le PDF en `input_file` et un schéma Zod (fournisseur, siret, date, HT, TVA, TTC, catégorie suggérée). L'utilisateur valide/corrige avant enregistrement.
- À la validation : création automatique de l'écriture (débit 6xx + 44566 TVA / crédit 401 fournisseur) et pièce jointe stockée.
- Vue liste : filtres période/fournisseur/statut, export CSV.

## Lot 3 — Bulletins de commission

**Bordereaux compagnies (entrants)** :
- Table `bordereaux_commissions` étendue : upload PDF du bordereau reçu, rapprochement manuel avec les `contrat_echeances` (statut « encaissé »).
- Écriture auto générée : débit 512 banque / crédit 706 commissions cabinet.

**Bulletins mandataires (sortants)** :
- Table `bulletins_commission` : mandataire_id, periode, lignes (rétrocessions dues), total_ht, tva (si mandataire assujetti), total_ttc, statut, pdf_url.
- Génération PDF via `pdf-lib` côté serveur : en-tête cabinet, tableau des commissions (contrat, période, base, taux, montant), pied avec totaux et mentions légales.
- Envoi email au mandataire via Lovable AI Gateway (SMTP à définir) + stockage bucket privé `bulletins-mandataires`.
- Écriture auto : débit 622x rétrocessions / crédit 401 mandataire, puis débit 401 / crédit 512 au paiement.

## Lot 4 — États financiers + comptes mandataires

**Compte de résultat cabinet** `/espace/comptabilite/resultat` :
- Produits (classe 7) : commissions perçues, autres produits.
- Charges (classe 6) : achats, services extérieurs, rétrocessions mandataires, charges de personnel, impôts.
- Résultat net avec comparaison N-1, filtre par période, export PDF.

**Mini compte de résultat mandataire** `/espace/comptabilite` (vue mandataire) :
- Produits : ses commissions encaissées (via `paiements_partenaires`).
- Charges : ses saisies de notes de frais (journal NDF) — URSSAF, frais pro, abonnements, formation, etc.
- Résultat perso, export PDF mensuel/annuel.
- Rôle mandataire peut créer/modifier/supprimer ses propres écritures NDF uniquement.

## Détails techniques

- Toutes les fonctions SQL (validation équilibre débit/crédit, clôture exercice, calcul soldes) en `SECURITY DEFINER` avec `search_path = public` et `REVOKE` sur `PUBLIC`/`anon`.
- Séparation stricte des rôles via RLS et fonctions helper existantes (`has_role`, `current_user_role`).
- OCR via `document--parse_document` équivalent côté runtime : appel `fetch` gateway `google/gemini-3.6-flash` avec `input_file` + schéma structuré.
- PDF bulletins : `pdf-lib` (compatible Workers), template avec logo EJ Partners.
- Pas de FEC export dans ce chantier — ajouté ensuite si besoin.
- Pas de vraie compta multi-devises, TVA simplifiée (taux fixes 20/10/5.5/0).

## Ordre d'exécution

Je propose de démarrer par le **Lot 1** (fondations) car tous les autres en dépendent. Une fois validé, j'enchaîne Lot 2 (factures+OCR), puis Lot 3 (bulletins), puis Lot 4 (états).

Confirmez-vous cet ordre, ou souhaitez-vous prioriser autrement (par ex. Lot 3 bulletins avant OCR) ?