/**
 * Étiquettes Gmail du cabinet — structure simplifiée, entièrement À PLAT.
 *
 * 3 libellés de DIRECTION (posés au premier tri) :
 *  - « Direction Commerciale » : clients, partenaires assureurs, groupement.
 *  - « Direction Financiere » : factures, comptabilité, commissions.
 *  - « Direction Juridique et Conformite » : conformité et juridique du cabinet.
 *
 * 2 libellés d'ÉTAT, partagés par les trois directions, posés EN PLUS du
 * libellé de direction (jamais imbriqués) :
 *  - « A valider » : le traitement attend la validation du dirigeant.
 *  - « Archives » : mail traité (remplace « A valider » s'il était posé).
 *
 * Un mail portant seulement son libellé de direction est implicitement
 * « à traiter » : aucun troisième état n'existe.
 *
 * Les clés techniques historiques sont conservées (code appelant inchangé) :
 * chaque clé décrit désormais un couple (direction, état). Le passage d'état ne
 * dépend jamais du statut lu / non lu du message et ne le modifie jamais.
 *
 * Module client-safe : réutilisé côté serveur (gmail.server) et côté UI.
 */
const DIRECTION_COMMERCIALE = "Direction Commerciale";
const DIRECTION_FINANCIERE = "Direction Financiere";
const DIRECTION_CONFORMITE = "Direction Juridique et Conformite";
const ARCHIVE = "Archives";
const A_VALIDER = "A valider";

/** Les deux libellés d'état, partagés entre toutes les directions. */
export const LABELS_ETATS = [A_VALIDER, ARCHIVE] as const;

type Couple = { direction: string | null; etat: string | null };

const commercial = (etat: string | null): Couple => ({ direction: DIRECTION_COMMERCIALE, etat });
const financier = (etat: string | null): Couple => ({ direction: DIRECTION_FINANCIERE, etat });
const conforme = (etat: string | null): Couple => ({ direction: DIRECTION_CONFORMITE, etat });

/**
 * Couple (direction, état) de chaque clé technique. Poser une clé revient à
 * poser DEUX libellés indépendants (le libellé de direction et, le cas échéant,
 * le libellé d'état) — jamais un libellé composé.
 */
export const COUPLES_LABELS = {
  // Direction Commerciale : clients, partenaires assureurs, groupement.
  gc_a_traiter: commercial(null),
  sc_a_traiter: commercial(null),
  sp_a_traiter: commercial(null),
  gc_attente_validation: commercial(A_VALIDER),
  sc_attente_validation: commercial(A_VALIDER),
  sp_attente_validation: commercial(A_VALIDER),
  gc_archive: commercial(ARCHIVE),
  sc_archive: commercial(ARCHIVE),
  sp_archive: commercial(ARCHIVE),
  // Direction Financière : achats / factures et commissions.
  achat_a_traiter: financier(null),
  achat_archive: financier(ARCHIVE),
  commission_a_traiter: financier(null),
  commission_archive: financier(ARCHIVE),
  // Direction Juridique et Conformité : réclamations et veille réglementaire.
  rec_a_traiter: conforme(null),
  rec_attente_validation: conforme(A_VALIDER),
  rec_archive: conforme(ARCHIVE),
  veille_a_traiter: conforme(null),
  veille_archive: conforme(ARCHIVE),
  veille_non_impactee: conforme(ARCHIVE),
  // Publicité / accusés de réception : archivés directement, sans direction.
  a_ignorer: { direction: null, etat: ARCHIVE },
} as const satisfies Record<string, Couple>;

export type LabelCabinet = keyof typeof COUPLES_LABELS;

/**
 * Libellé principal d'une clé (état s'il existe, sinon direction) : conservé
 * pour le code de lecture / recherche par libellé.
 */
export const LABELS_CABINET = Object.fromEntries(
  Object.entries(COUPLES_LABELS).map(([cle, c]) => [cle, c.etat ?? c.direction ?? ARCHIVE]),
) as Record<LabelCabinet, string>;

/** Les trois directions (libellés de travail). */
export const LABELS_DIRECTIONS = [
  DIRECTION_COMMERCIALE,
  DIRECTION_FINANCIERE,
  DIRECTION_CONFORMITE,
] as const;

export { DIRECTION_COMMERCIALE, DIRECTION_FINANCIERE, DIRECTION_CONFORMITE, ARCHIVE, A_VALIDER };

/**
 * Seuls libellés que le code est autorisé à créer : les 3 directions et les
 * 2 états partagés. Tout autre libellé doit exister dans Gmail, sinon l'erreur
 * remonte (jamais de doublon).
 */
export const LABELS_CREABLES: readonly string[] = [
  DIRECTION_COMMERCIALE,
  DIRECTION_FINANCIERE,
  DIRECTION_CONFORMITE,
  ARCHIVE,
  A_VALIDER,
];

