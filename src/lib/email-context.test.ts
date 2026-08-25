/**
 * CD-SI-001-B — LOT 1. Tests de forme du schéma `ai_context` (TESTS 7 à 10).
 * Les tests de schéma base de données (TESTS 1 à 6, 11, 12) sont vérifiés par
 * introspection SQL, hors runner.
 */
import { describe, expect, test } from "vitest";

import { estContexteEmailValide, lireContexteEmail } from "./email-context-schema";
import { contexteEmailVide, EMAIL_CONTEXT_SCHEMA_VERSION } from "./email-context-types";
import schemaJson from "./schemas/email-context-v1.2.json";

const contexteValide = {
  schema_version: "1.1.0",
  correspondant: {
    email: "client@example.com",
    nom_affiche: "Jean Dupont",
    role_suppose: "client",
    client_id: "11111111-1111-1111-1111-111111111111",
    statut: "PROPOSED",
    confiance: 0.92,
    provenance: { source: "gemini", modele: "gemini-2.5-flash", preuve_ids: ["p1"] },
  },
  personnes_detectees: [{ nom: "Dupont", prenom: "Marie", role: "conjoint", statut: "DETECTED" }],
  dossiers_detectes: [{ reference_citee: "EJ-2026-EMPRUNTEUR-0012", statut: "AMBIGUOUS" }],
  contrats_detectes: [{ numero_police: "POL-998877", statut: "A_QUALIFIER", confiance: 0.4 }],
  produits_cites: [{ libelle: "Emprunteur Néoliane", statut: "DETECTED" }],
  documents_associes: [{ nom_fichier: "offre.pdf", type_detecte: "OFFRE_PRET", statut: "DETECTED" }],
  preuves: [{ id: "p1", type: "email_expediteur", extrait: "client@example.com", poids: 0.9 }],
  ambiguities: [{ type: "dossier_multiple", candidats: ["a", "b"], resolution_requise: true }],
  analyse: {
    statut: "PROPOSED",
    confiance_globale: 0.88,
    modele: "gemini-2.5-flash",
    analyse_le: "2026-08-25T10:00:00.000Z",
    validation_humaine_requise: true,
    validated_by: null,
    validated_at: null,
    modifications_apportees: [],
    provenance: { source: "gemini" },
  },
};

describe("CD-SI-001-B LOT 1 — schéma ai_context", () => {
  test("TEST 7 — accepte un contexte valide", () => {
    expect(lireContexteEmail(contexteValide)).not.toBeNull();
    expect(estContexteEmailValide(contexteEmailVide())).toBe(true);
  });

  test("TEST 8 — refuse un contexte invalide", () => {
    expect(estContexteEmailValide({ schema_version: "1.1.0", inconnu: 1 })).toBe(false);
    expect(
      estContexteEmailValide({
        schema_version: "1.1.0",
        personnes_detectees: [{ statut: "VALIDE_PAR_IA" }],
      }),
    ).toBe(false);
    expect(
      estContexteEmailValide({ schema_version: "1.1.0", analyse: { confiance_globale: 1.4 } }),
    ).toBe(false);
  });

  test("TEST 9 — schema_version obligatoire et figée à 1.1.0", () => {
    expect(EMAIL_CONTEXT_SCHEMA_VERSION).toBe("1.1.0");
    expect(estContexteEmailValide({})).toBe(false);
    expect(estContexteEmailValide({ schema_version: "1.2.0" })).toBe(false);
    expect(schemaJson.properties.schema_version.const).toBe("1.1.0");
  });

  test("TEST 10 — la section s'appelle exactement `ambiguities`", () => {
    const cles = Object.keys(schemaJson.properties);
    expect(cles).toContain("ambiguities");
    expect(cles).not.toContain("ambiguites");
    expect(estContexteEmailValide({ schema_version: "1.1.0", ambiguites: [] })).toBe(false);
    for (const section of [
      "schema_version",
      "correspondant",
      "personnes_detectees",
      "dossiers_detectes",
      "contrats_detectes",
      "produits_cites",
      "documents_associes",
      "preuves",
      "ambiguities",
      "analyse",
    ]) {
      expect(cles).toContain(section);
    }
  });

  test("statuts du contexte — représentation complète", () => {
    for (const s of ["DETECTED", "PROPOSED", "CONFIRMED", "AMBIGUOUS", "A_QUALIFIER"]) {
      expect(
        estContexteEmailValide({ schema_version: "1.1.0", analyse: { statut: s } }),
      ).toBe(true);
    }
  });
});
