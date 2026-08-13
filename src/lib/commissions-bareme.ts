/**
 * Barème de commissions du cabinet (staff uniquement).
 *
 * Résolution : une règle de niveau « compagnie » pour une branche donnée
 * prévaut sur la règle « branche » correspondante ; à défaut, la règle
 * « branche » ; à défaut, la valeur par défaut codée ici.
 */
import { BRANCHES, type BrancheAssurance } from "@/lib/recueil-besoins-schemas";

export type NiveauRegle = "branche" | "compagnie";
export type TypeCommission = "fixe" | "pourcentage";
export type BaseCalcul = "prime" | "economie_realisee";

export interface RegleCommission {
  id?: string;
  niveau: NiveauRegle;
  branche: string;
  compagnie_id: string | null;
  type: TypeCommission;
  montant_fixe: number | null;
  taux_pourcentage: number | null;
  base_calcul: BaseCalcul;
  notes: string | null;
}

export const BRANCHES_COMMISSION: { value: BrancheAssurance; label: string }[] = BRANCHES.map((b) => ({
  value: b.value,
  label: b.label,
}));

export const LIBELLE_BASE: Record<BaseCalcul, string> = {
  prime: "Prime",
  economie_realisee: "Économie réalisée",
};

/** Défaut emprunteur : 5 % de l'économie réalisée, prélevé sur la 1re mensualité. */
export const DEFAUT_EMPRUNTEUR: Omit<RegleCommission, "branche"> = {
  niveau: "branche",
  compagnie_id: null,
  type: "pourcentage",
  montant_fixe: null,
  taux_pourcentage: 5,
  base_calcul: "economie_realisee",
  notes: "Défaut cabinet : 5 % de l'économie réalisée, prélevé sur la première mensualité.",
};

/** Défaut toutes autres branches : 20 € fixes sur la prime. */
export const DEFAUT_GENERIQUE: Omit<RegleCommission, "branche"> = {
  niveau: "branche",
  compagnie_id: null,
  type: "fixe",
  montant_fixe: 20,
  taux_pourcentage: null,
  base_calcul: "prime",
  notes: "Défaut cabinet : 20 € par contrat.",
};

export function regleParDefaut(branche: string): RegleCommission {
  const base = branche === "emprunteur" ? DEFAUT_EMPRUNTEUR : DEFAUT_GENERIQUE;
  return { ...base, branche };
}

export type SourceRegle = "compagnie" | "branche" | "defaut";

export function resoudreRegle(
  regles: RegleCommission[],
  branche: string | null,
  compagnieId: string | null,
): { regle: RegleCommission; source: SourceRegle } {
  const b = branche ?? "iard";
  if (compagnieId) {
    const spec = regles.find(
      (r) => r.niveau === "compagnie" && r.branche === b && r.compagnie_id === compagnieId,
    );
    if (spec) return { regle: spec, source: "compagnie" };
  }
  const parBranche = regles.find((r) => r.niveau === "branche" && r.branche === b);
  if (parBranche) return { regle: parBranche, source: "branche" };
  return { regle: regleParDefaut(b), source: "defaut" };
}

/** Montant de commission selon la règle applicable. */
export function calculerCommission(
  regle: RegleCommission,
  bases: { prime?: number | null; economie?: number | null },
): number {
  if (regle.type === "fixe") return Number(regle.montant_fixe ?? 0);
  const assiette = regle.base_calcul === "economie_realisee" ? bases.economie : bases.prime;
  if (assiette == null) return 0;
  return (Number(assiette) * Number(regle.taux_pourcentage ?? 0)) / 100;
}

export function decrireRegle(regle: RegleCommission): string {
  return regle.type === "fixe"
    ? `${Number(regle.montant_fixe ?? 0).toLocaleString("fr-FR")} € fixes`
    : `${Number(regle.taux_pourcentage ?? 0).toLocaleString("fr-FR")} % · ${LIBELLE_BASE[regle.base_calcul]}`;
}

export const LIBELLE_SOURCE: Record<SourceRegle, string> = {
  compagnie: "Règle compagnie",
  branche: "Règle branche",
  defaut: "Défaut cabinet",
};

/** Branche déduite d'un contrat (l'emprunteur est porté par un booléen dédié). */
export function brancheContrat(c: { is_emprunteur?: boolean | null; type_assurance?: string | null }): string {
  if (c.is_emprunteur) return "emprunteur";
  return c.type_assurance ?? "iard";
}

export const fmtEuros = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);
