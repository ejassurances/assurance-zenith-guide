import { describe, expect, it } from "vitest";
import {
  capitaliser,
  comparerEpargne,
  contratActuelDepuisExtraction,
  rendementBrutConstate,
  type ContratEpargneActuel,
} from "./epargne-analyse";

const actuel: ContratEpargneActuel = {
  assureur: "Assureur X",
  contrat: "AV Patrimoine",
  valeur_actuelle: 52000,
  valeur_initiale: 50000,
  versements_periode: 1200,
  performance_nette_pct: 2.1,
  frais_gestion_pct: 0.9,
  frais_versement_pct: 3,
  date_releve: "2025-12-31",
  annees_periode: 1,
};

const offre = {
  produit_id: "p1",
  produit_nom: "AV Cabinet",
  assureur: "Assureur Y",
  frais_versement_pct: 0,
  frais_gestion_pct: 0.6,
};

describe("épargne — rendement constaté", () => {
  it("reconstitue le rendement brut depuis la performance nette et les frais de gestion", () => {
    expect(rendementBrutConstate(actuel)).toBe(3);
  });

  it("ne déduit aucun rendement sans performance nette écrite au relevé", () => {
    expect(rendementBrutConstate({ ...actuel, performance_nette_pct: null })).toBeNull();
  });
});

describe("épargne — comparatif", () => {
  it("produit des projections 3 / 8 / 10 ans favorables à des frais plus faibles", () => {
    const c = comparerEpargne({
      actuel,
      offre,
      capital_initial: 52000,
      versement_mensuel: 200,
    });
    expect(c.disponible).toBe(true);
    expect(c.projections.map((p) => p.annees)).toEqual([3, 8, 10]);
    for (const p of c.projections) {
      expect(p.valeur_actuel).not.toBeNull();
      expect(p.valeur_cabinet).toBeGreaterThan(p.valeur_actuel!);
      expect(p.ecart_euros!).toBeGreaterThan(0);
    }
    expect(c.gain_annuel_points).toBeCloseTo(0.3, 5);
    expect(c.retrospective?.gain_euros).toBeGreaterThan(0);
  });

  it("refuse la comparaison quand les frais du produit du cabinet manquent", () => {
    const c = comparerEpargne({
      actuel,
      offre: { ...offre, frais_gestion_pct: null },
      capital_initial: 10000,
      versement_mensuel: 0,
    });
    expect(c.disponible).toBe(false);
    expect(c.motif).toContain("catalogue");
  });

  it("refuse la projection sans rendement constaté et sans hypothèse fournie", () => {
    const c = comparerEpargne({ actuel: null, offre, capital_initial: 0, versement_mensuel: 150 });
    expect(c.disponible).toBe(false);
    expect(c.motif).toContain("non disponible");
  });

  it("permet de partir de zéro avec un rendement fourni explicitement", () => {
    const c = comparerEpargne({
      actuel: null,
      offre,
      capital_initial: 0,
      versement_mensuel: 150,
      rendement_brut_pct: 3,
    });
    expect(c.disponible).toBe(true);
    expect(c.projections[0]!.valeur_cabinet).toBeGreaterThan(0);
    expect(c.projections[0]!.valeur_actuel).toBeNull();
  });
});

describe("épargne — capitalisation", () => {
  it("prélève les frais sur versement à l'entrée", () => {
    const sansFrais = capitaliser({
      capital_initial: 10000,
      versement_mensuel: 0,
      annees: 1,
      rendement_brut_pct: 0,
      frais_versement_pct: 0,
      frais_gestion_pct: 0,
    });
    const avecFrais = capitaliser({
      capital_initial: 10000,
      versement_mensuel: 0,
      annees: 1,
      rendement_brut_pct: 0,
      frais_versement_pct: 3,
      frais_gestion_pct: 0,
    });
    expect(sansFrais).toBe(10000);
    expect(avecFrais).toBe(9700);
  });
});

describe("épargne — lecture d'extraction", () => {
  it("convertit une extraction de relevé en contrat analysable", () => {
    const c = contratActuelDepuisExtraction({
      assureur: "Assureur X",
      valeur_acquise: "52 000",
      performance_nette_pct: "2,1",
      frais_gestion_pct: 0.9,
    });
    expect(c?.valeur_actuelle).toBe(52000);
    expect(c?.performance_nette_pct).toBe(2.1);
  });

  it("retourne null sans aucune donnée", () => {
    expect(contratActuelDepuisExtraction(null)).toBeNull();
  });
});
