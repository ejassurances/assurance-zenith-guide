/**
 * Variante d'assiette de cotisation des produits emprunteur.
 *
 * Règle catalogue du cabinet : un même contrat proposé en capital initial (CI)
 * et en capital restant dû (CRD) constitue DEUX produits distincts, avec des
 * tarifications distinctes. Ils ne doivent jamais être fusionnés ni considérés
 * comme un doublon l'un de l'autre.
 */

export type VarianteCapital = "CI" | "CRD";

const cle = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Variante déduite d'un libellé (nom de produit, de fichier, référence), sinon null. */
export function varianteCapital(libelle: string | null | undefined): VarianteCapital | null {
  if (!libelle) return null;
  const n = cle(libelle);
  if (/\bcrd\b|capital restant/.test(n)) return "CRD";
  if (/\bci\b|capital initial/.test(n)) return "CI";
  return null;
}

/** Libellé lisible de la variante, pour l'affichage catalogue. */
export function libelleVariante(v: VarianteCapital): string {
  return v === "CRD" ? "CRD — capital restant dû" : "CI — capital initial";
}

/**
 * Deux produits sont-ils tarifairement équivalents ?
 * Faux dès que l'un est en CI et l'autre en CRD (tarifications différentes).
 */
export function memeVariante(a: string | null | undefined, b: string | null | undefined): boolean {
  const va = varianteCapital(a);
  const vb = varianteCapital(b);
  if (va === null || vb === null) return true;
  return va === vb;
}
