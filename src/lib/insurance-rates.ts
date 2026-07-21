// Table de taux assurance emprunteur — modifiable facilement.
// Taux exprimés en % (0.32 = 0.32%).
// - taux_groupe : contrat bancaire, appliqué sur le CAPITAL INITIAL (non dégressif)
// - taux_courtier : contrat délégué, appliqué sur le CAPITAL RESTANT DÛ (dégressif)

export type AgeBracket = {
  minAge: number; // inclus
  maxAge: number; // exclus
  taux_groupe: number; // % du capital initial / an
  taux_courtier: number; // % du capital restant dû / an
};

export const RATE_TABLE: AgeBracket[] = [
  { minAge: 20, maxAge: 30, taux_groupe: 0.32, taux_courtier: 0.12 },
  { minAge: 30, maxAge: 40, taux_groupe: 0.42, taux_courtier: 0.18 },
  { minAge: 40, maxAge: 50, taux_groupe: 0.6, taux_courtier: 0.3 },
  { minAge: 50, maxAge: 60, taux_groupe: 0.85, taux_courtier: 0.45 },
  { minAge: 60, maxAge: 70, taux_groupe: 1.1, taux_courtier: 0.7 },
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
 * Coût total contrat groupe : taux appliqué sur le capital INITIAL chaque année,
 * pendant toute la durée du prêt (non dégressif).
 */
export function coutTotalGroupe(
  capitalInitial: number,
  duree: number,
  tauxAnnuelPct: number,
): number {
  return capitalInitial * (tauxAnnuelPct / 100) * duree;
}

/**
 * Coût total contrat courtier délégué : taux appliqué sur le CAPITAL RESTANT DÛ
 * année par année (dégressif). Amortissement approché linéaire (constant),
 * suffisant pour une estimation avant devis.
 */
export function coutTotalCourtier(
  capitalInitial: number,
  duree: number,
  tauxAnnuelPct: number,
): number {
  const taux = tauxAnnuelPct / 100;
  let total = 0;
  for (let annee = 0; annee < duree; annee++) {
    // capital restant dû moyen sur l'année (amortissement linéaire)
    const restantDebut = capitalInitial * (1 - annee / duree);
    const restantFin = capitalInitial * (1 - (annee + 1) / duree);
    const restantMoyen = (restantDebut + restantFin) / 2;
    total += restantMoyen * taux;
  }
  return total;
}
