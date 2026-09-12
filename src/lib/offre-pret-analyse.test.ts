import { describe, expect, it } from "vitest";
import { dateIsoOuNull } from "./offre-pret-analyse.server";

describe("dateIsoOuNull", () => {
  it("accepte une date déjà au format ISO", () => {
    expect(dateIsoOuNull("1971-02-26")).toBe("1971-02-26");
  });

  it("convertit une date française telle qu'écrite sur une offre de prêt", () => {
    expect(dateIsoOuNull("26/02/1971")).toBe("1971-02-26");
    expect(dateIsoOuNull("6/2/1971")).toBe("1971-02-06");
    expect(dateIsoOuNull("26-02-1971")).toBe("1971-02-26");
    expect(dateIsoOuNull("26.02.1971")).toBe("1971-02-26");
  });

  it("refuse une valeur absente ou illisible plutôt que d'inventer", () => {
    expect(dateIsoOuNull(null)).toBeNull();
    expect(dateIsoOuNull("")).toBeNull();
    expect(dateIsoOuNull("non renseigné")).toBeNull();
    expect(dateIsoOuNull("février 1971")).toBeNull();
    expect(dateIsoOuNull("32/13/1971")).toBeNull();
  });
});
