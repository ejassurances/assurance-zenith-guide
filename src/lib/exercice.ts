/**
 * Premier exercice comptable du cabinet.
 *
 * Le premier exercice est 2026 : tout mouvement antérieur (donc toutes les
 * pièces datées de 2025 ou avant) n'entre PAS dans la comptabilité du cabinet
 * — ni dans le livre des achats, ni dans le livre des recettes, ni dans les
 * totaux fournisseurs, ni dans les exports (CSV / FEC).
 *
 * Ces pièces restent conservées en base (traçabilité, rapprochement e-mail),
 * mais sont exclues de tout cumul comptable.
 */
export const PREMIER_EXERCICE = 2026;

/** Première date incluse dans la comptabilité (format ISO). */
export const DEBUT_COMPTABILITE = `${PREMIER_EXERCICE}-01-01`;

/** Vrai si la date (ISO « AAAA-MM-JJ » ou complète) relève d'un exercice comptable. */
export function dansExerciceComptable(date: string | null | undefined): boolean {
  if (!date) return false;
  return date.slice(0, 10) >= DEBUT_COMPTABILITE;
}

/** Vrai si l'année (nombre ou chaîne) est un exercice comptable du cabinet. */
export function anneeComptable(annee: string | number): boolean {
  return Number(annee) >= PREMIER_EXERCICE;
}
