import { describe, expect, it } from "vitest";
import { canalSouscription, estSourceApi } from "./souscription-canal";

describe("canal de souscription", () => {
  it("reconnaît les origines partenaire", () => {
    expect(estSourceApi("neoliane")).toBe(true);
    expect(estSourceApi("api_simulassur")).toBe(true);
    expect(estSourceApi("manuel")).toBe(false);
    expect(estSourceApi("pdf")).toBe(false);
    expect(estSourceApi(null)).toBe(false);
  });

  it("devis saisi ou importé = souscription hors API", () => {
    expect(canalSouscription({ sources: ["manuel", "pdf"], parcoursPartenaire: false })).toBe(
      "externe",
    );
  });

  it("parcours partenaire relié = canal API", () => {
    expect(canalSouscription({ sources: ["manuel"], parcoursPartenaire: true })).toBe(
      "api_partenaire",
    );
  });

  it("devis d'origine partenaire = canal API", () => {
    expect(canalSouscription({ sources: ["neoliane"], parcoursPartenaire: false })).toBe(
      "api_partenaire",
    );
  });

  it("aucun devis = hors API par défaut", () => {
    expect(canalSouscription({ sources: [], parcoursPartenaire: false })).toBe("externe");
  });
});
