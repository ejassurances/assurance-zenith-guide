import { describe, expect, it } from "vitest";
import { noterProduitEmprunteur } from "./emprunteur-scoring-produits";

const recueilTns = {
  duree_mois: 240,
  assures: [{ csp: "tns", date_naissance: "1985-05-05" }],
};
const recueilSenior = {
  duree_mois: 180,
  assures: [{ csp: "salarie", date_naissance: "1958-01-01" }],
};

describe("noterProduitEmprunteur", () => {
  it("ne note pas un produit sans grille validée", () => {
    const n = noterProduitEmprunteur(null, recueilTns);
    expect(n.score).toBeNull();
    expect(n.criteres).toHaveLength(0);
  });

  it("valorise l'indemnisation forfaitaire pour un TNS", () => {
    const grille = {
      deces: { couverture: "oui" },
      ptia: { couverture: "oui" },
      itt: { couverture: "oui" },
      ipt: { couverture: "oui" },
      type_indemnisation: { couverture: "oui", plafond: "Forfaitaire" },
      franchise_itt: { couverture: "oui", franchise: "30 jours" },
      seuil_ipp: { couverture: "oui", plafond: "33 %" },
    } as never;
    const n = noterProduitEmprunteur(grille, recueilTns);
    expect(n.profils).toContain("tns");
    expect(n.score).toBe(100);
    expect(n.points_forts.length).toBeGreaterThan(0);
  });

  it("pénalise des âges limites bas pour un senior", () => {
    const grille = {
      deces: { couverture: "oui" },
      ages_limites: { couverture: "oui", plafond: "cessation 70 ans" },
    } as never;
    const n = noterProduitEmprunteur(grille, recueilSenior);
    expect(n.profils).toContain("senior");
    expect(n.score).toBeLessThan(100);
    expect(n.points_faibles.join(" ")).toMatch(/Âges limites/);
  });

  it("ignore les critères absents de la grille (aucune valeur déduite)", () => {
    const grille = { deces: { couverture: "oui" } } as never;
    const n = noterProduitEmprunteur(grille, {});
    expect(n.score).toBe(100);
    expect(n.criteres.filter((c) => c.satisfait === null).length).toBeGreaterThan(0);
  });
});
