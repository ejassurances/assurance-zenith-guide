import { describe, it, expect } from "vitest";
import { classifierDossier, etapeReprise } from "./souscription-file";
import { evaluerPrerequisSouscription, type EntreePrerequis } from "./souscription-prerequis";

const complet: EntreePrerequis = {
  recueil_besoins: { branche: "emprunteur" },
  devis_actifs: 1,
  devoir_conseil_signe_le: "2026-08-20T10:00:00.000Z",
  devoir_conseil_refuse: false,
  devoir_conseil_compagnie_recu: false,
  pieces_manquantes: [],
  pieces_a_qualifier: [],
};

describe("file de souscription — classification", () => {
  it("classe un dossier complet non transmis comme prêt", () => {
    const r = classifierDossier({
      statut: "devoir_conseil_signe",
      envoye_le: null,
      retour_le: null,
      prerequis: evaluerPrerequisSouscription(complet),
    });
    expect(r).toEqual({ etat: "pret", etape_reprise: null });
  });

  it("classe un dossier transmis en attente comme transmis", () => {
    const r = classifierDossier({
      statut: "souscription_envoyee",
      envoye_le: "2026-08-28T10:00:00.000Z",
      retour_le: null,
      prerequis: null,
    });
    expect(r).toEqual({ etat: "transmis", etape_reprise: null });
  });

  it("propose l'étape recueil comme reprise quand le recueil manque", () => {
    const r = classifierDossier({
      statut: "en_cours",
      envoye_le: null,
      retour_le: null,
      prerequis: evaluerPrerequisSouscription({ ...complet, recueil_besoins: {} }),
    });
    expect(r.etat).toBe("bloque");
    expect(r.etape_reprise).toBe("en_cours");
  });

  it("propose l'étape devis comme reprise quand aucun devis n'existe", () => {
    const r = classifierDossier({
      statut: "dda_validee",
      envoye_le: null,
      retour_le: null,
      prerequis: evaluerPrerequisSouscription({ ...complet, devis_actifs: 0 }),
    });
    expect(r.etape_reprise).toBe("devis_en_cours");
  });

  it("propose le devoir de conseil comme reprise quand il n'est pas signé", () => {
    const r = classifierDossier({
      statut: "devis_en_cours",
      envoye_le: null,
      retour_le: null,
      prerequis: evaluerPrerequisSouscription({ ...complet, devoir_conseil_signe_le: null }),
    });
    expect(r.etape_reprise).toBe("devoir_conseil_envoye");
  });

  it("propose la checklist des pièces quand seules les pièces manquent", () => {
    const r = classifierDossier({
      statut: "devoir_conseil_signe",
      envoye_le: null,
      retour_le: null,
      prerequis: evaluerPrerequisSouscription({ ...complet, pieces_manquantes: ["CNI"] }),
    });
    expect(r.etat).toBe("bloque");
    expect(r.etape_reprise).toBe("devoir_conseil_signe");
  });

  it("classe un dossier refusé (prérequis non autorisé) comme bloqué", () => {
    const r = classifierDossier({
      statut: "devoir_conseil_refuse",
      envoye_le: null,
      retour_le: null,
      prerequis: evaluerPrerequisSouscription({ ...complet, devoir_conseil_refuse: true }),
    });
    expect(r.etat).toBe("bloque");
    expect(r.etape_reprise).toBe("devoir_conseil_envoye");
  });
});

describe("file de souscription — reprise par défaut", () => {
  it("retombe sur l'étape souscription si tous les jalons sont OK", () => {
    expect(etapeReprise(evaluerPrerequisSouscription(complet))).toBe("devoir_conseil_signe");
  });
});
