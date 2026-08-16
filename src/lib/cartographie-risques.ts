/* Cartographie des risques LCB-FT — calcul du risque résiduel (client-safe,
   miroir de la fonction SQL `calculer_risque_residuel`). */

export type NiveauResiduel = "eleve" | "moyen" | "faible";

const MULTIPLICATEUR: Record<number, number> = { 1: 1, 2: 0.66, 3: 0.33 };

export function risqueResiduel(
  probabilite: number,
  impact: number,
  niveauMaitrise: number,
): NiveauResiduel {
  const valeur = probabilite * impact * (MULTIPLICATEUR[niveauMaitrise] ?? 1);
  if (valeur >= 8) return "eleve";
  if (valeur >= 3) return "moyen";
  return "faible";
}

/** Vrai si la dernière validation globale date de plus d'un an (ou n'existe pas). */
export function revisionAnnuelleDue(derniereValidation: string | null, maintenant = new Date()): boolean {
  if (!derniereValidation) return true;
  const limite = new Date(derniereValidation);
  limite.setFullYear(limite.getFullYear() + 1);
  return limite.getTime() < maintenant.getTime();
}
