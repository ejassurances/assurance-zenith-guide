import { expect, test } from "vitest";
import { reduireReponseNeoliane, diagnosticErreur, masquerSecret, messageTechnique } from "@/lib/neoliane/redaction";

test("réduit une réponse d'offre", () => {
  const r = reduireReponseNeoliane({
    offerId: "42",
    contracts: [{ contractId: "C1", status: "ok", persons: [{ lastname: "Dupont", nir: "180027512345678" }] }],
    bank: { iban: "FR7630006000011234567890189" },
    address: { street: "71 rue du docteur Roux" },
  }) as any;
  expect(r.offerId).toBe("42");
  expect(r.contracts[0].contractId).toBe("C1");
  expect(JSON.stringify(r)).not.toMatch(/Dupont|FR76|docteur|180027/);
});

test("diagnostic sans données personnelles", () => {
  const m = diagnosticErreur("Offre refusée", 422, {
    errors: [{ code: "INVALID_IBAN", field: "bank.iban", value: "FR7630006000011234567890189", message: "IBAN invalide pour jean.dupont@x.fr" }],
  });
  expect(m).toContain("HTTP 422");
  expect(m).toContain("INVALID_IBAN");
  expect(m).not.toMatch(/FR7630006000011234567890189|jean\.dupont@x\.fr/);
  expect(m.length).toBeLessThan(260);
});

test("masque et tronque", () => {
  expect(masquerSecret("abcdef")).toBe("****(6 car.)");
  expect(messageTechnique("x".repeat(900)).length).toBe(200);
});
