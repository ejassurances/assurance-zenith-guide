import { describe, it, expect } from "vitest";
import {
  evaluerPrerequisSouscription,
  messageBlocageSouscription,
  type EntreePrerequis,
} from "./souscription-prerequis";

const complet: EntreePrerequis = {
  recueil_besoins: { branche: "emprunteur" },
  devis_actifs: 2,
  devoir_conseil_signe_le: "2026-08-20T10:00:00.000Z",
  devoir_conseil_refuse: false,
  devoir_conseil_compagnie_recu: false,
  pieces_manquantes: [],
  pieces_a_qualifier: [],
};

describe("prérequis de transmission compagnie", () => {
  it("autorise un dossier complet", () => {
    const r = evaluerPrerequisSouscription(complet);
    expect(r.autorise).toBe(true);
    expect(r.jalons.every((j) => j.etat === "OK")).toBe(true);
  });

  it("bloque sans recueil des besoins", () => {
    const r = evaluerPrerequisSouscription({ ...complet, recueil_besoins: {} });
    expect(r.autorise).toBe(false);
    expect(r.jalons.find((j) => j.code === "recueil")?.etat).toBe("MANQUANT");
  });

  it("bloque sans devis", () => {
    expect(evaluerPrerequisSouscription({ ...complet, devis_actifs: 0 }).autorise).toBe(false);
  });

  it("bloque sans devoir de conseil signé", () => {
    const r = evaluerPrerequisSouscription({ ...complet, devoir_conseil_signe_le: null });
    expect(r.autorise).toBe(false);
    expect(r.jalons.find((j) => j.code === "devoir_conseil")?.detail).toContain("non signé");
  });

  it("bloque si le devoir de conseil est refusé", () => {
    const r = evaluerPrerequisSouscription({
      ...complet,
      devoir_conseil_signe_le: null,
      devoir_conseil_refuse: true,
    });
    expect(r.autorise).toBe(false);
    expect(r.jalons.find((j) => j.code === "devoir_conseil")?.detail).toContain("refusé");
  });

  it("autorise si le devoir de conseil de la compagnie est reçu, même sans le nôtre", () => {
    const r = evaluerPrerequisSouscription({
      ...complet,
      devoir_conseil_signe_le: null,
      devoir_conseil_refuse: false,
      devoir_conseil_compagnie_recu: true,
    });
    expect(r.autorise).toBe(true);
    expect(r.jalons.find((j) => j.code === "devoir_conseil")?.etat).toBe("OK");
    expect(r.jalons.find((j) => j.code === "devoir_conseil")?.detail).toContain("compagnie reçu");
  });

  it("bloque avec une pièce obligatoire manquante ou à qualifier", () => {
    const manquante = evaluerPrerequisSouscription({ ...complet, pieces_manquantes: ["RIB"] });
    expect(manquante.autorise).toBe(false);
    expect(messageBlocageSouscription(manquante)).toContain("RIB");
    expect(
      evaluerPrerequisSouscription({ ...complet, pieces_a_qualifier: ["CNI"] }).autorise,
    ).toBe(false);
  });

  it("cumule tous les motifs bloquants", () => {
    const r = evaluerPrerequisSouscription({
      recueil_besoins: null,
      devis_actifs: 0,
      devoir_conseil_signe_le: null,
      devoir_conseil_refuse: false,
      devoir_conseil_compagnie_recu: false,
      pieces_manquantes: ["CNI"],
      pieces_a_qualifier: [],
    });
    expect(r.bloquants).toHaveLength(4);
  });
});
