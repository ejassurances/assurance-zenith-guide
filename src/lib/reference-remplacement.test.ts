import { describe, expect, it } from "vitest";
import {
  classerEcritureReference,
  lignesNotificationRemplacement,
  type ReferenceExistante,
} from "./reference-remplacement";

const ref = (o: Partial<ReferenceExistante>): ReferenceExistante => ({
  id: "r1",
  reference: "ADH-2026-114578",
  libelle: "Numéro d'adhésion",
  contrat_id: "c1",
  ...o,
});

describe("classerEcritureReference", () => {
  it("ne réécrit pas une valeur identique (formatage ignoré)", () => {
    const r = classerEcritureReference([ref({})], {
      reference: "adh2026114578",
      contrat_id: "c1",
      libelle: "Numéro d'adhésion",
    });
    expect(r.action).toBe("inchange");
  });

  it("crée quand aucune référence n'existe pour cet assuré", () => {
    const r = classerEcritureReference([ref({ contrat_id: "autre" })], {
      reference: "ADH-9",
      contrat_id: "c1",
    });
    expect(r.action).toBe("creation");
  });

  it("signale un remplacement avec l'ancienne valeur", () => {
    const r = classerEcritureReference([ref({})], {
      reference: "ADH-2026-999999",
      contrat_id: "c1",
      libelle: "Numéro d'adhésion",
    });
    expect(r).toMatchObject({ action: "remplacement", ancienne: "ADH-2026-114578" });
  });
});

describe("lignesNotificationRemplacement", () => {
  it("cite l'ancienne et la nouvelle valeur", () => {
    const lignes = lignesNotificationRemplacement({
      ancienne: "A-1",
      nouvelle: "B-2",
      source: "e-mail Cardif",
    }).join("\n");
    expect(lignes).toContain("Ancienne valeur : A-1");
    expect(lignes).toContain("Nouvelle valeur : B-2");
  });
});
