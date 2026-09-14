import { describe, expect, it } from "vitest";
import { prefillRecueilEmprunteur } from "./pret-prefill";

describe("pré-remplissage du recueil emprunteur", () => {
  it("reporte les données extraites de l'offre de prêt", () => {
    const r = prefillRecueilEmprunteur(null, {
      banque: "Crédit Agricole",
      montant_capital: 250000,
      duree_mois: 240,
      taux_nominal: 3.4,
      mensualite: 1420,
    });
    expect(r.recueil["banque"]).toBe("Crédit Agricole");
    expect(r.recueil["capital"]).toBe(250000);
    expect(r.recueil["duree_mois"]).toBe(240);
    expect(r.recueil["mois_restants"]).toBe(240);
    expect(r.ajouts).toContain("taux_pret");
  });

  it("n'écrase jamais une saisie humaine", () => {
    const r = prefillRecueilEmprunteur(
      { banque: "BNP", capital: 100000 },
      { banque: "Crédit Agricole", montant_capital: 250000 },
    );
    expect(r.recueil["banque"]).toBe("BNP");
    expect(r.recueil["capital"]).toBe(100000);
    expect(r.ajouts).not.toContain("banque");
  });

  it("signale les champs encore manquants, dont les assurés", () => {
    const r = prefillRecueilEmprunteur(null, { banque: "LCL" });
    expect(r.manquants).toEqual(["capital", "duree_mois", "assures"]);
  });

  it("considère le prêt complet quand les assurés sont saisis", () => {
    const r = prefillRecueilEmprunteur(
      { assures: [{ lien: "principal", date_naissance: "1985-01-01", quotite_pct: 100 }] },
      { montant_capital: 200000, duree_mois: 180 },
    );
    expect(r.manquants).toEqual([]);
  });

  it("retient la date de début lue sur le tableau d'amortissement", () => {
    const r = prefillRecueilEmprunteur(
      null,
      { montant_capital: 200000, duree_mois: 180, date_premiere_echeance: "2025-03-05" },
      { date_document: "2025-06-01" },
    );
    expect(r.recueil["date_premiere_echeance"]).toBe("2025-03-05");
  });

  it("retient la date d'édition du document quand aucune échéance n'est indiquée", () => {
    const r = prefillRecueilEmprunteur(
      null,
      { montant_capital: 200000, duree_mois: 180 },
      { date_document: "2025-06-01" },
    );
    expect(r.recueil["date_premiere_echeance"]).toBe("2025-06-01");
    expect(r.ajouts).toContain("date_premiere_echeance");
  });

  it("n'utilise jamais la création du dossier comme date de début du prêt", () => {
    const r = prefillRecueilEmprunteur(
      null,
      { montant_capital: 200000, duree_mois: 180 },
      { dossier_cree_le: "2026-01-10" },
    );
    expect(r.recueil["date_premiere_echeance"]).toBeUndefined();
  });
});
