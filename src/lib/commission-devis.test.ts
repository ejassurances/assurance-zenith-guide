import { describe, expect, it } from "vitest";
import { commissionDepuisDevis, tauxDefautDevis, tauxEnFraction } from "@/lib/commission-devis";
import type { RegleCommission } from "@/lib/commissions-bareme";

const regleCompagnie: RegleCommission = {
  id: "r1",
  niveau: "compagnie",
  branche: "emprunteur",
  compagnie_id: "c1",
  type: "pourcentage",
  montant_fixe: null,
  taux_pourcentage: 8,
  base_calcul: "economie_realisee",
  notes: null,
};

describe("taux par défaut d'un devis", () => {
  it("retient la règle compagnie avant la règle branche", () => {
    const branche: RegleCommission = { ...regleCompagnie, id: "r2", niveau: "branche", compagnie_id: null, taux_pourcentage: 6 };
    expect(tauxDefautDevis([branche, regleCompagnie], "emprunteur", "c1")).toMatchObject({
      taux: 8,
      base: "economie_realisee",
      source: "compagnie",
    });
  });

  it("retombe sur le défaut cabinet emprunteur : 5 % de l'économie", () => {
    expect(tauxDefautDevis([], "emprunteur", null)).toMatchObject({
      taux: 5,
      base: "economie_realisee",
      source: "defaut",
    });
  });

  it("retombe sur un mois de cotisation hors emprunteur", () => {
    expect(tauxDefautDevis([], "sante", null)).toMatchObject({ taux: 100, base: "prime", source: "defaut" });
  });
});

describe("commission prévisionnelle depuis le devis", () => {
  it("applique le taux à l'économie au prorata de la quotité", () => {
    const r = commissionDepuisDevis(
      { taux: 5, base: "economie_realisee" },
      { economie: 4000, quotitePct: 75, totalQuotites: 100 },
    );
    expect(r).toEqual({ mensuel: 150, mois: 1, total: 150 });
  });

  it("applique le taux à chaque cotisation sur les mois restants", () => {
    const r = commissionDepuisDevis({ taux: 10, base: "prime" }, { cotisationMensuelle: 30, moisRestants: 24 });
    expect(r).toEqual({ mensuel: 3, mois: 24, total: 72 });
  });

  it("ne devine rien sans assiette", () => {
    expect(commissionDepuisDevis({ taux: 5, base: "prime" }, {}).total).toBeNull();
  });

  it("convertit le pourcentage en fraction pour la fiche contrat", () => {
    expect(tauxEnFraction(5)).toBe(0.05);
    expect(tauxEnFraction(null)).toBeNull();
  });
});
