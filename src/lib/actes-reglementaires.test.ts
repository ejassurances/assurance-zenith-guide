import { describe, expect, it } from "vitest";
import { acteReglementaireDetecte, autorisationReponseAutonome } from "@/lib/actes-reglementaires";

describe("barrière réglementaire ACPR / DDA", () => {
  it("détecte les actes réglementaires dans le texte", () => {
    expect(acteReglementaireDetecte("Résiliation de mon contrat", null)).toBe("resiliation");
    expect(acteReglementaireDetecte(null, "Quel contrat me conseillez-vous ?")).toBe("devoir_conseil");
    expect(acteReglementaireDetecte("Demande d'attestation", "Merci de m'envoyer l'attestation")).toBeNull();
  });

  it("refuse l'autonomie sur les intentions sensibles", () => {
    for (const intention of ["RESILIATION", "SINISTRE", "RECLAMATION", "DEMANDE_MODIFICATION_CONTRAT"] as const) {
      const r = autorisationReponseAutonome({ canal: "client", intention, confiance: 0.99 });
      expect(r.autorise).toBe(false);
    }
  });

  it("refuse l'autonomie sur une demande de devis ou de tarif", () => {
    expect(autorisationReponseAutonome({ canal: "client", intention: "DEMANDE_DEVIS", confiance: 1 }).autorise).toBe(false);
    expect(
      autorisationReponseAutonome({ canal: "partenaire", sujet: "Votre tarif emprunteur", confiance: 1 }).autorise,
    ).toBe(false);
  });

  it("refuse l'autonomie en cas de confiance insuffisante ou de prise en charge humaine", () => {
    expect(autorisationReponseAutonome({ canal: "client", intention: "AUTRE", confiance: 0.4 }).autorise).toBe(false);
    expect(
      autorisationReponseAutonome({ canal: "fournisseur", confiance: 1, prise_en_charge_humaine: true }).autorise,
    ).toBe(false);
  });

  it("autorise la gestion courante", () => {
    expect(
      autorisationReponseAutonome({
        canal: "fournisseur",
        sujet: "Facture de janvier",
        texte: "Veuillez trouver la facture du mois.",
        confiance: 0.9,
      }).autorise,
    ).toBe(true);
    expect(
      autorisationReponseAutonome({ canal: "client", intention: "DEMANDE_ATTESTATION", confiance: 0.95 }).autorise,
    ).toBe(true);
  });
});
