import { describe, expect, it } from "vitest";
import { normaliserRecueilEmprunteur } from "./recueil-emprunteur-normalisation";

describe("reconstitution du recueil emprunteur des dossiers en cours", () => {
  it("reconstitue le prêt et l'assuré principal depuis le dossier et la fiche client", () => {
    const r = normaliserRecueilEmprunteur(null, { capital: 226394, duree_mois: 167 }, [
      { lien: "principal", nom: "GUILLOUF Aurélie", date_naissance: "1972-05-15", csp: "Employé de bureau", fumeur: false },
    ]);
    expect(r.recueil["capital"]).toBe(226394);
    expect(r.recueil["duree_mois"]).toBe(167);
    expect(r.recueil["mois_restants"]).toBe(167);
    expect(r.manquants).toEqual([]);
    const assures = r.recueil["assures"] as Record<string, unknown>[];
    expect(assures).toHaveLength(1);
    expect(assures[0]!["quotite_pct"]).toBe(100);
  });

  it("reprend les anciennes clés sans écraser une saisie humaine", () => {
    const r = normaliserRecueilEmprunteur(
      { capital_emprunte: 71088, quotite: 80, cotisation_mensuelle: 8.74, capital: 70000 },
      { capital: 71088, duree_mois: 184 },
      [{ lien: "principal", date_naissance: "1983-05-18" }],
    );
    expect(r.recueil["capital"]).toBe(70000);
    expect(r.recueil["tarif_cotisation_mensuelle"]).toBe(8.74);
    const assures = r.recueil["assures"] as Record<string, unknown>[];
    expect(assures[0]!["quotite_pct"]).toBe(80);
  });

  it("liste chaque emprunteur du prêt et signale les quotités inconnues", () => {
    const r = normaliserRecueilEmprunteur(null, { capital: 300000, duree_mois: 240 }, [
      { lien: "principal", date_naissance: "1980-01-01" },
      { lien: "co_emprunteur", nom: "BRIDOUX Jean-Pierre", date_naissance: "1978-03-02" },
    ]);
    const assures = r.recueil["assures"] as Record<string, unknown>[];
    expect(assures).toHaveLength(2);
    expect(r.manquants).toContain("assures.quotite_pct");
  });

  it("ne touche pas une liste d'assurés déjà saisie", () => {
    const r = normaliserRecueilEmprunteur(
      { assures: [{ lien: "principal", date_naissance: "1990-01-01", quotite_pct: 100 }] },
      { capital: 100000, duree_mois: 120 },
      [{ lien: "principal", date_naissance: "1970-01-01" }, { lien: "co_emprunteur" }],
    );
    expect((r.recueil["assures"] as unknown[]).length).toBe(1);
    expect(r.ajouts).not.toContain("assures");
  });
});
