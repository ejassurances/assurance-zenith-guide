/**
 * AMORTISSEMENT DU PRÊT & DATE D'EFFET DE LA SUBSTITUTION (fonctions PURES).
 *
 * Objectif : rendre cohérents entre eux les quatre chiffres du recueil
 * emprunteur qui étaient jusqu'ici indépendants :
 *   capital emprunté / durée totale  ↔  capital restant dû / mois restants.
 *
 * Règles métier :
 *  - le capital restant dû et les mois restants s'apprécient TOUJOURS à la date
 *    d'effet prévue de la substitution ;
 *  - date d'effet par défaut = date de création du dossier + 3 mois (délai
 *    usuel de mise en place d'une substitution) ;
 *  - sauf mention contraire : une date d'effet communiquée par la compagnie
 *    (attestation, mail de l'assureur) prime sur le calcul par défaut ;
 *  - aucune valeur humaine n'est écrasée : ces fonctions calculent, elles
 *    n'écrivent pas.
 */

/** Mensualité d'un prêt à annuités constantes (hors assurance). */
export function mensualitePret(capital: number, tauxAnnuelPct: number, dureeMois: number): number | null {
  if (!(capital > 0) || !(dureeMois > 0)) return null;
  const i = (tauxAnnuelPct || 0) / 100 / 12;
  if (i <= 0) return capital / dureeMois;
  return (capital * i) / (1 - Math.pow(1 + i, -dureeMois));
}

/** Capital restant dû après `moisEcoules` échéances payées. */
export function capitalRestantDu(
  capital: number,
  tauxAnnuelPct: number,
  dureeMois: number,
  moisEcoules: number,
): number | null {
  if (!(capital > 0) || !(dureeMois > 0)) return null;
  const k = Math.min(Math.max(Math.round(moisEcoules), 0), dureeMois);
  const i = (tauxAnnuelPct || 0) / 100 / 12;
  if (i <= 0) return Math.max(0, capital * (1 - k / dureeMois));
  const m = mensualitePret(capital, tauxAnnuelPct, dureeMois)!;
  const f = Math.pow(1 + i, k);
  return Math.max(0, capital * f - m * ((f - 1) / i));
}

function jour(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Nombre de mois entiers écoulés entre deux dates (0 si ordre inversé). */
export function moisEntre(debut: string | Date | null, fin: string | Date | null): number | null {
  const a = jour(debut);
  const b = jour(fin);
  if (!a || !b) return null;
  let mois = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) mois -= 1;
  return Math.max(0, mois);
}

/** Date d'effet par défaut : création du dossier + 3 mois (format AAAA-MM-JJ). */
export function dateEffetSubstitutionParDefaut(dossierCreeLe: string | Date | null, moisDelai = 3): string | null {
  const d = jour(dossierCreeLe);
  if (!d) return null;
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + moisDelai, d.getUTCDate()));
  return r.toISOString().slice(0, 10);
}

export interface SituationPretEntree {
  capital?: number | null;
  taux_pret?: number | null;
  duree_mois?: number | null;
  /** Première échéance du prêt (offre de prêt / tableau d'amortissement). */
  date_premiere_echeance?: string | null;
  /** Date d'édition du document (offre/tableau) : point de départ du prêt si la première échéance est absente. */
  date_document?: string | null;
  /** Date d'effet communiquée par la compagnie, si elle existe. */
  date_effet?: string | null;
  /** Date de création du dossier (base du délai de 3 mois). */
  dossier_cree_le?: string | null;
}

export interface SituationPret {
  /** Date d'effet retenue pour la substitution. */
  date_effet: string | null;
  /** "compagnie" = date communiquée, "defaut" = création + 3 mois. */
  origine_date_effet: "compagnie" | "defaut" | "inconnue";
  /**
   * Date de début du prêt : première échéance du tableau d'amortissement ou de
   * l'offre de prêt, sinon date d'édition du document.
   */
  debut_pret: string | null;
  /** "echeance" = début lu sur le document, "document" = date d'édition, "dossier" = création du dossier. */
  origine_debut_pret: "echeance" | "document" | "dossier" | "inconnue";
  mois_ecoules: number | null;
  mois_restants: number | null;
  capital_restant_du: number | null;
  mensualite: number | null;
}

/** Situation du prêt à la date d'effet prévue de la substitution. */
export function situationPret(e: SituationPretEntree): SituationPret {
  const dateCompagnie = jour(e.date_effet) ? String(e.date_effet).slice(0, 10) : null;
  const dateDefaut = dateEffetSubstitutionParDefaut(e.dossier_cree_le ?? null);
  const dateEffet = dateCompagnie ?? dateDefaut;

  const capital = Number(e.capital) > 0 ? Number(e.capital) : null;
  const duree = Number(e.duree_mois) > 0 ? Math.round(Number(e.duree_mois)) : null;
  const taux = Number.isFinite(Number(e.taux_pret)) ? Number(e.taux_pret) : 0;

  // Point de départ du prêt : première échéance si elle figure sur le
  // document, sinon date d'édition du document, sinon création du dossier.
  const echeance = jour(e.date_premiere_echeance) ? String(e.date_premiere_echeance).slice(0, 10) : null;
  const edition = jour(e.date_document) ? String(e.date_document).slice(0, 10) : null;
  const creation = jour(e.dossier_cree_le) ? String(e.dossier_cree_le).slice(0, 10) : null;
  const debutPret = echeance ?? edition ?? creation;
  const origineDebut: SituationPret["origine_debut_pret"] = echeance
    ? "echeance"
    : edition
      ? "document"
      : creation
        ? "dossier"
        : "inconnue";
  const ecoules = moisEntre(debutPret, dateEffet);
  const moisRestants = duree !== null && ecoules !== null ? Math.max(0, duree - ecoules) : null;
  const crd =
    capital !== null && duree !== null && ecoules !== null
      ? Math.round(capitalRestantDu(capital, taux, duree, ecoules)!)
      : null;

  return {
    date_effet: dateEffet,
    origine_date_effet: dateCompagnie ? "compagnie" : dateDefaut ? "defaut" : "inconnue",
    debut_pret: debutPret,
    origine_debut_pret: origineDebut,
    mois_ecoules: ecoules,
    mois_restants: moisRestants,
    capital_restant_du: crd,
    mensualite: capital !== null && duree !== null ? Math.round(mensualitePret(capital, taux, duree)! * 100) / 100 : null,
  };
}

/**
 * Contrôles de cohérence du recueil emprunteur. Aucune correction automatique :
 * les écarts sont signalés pour arbitrage humain.
 */
export function incoherencesPret(
  recueil: Record<string, unknown> | null | undefined,
  dossierCreeLe?: string | null,
  /** Date d'édition du document de prêt : même base de calcul que l'affichage. */
  dateDocument?: string | null,
): string[] {
  const r = recueil ?? {};
  const nb = (k: string): number | null => {
    const n = Number(r[k]);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const alertes: string[] = [];
  const capital = nb("capital");
  const duree = nb("duree_mois");
  const crd = nb("capital_restant_du");
  const restants = nb("mois_restants");

  if (capital !== null && crd !== null && crd > capital)
    alertes.push("Le capital restant dû dépasse le capital emprunté.");
  if (duree !== null && restants !== null && restants > duree)
    alertes.push("Les mois restants dépassent la durée du prêt.");

  const calcul = situationPret({
    capital,
    taux_pret: nb("taux_pret"),
    duree_mois: duree,
    date_premiere_echeance: typeof r["date_premiere_echeance"] === "string" ? (r["date_premiere_echeance"] as string) : null,
    date_document: dateDocument ?? null,
    date_effet: typeof r["date_effet"] === "string" ? (r["date_effet"] as string) : null,
    dossier_cree_le: dossierCreeLe ?? null,
  });

  if (calcul.capital_restant_du !== null && crd !== null) {
    const ecart = Math.abs(crd - calcul.capital_restant_du) / calcul.capital_restant_du;
    if (ecart > 0.05)
      alertes.push(
        `Capital restant dû saisi (${Math.round(crd).toLocaleString("fr-FR")} €) éloigné du calcul d'amortissement (${calcul.capital_restant_du.toLocaleString("fr-FR")} €).`,
      );
  }
  if (calcul.mois_restants !== null && restants !== null && Math.abs(restants - calcul.mois_restants) > 2)
    alertes.push(`Mois restants saisis (${restants}) différents du calcul (${calcul.mois_restants}).`);

  return alertes;
}
