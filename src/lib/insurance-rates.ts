// Table de taux assurance emprunteur — modifiable facilement.
// Taux exprimés en % (0.32 = 0.32%).
// - taux_groupe : contrat bancaire, appliqué sur le CAPITAL INITIAL (non dégressif)
// - taux_courtier : contrat délégué, appliqué sur le CAPITAL RESTANT DÛ (dégressif)

export type ModeCalcul = "capital_initial" | "capital_restant_du";

export type AgeBracket = {
  minAge: number; // inclus
  maxAge: number; // exclus
  taux_groupe: number; // % / an
  taux_courtier: number; // % / an
};

// Mode de calcul par catégorie (modifiable indépendamment).
export const MODE_CALCUL_GROUPE: ModeCalcul = "capital_initial";
export const MODE_CALCUL_COURTIER: ModeCalcul = "capital_restant_du";

export const RATE_TABLE: AgeBracket[] = [
  { minAge: 20, maxAge: 30, taux_groupe: 0.2, taux_courtier: 0.1 },
  { minAge: 30, maxAge: 40, taux_groupe: 0.3, taux_courtier: 0.15 },
  { minAge: 40, maxAge: 50, taux_groupe: 0.4, taux_courtier: 0.2 },
  { minAge: 50, maxAge: 60, taux_groupe: 0.55, taux_courtier: 0.3 },
  { minAge: 60, maxAge: 70, taux_groupe: 0.8, taux_courtier: 0.5 },
];

// Surprime fumeur appliquée aux deux catégories (points de %).
export const SURPRIME_FUMEUR = 0.08;

export function getRatesForAge(age: number): {
  taux_groupe: number;
  taux_courtier: number;
} {
  const bracket =
    RATE_TABLE.find((b) => age >= b.minAge && age < b.maxAge) ??
    RATE_TABLE[RATE_TABLE.length - 1];
  return {
    taux_groupe: bracket.taux_groupe,
    taux_courtier: bracket.taux_courtier,
  };
}

/**
 * Coût total assurance emprunteur : taux appliqué sur le CAPITAL RESTANT DÛ
 * année par année (dégressif). Amortissement approché linéaire (constant),
 * suffisant pour une estimation avant devis.
 */
function coutTotalSurCapitalRestantDu(
  capitalInitial: number,
  duree: number,
  tauxAnnuelPct: number,
): number {
  const taux = tauxAnnuelPct / 100;
  let total = 0;
  for (let annee = 0; annee < duree; annee++) {
    const restantDebut = capitalInitial * (1 - annee / duree);
    const restantFin = capitalInitial * (1 - (annee + 1) / duree);
    const restantMoyen = (restantDebut + restantFin) / 2;
    total += restantMoyen * taux;
  }
  return total;
}

function coutTotalSurCapitalInitial(
  capitalInitial: number,
  duree: number,
  tauxAnnuelPct: number,
): number {
  return capitalInitial * (tauxAnnuelPct / 100) * duree;
}

/**
 * Coût total contrat groupe (banque) : appliqué sur le CAPITAL INITIAL, non dégressif.
 */
export function coutTotalGroupe(
  capitalInitial: number,
  duree: number,
  tauxAnnuelPct: number,
): number {
  return MODE_CALCUL_GROUPE === "capital_initial"
    ? coutTotalSurCapitalInitial(capitalInitial, duree, tauxAnnuelPct)
    : coutTotalSurCapitalRestantDu(capitalInitial, duree, tauxAnnuelPct);
}

/**
 * Coût total contrat délégué (courtier) : appliqué sur le CAPITAL RESTANT DÛ (dégressif).
 */
export function coutTotalCourtier(
  capitalInitial: number,
  duree: number,
  tauxAnnuelPct: number,
): number {
  return MODE_CALCUL_COURTIER === "capital_initial"
    ? coutTotalSurCapitalInitial(capitalInitial, duree, tauxAnnuelPct)
    : coutTotalSurCapitalRestantDu(capitalInitial, duree, tauxAnnuelPct);
}
