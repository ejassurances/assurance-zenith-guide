import { describe, expect, it } from "vitest";
import { piecePretProbable } from "./offre-pret-email.server";

describe("piecePretProbable", () => {
  it("reconnaît une offre de prêt", () => {
    expect(piecePretProbable("Offre de pret BRED.pdf")).toBe(true);
  });
  it("reconnaît un tableau d'amortissement", () => {
    expect(piecePretProbable("tableau_amortissement.pdf")).toBe(true);
  });
  it("reconnaît via l'objet du mail", () => {
    expect(piecePretProbable("scan001.pdf", "Offre de prêt immobilier JAFFRELOT")).toBe(true);
  });
  it("ignore une pièce sans lien avec un prêt", () => {
    expect(piecePretProbable("facture_lovable.pdf", "Votre facture")).toBe(false);
  });
});
