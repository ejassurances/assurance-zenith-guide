/**
 * Canal de souscription réellement disponible pour un dossier.
 *
 * Un dossier ne peut être transmis « par API » que si son devis retenu provient
 * d'un partenaire connecté (parcours Neoliane / SimulAssur). Dans tous les
 * autres cas (devis saisi, importé, reçu en PDF), la souscription est réalisée
 * hors API et l'adhésion est enregistrée directement dans le CRM.
 */

export type CanalSouscription = "api_partenaire" | "externe";

/** Origines de devis issues d'un partenaire connecté. */
export const SOURCES_API = ["api", "neoliane", "simulassur"] as const;

export interface EntreeCanal {
  /** Origine du devis retenu (ou des devis du dossier, à défaut de retenu). */
  sources: (string | null | undefined)[];
  /** Un parcours partenaire (Neoliane / SimulAssur) est relié au dossier. */
  parcoursPartenaire: boolean;
}

export function estSourceApi(source: string | null | undefined): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  return SOURCES_API.some((a) => s.includes(a));
}

export function canalSouscription(entree: EntreeCanal): CanalSouscription {
  if (entree.parcoursPartenaire) return "api_partenaire";
  return entree.sources.some(estSourceApi) ? "api_partenaire" : "externe";
}

export function labelCanal(canal: CanalSouscription): string {
  return canal === "api_partenaire"
    ? "Devis partenaire connecté (transmission API possible)"
    : "Devis externe (souscription hors API)";
}

/** Modes de transmission possibles pour une souscription hors API. */
export const MODES_HORS_API = [
  { code: "intranet", label: "Intranet / extranet compagnie" },
  { code: "email", label: "Email au service souscription" },
  { code: "courrier", label: "Courrier postal" },
  { code: "agence", label: "Remise en agence / inspecteur" },
] as const;

export type ModeHorsApi = (typeof MODES_HORS_API)[number]["code"];

export function labelModeHorsApi(mode: string): string {
  return MODES_HORS_API.find((m) => m.code === mode)?.label ?? mode;
}
