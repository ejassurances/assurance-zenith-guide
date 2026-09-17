import { describe, expect, it } from "vitest";
import { previsionsParContrat, totalQuotites } from "@/lib/commission-contrats";

const contrats = [
  { id: "a", quotite: 75, prime_annuelle: 1200, duree_mois: 240 },
  { id: "b", quotite: 25, prime_annuelle: 400, duree_mois: 240 },
];

describe("previsionsParContrat", () => {
  it("calcule une commission par contrat sur la prime de chaque assuré", () => {
    const lignes = previsionsParContrat(contrats, { taux: 10, base: "prime" }, {
      economie: null,
      moisRestants: 200,
    });
    expect(lignes).toHaveLength(2);
    expect(lignes[0]!.prevu.mensuel).toBe(10);
    expect(lignes[0]!.prevu.total).toBe(2000);
    expect(lignes[1]!.prevu.mensuel).toBe(3.33);
    expect(lignes[1]!.prevu.mois).toBe(200);
  });

  it("répartit l'économie du prêt au prorata des quotités", () => {
    const lignes = previsionsParContrat(contrats, { taux: 5, base: "economie_realisee" }, {
      economie: 10000,
      moisRestants: 200,
    });
    expect(lignes[0]!.prevu.total).toBe(375);
    expect(lignes[1]!.prevu.total).toBe(125);
  });

  it("ne produit aucune prévision sans taux de devis", () => {
    expect(previsionsParContrat(contrats, null, { economie: 1, moisRestants: 1 })).toEqual([]);
    expect(previsionsParContrat(contrats, { taux: null, base: "prime" }, { economie: 1, moisRestants: 1 })).toEqual([]);
  });

  it("somme les quotités du prêt", () => {
    expect(totalQuotites(contrats)).toBe(100);
  });
});
