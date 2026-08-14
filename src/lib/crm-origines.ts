/* Référentiel CRM : origines de prospect */

export const ORIGINES = [
  { key: "internet", label: "Internet" },
  { key: "assurlead", label: "Assurlead" },
  { key: "telephone", label: "Téléphone" },
  { key: "apporteur", label: "Apporteur" },
  { key: "reseau", label: "Réseau" },
  { key: "parrainage", label: "Parrainage" },
  { key: "recommandation", label: "Recommandation" },
  { key: "contact_perso", label: "Contact perso" },
  { key: "autre", label: "Autre" },
] as const;

export type OrigineKey = (typeof ORIGINES)[number]["key"];

export const ORIGINE_KEYS = ORIGINES.map((o) => o.key) as unknown as [OrigineKey, ...OrigineKey[]];

export function origineLabel(key: string | null | undefined) {
  if (!key) return null;
  return ORIGINES.find((o) => o.key === key)?.label ?? key;
}

/** Origines nécessitant le rattachement au client parrain / recommandeur. */
export function origineAvecClientSource(key: string | null | undefined) {
  return key === "parrainage" || key === "recommandation";
}

export function labelClientOrigine(key: string | null | undefined) {
  return key === "parrainage" ? "Parrainé par" : "Recommandé par";
}
