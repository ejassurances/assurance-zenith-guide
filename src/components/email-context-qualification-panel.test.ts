/**
 * CD-SI-001-B — LOT IHM QUALIFICATION — TESTS DU PANNEAU (ACTION 36).
 * Référence : docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.1.md
 *
 * Couvre le MINEUR-3 de l'ACTION 35 : filtrage des statuts vides et
 * présentation d'un message générique en cas d'erreur inattendue.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ACTION 36 — correctifs mineurs IHM qualification", () => {
  const ihm = readFileSync("src/components/email-context-qualification-panel.tsx", "utf8");

  it("UI-17 — une correction de statut vide ne peut pas être ajoutée au panier", () => {
    // Le select conserve une option placeholder vide, mais le onChange la rejette.
    expect(ihm).toContain('if (!v) return');
    expect(ihm).toContain("onChange(v as (typeof STATUTS_HUMAINS)[number])");
  });

  it("UI-18 — envoyer présente un message générique en cas d'erreur inattendue", () => {
    expect(ihm).toMatch(/catch\s*\(\s*\)\s*\{[\s\S]*?setMessage\s*\(\s*\{\s*ton:\s*"ko"/);
    expect(ihm).toContain("Une erreur inattendue est survenue lors de l'enregistrement.");
    expect(ihm).toContain("Veuillez réessayer ou contacter le support.");
  });

  it("UI-19 — étanchéité : aucune logique métier, backend, Q.11, Lot 3/4 n'est touché", () => {
    for (const interdit of [
      "email-context-resolver",
      "composerGardeQ11",
      "email-fk-authorization",
      ".insert(",
      ".upsert(",
      ".delete(",
      "supabaseAdmin",
    ]) {
      expect(ihm.includes(interdit)).toBe(false);
    }
  });
});
