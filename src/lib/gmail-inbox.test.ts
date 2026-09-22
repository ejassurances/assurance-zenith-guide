import { describe, expect, it } from "vitest";
import {
  classerEmail,
  delaiEcoule,
  DELAI_TRAITEMENT_MINUTES,
  LABEL_ALERTE,
  LABEL_ARCHIVE_TRAITEE,
  LABEL_BROUILLON,
  traitableAPartirDe,
} from "./gmail-inbox";

const base = { reponseDejaEnvoyee: false, reponseNecessaire: true, rattachementCertain: true, confiance: 0.9 };

describe("délai de 45 minutes", () => {
  const recu = new Date("2026-09-22T10:00:00Z");

  it("attend exactement 45 minutes", () => {
    expect(traitableAPartirDe(recu).toISOString()).toBe("2026-09-22T10:45:00.000Z");
    expect(DELAI_TRAITEMENT_MINUTES).toBe(45);
  });

  it("refuse avant l'échéance", () => {
    expect(delaiEcoule(recu, new Date("2026-09-22T10:44:59Z"))).toBe(false);
  });

  it("autorise à l'échéance et après", () => {
    expect(delaiEcoule(recu, new Date("2026-09-22T10:45:00.000Z"))).toBe(true);
    expect(delaiEcoule(recu, new Date("2026-09-22T12:00:00Z"))).toBe(true);
  });
});

describe("classement des messages", () => {
  it("archive quand une réponse existe déjà, sans rien envoyer", () => {
    const r = classerEmail({ ...base, reponseDejaEnvoyee: true });
    expect(r.decision).toBe("archive_reponse_existante");
    expect(r.label).toBe(LABEL_ARCHIVE_TRAITEE);
  });

  it("prépare un brouillon quand une réponse est nécessaire", () => {
    const r = classerEmail(base);
    expect(r.decision).toBe("brouillon_a_relire");
    expect(r.label).toBe(LABEL_BROUILLON);
  });

  it("archive quand aucune réponse n'est nécessaire", () => {
    expect(classerEmail({ ...base, reponseNecessaire: false }).label).toBe(LABEL_ARCHIVE_TRAITEE);
  });

  it("alerte en cas de rattachement incertain, de sujet sensible ou d'incompréhension", () => {
    expect(classerEmail({ ...base, rattachementCertain: false }).label).toBe(LABEL_ALERTE);
    expect(classerEmail({ ...base, sensible: true }).label).toBe(LABEL_ALERTE);
    expect(classerEmail({ ...base, comprehensible: false }).label).toBe(LABEL_ALERTE);
  });

  it("alerte quand la confiance est insuffisante", () => {
    expect(classerEmail({ ...base, confiance: 0.4 }).decision).toBe("alerte_humain");
  });

  it("la réponse déjà envoyée prime sur le doute", () => {
    const r = classerEmail({ ...base, reponseDejaEnvoyee: true, rattachementCertain: false });
    expect(r.decision).toBe("archive_reponse_existante");
  });
});
