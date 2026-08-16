/* Formation du personnel — thèmes et calcul de statut (client-safe). */

export type StatutFormation = "valide" | "a_renouveler" | "expiree";

export const THEMES_FORMATION = [
  "LCB-FT initiale",
  "LCB-FT continue",
  "RGPD",
  "DDA",
] as const;

/** Les formations continues LCB-FT expirent à +1 an. */
export function expirationParDefaut(theme: string, dateFormation: string): string | null {
  if (theme !== "LCB-FT continue") return null;
  const d = new Date(dateFormation);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Statut attendu : expirée si dépassée, à renouveler à moins de 30 jours. */
export function statutAttendu(dateExpiration: string | null, maintenant = new Date()): StatutFormation {
  if (!dateExpiration) return "valide";
  const reste = (new Date(dateExpiration).getTime() - maintenant.getTime()) / 86_400_000;
  if (reste < 0) return "expiree";
  if (reste <= 30) return "a_renouveler";
  return "valide";
}
