import { describe, expect, it } from "vitest";
import { echeancierComparatif } from "./echeancier-comparatif";

const base = {
  capital: 200000,
  taux_pret: 3.4,
  duree_mois: 240,
  date_premiere_echeance: "2024-01-05",
  date_effet: "2026-01-05",
  assurance_initiale_mensuelle: 60,
  assurance_nouvelle_mensuelle: 25,
  type_cotisation: "CI" as const,
};

describe("echeancierComparatif", () => {
  it("ne produit rien si une donnée essentielle manque", () => {
    expect(echeancierComparatif({ ...base, assurance_nouvelle_mensuelle: null }).lignes).toHaveLength(0);
    expect(echeancierComparatif({ ...base, capital: null }).lignes).toHaveLength(0);
  });

  it("part de la date d'effet et couvre les mois restants", () => {
    const e = echeancierComparatif(base);
    expect(e.lignes).toHaveLength(216); // 240 - 24 mois écoulés
    expect(e.lignes[0]!.date).toBe("2026-01-05");
    expect(e.date_effet).toBe("2026-01-05");
  });

  it("intérêts + capital égalent la mensualité", () => {
    const l = echeancierComparatif(base).lignes[0]!;
    expect(l.interets + l.capital).toBeCloseTo(l.echeance, 1);
  });

  it("CI : cotisation constante et différentiel négatif quand notre offre est moins chère", () => {
    const e = echeancierComparatif(base);
    expect(e.lignes.every((l) => l.assurance_nouvelle === 25)).toBe(true);
    expect(e.total_differentiel).toBeLessThan(0);
    expect(e.lignes[0]!.total_nouveau).toBeLessThan(e.lignes[0]!.total_actuel);
  });

  it("CRD : cotisation dégressive, moyenne conservée", () => {
    const e = echeancierComparatif({ ...base, type_cotisation: "CRD" });
    const premiere = e.lignes[0]!.assurance_nouvelle;
    const derniere = e.lignes[e.lignes.length - 1]!.assurance_nouvelle;
    expect(premiere).toBeGreaterThan(derniere);
    expect(e.total_assurance_nouvelle / e.lignes.length).toBeCloseTo(25, 1);
  });
});
