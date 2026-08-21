/**
 * Étiquettes Gmail réellement utilisées par le cabinet.
 *
 * Nouvelle règle (validée par la direction) : arborescence À PLAT, sans
 * sous-libellé de service. Cinq étiquettes seulement :
 *
 *  - « Direction Commerciale » : tout ce qui concerne les clients, les
 *    partenaires assureurs et le groupement.
 *  - « Direction Financiere » : factures, comptabilité, commissions.
 *  - « Direction Conformite » : toute la conformité du cabinet.
 *  - « Archive » : mail traité, plus rien à faire.
 *  - « A_Valider » : mail dont la réponse / le traitement attend la validation
 *    du dirigeant (dernière étiquette du circuit).
 *
 * Les clés techniques historiques sont conservées (code appelant inchangé) :
 * plusieurs clés pointent désormais vers la même étiquette. Le passage d'étape
 * ne dépend jamais du statut lu / non lu du message et ne le modifie jamais.
 *
 * Module client-safe : réutilisé côté serveur (gmail.server) et côté UI.
 */
const DIRECTION_COMMERCIALE = "Direction Commerciale";
const DIRECTION_FINANCIERE = "Direction Financiere";
const DIRECTION_CONFORMITE = "Direction Conformite";
const ARCHIVE = "Archive";
const A_VALIDER = "A_Valider";

export const LABELS_CABINET = {
  // Direction Commerciale : clients, partenaires assureurs, groupement.
  gc_a_traiter: DIRECTION_COMMERCIALE,
  sc_a_traiter: DIRECTION_COMMERCIALE,
  sp_a_traiter: DIRECTION_COMMERCIALE,
  gc_attente_validation: A_VALIDER,
  sc_attente_validation: A_VALIDER,
  sp_attente_validation: A_VALIDER,
  gc_archive: ARCHIVE,
  sc_archive: ARCHIVE,
  sp_archive: ARCHIVE,
  // Direction Financière : achats / factures et commissions.
  achat_a_traiter: DIRECTION_FINANCIERE,
  achat_archive: ARCHIVE,
  commission_a_traiter: DIRECTION_FINANCIERE,
  commission_archive: ARCHIVE,
  // Direction Conformité : réclamations et veille réglementaire.
  rec_a_traiter: DIRECTION_CONFORMITE,
  rec_attente_validation: A_VALIDER,
  rec_archive: ARCHIVE,
  veille_a_traiter: DIRECTION_CONFORMITE,
  veille_archive: ARCHIVE,
  veille_non_impactee: ARCHIVE,
  // Publicité / accusés de réception : classés directement en archive.
  a_ignorer: ARCHIVE,
} as const;

export type LabelCabinet = keyof typeof LABELS_CABINET;

/** Les trois directions (étiquettes de travail). */
export const LABELS_DIRECTIONS = [
  DIRECTION_COMMERCIALE,
  DIRECTION_FINANCIERE,
  DIRECTION_CONFORMITE,
] as const;

export { DIRECTION_COMMERCIALE, DIRECTION_FINANCIERE, DIRECTION_CONFORMITE, ARCHIVE, A_VALIDER };

/**
 * Seules étiquettes que le code est autorisé à créer. Les cinq étiquettes de la
 * nouvelle arborescence sont créables (elles remplacent l'ancienne
 * arborescence) ; toute autre étiquette doit exister dans Gmail, sinon l'erreur
 * remonte (jamais de doublon).
 */
export const LABELS_CREABLES: readonly string[] = [
  DIRECTION_COMMERCIALE,
  DIRECTION_FINANCIERE,
  DIRECTION_CONFORMITE,
  ARCHIVE,
  A_VALIDER,
];
