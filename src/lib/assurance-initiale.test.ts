import { describe, expect, it } from "vitest";
import { assuranceInitiale, assuranceInitialeDepuisRecueil, economieDevis } from "./assurance-initiale";

describe("assuranceInitiale", () => {
  it("calcule la cotisation depuis le taux bancaire (capital initial)", () => {
    const r = assuranceInitiale({ capital: 200_000, tauxAssurancePct: 0.36, dureeMois: 240, moisRestants: 180 });
    expect(r.origine).toBe("taux");
    expect(r.mensuel).toBe(60);
    expect(r.coutTotal).toBe(14_400);
    expect(r.coutRestant).toBe(10_800);
  });

  it("privilégie la cotisation lue sur l'offre de prêt", () => {
    const r = assuranceInitiale({
      capital: 200_000,
      tauxAssurancePct: 0.36,
      cotisationMensuelle: 72,
      dureeMois: 240,
      moisRestants: 100,
    });
    expect(r.origine).toBe("offre");
    expect(r.coutRestant).toBe(7_200);
  });

  it("ne déduit rien sans donnée exploitable", () => {
    const r = assuranceInitiale({ capital: null, tauxAssurancePct: null, moisRestants: 100 });
    expect(r.origine).toBe("inconnue");
    expect(r.coutRestant).toBeNull();
  });

  it("lit le recueil des besoins", () => {
    const r = assuranceInitialeDepuisRecueil({ capital: 100_000, taux_assurance_banque: 0.3, duree_mois: 120 }, 60);
    expect(r.coutRestant).toBe(1_500);
  });
});

describe("economieDevis", () => {
  it("compare le devis au coût restant de l'assurance bancaire", () => {
    const e = economieDevis(10_800, 4_800)!;
    expect(e.economie).toBe(6_000);
    expect(e.pourcentage).toBeCloseTo(55.6, 1);
  });

  it("accepte une économie négative", () => {
    expect(economieDevis(1_000, 1_400)!.economie).toBe(-400);
  });

  it("retourne null si une donnée manque", () => {
    expect(economieDevis(null, 1_000)).toBeNull();
    expect(economieDevis(1_000, null)).toBeNull();
  });
});
