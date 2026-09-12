import { describe, expect, it } from "vitest";
import { classerBesoinReponse } from "./besoin-reponse";

describe("classerBesoinReponse", () => {
  it("classe une notification de suivi Ichange comme informationnelle", () => {
    const d = classerBesoinReponse({
      expediteur_email: "notification@ichange.fr",
      sujet: "Suivi de votre substitution — dossier mis à jour",
      texte: "Nous vous confirmons que le dossier a été mis à jour. Ne pas répondre à cet e-mail.",
    });
    expect(d.categorie).toBe("informationnel");
  });

  it("classe un accusé de réception comme informationnel", () => {
    expect(
      classerBesoinReponse({
        expediteur_email: "service@partenaire.fr",
        sujet: "Accusé de réception",
        texte: "Votre demande a bien été enregistrée. Aucune action n'est requise de votre part.",
      }).categorie,
    ).toBe("informationnel");
  });

  it("classe une demande de pièce comme appelant une réponse", () => {
    expect(
      classerBesoinReponse({
        sujet: "Dossier incomplet",
        texte: "Merci de nous transmettre le justificatif de domicile : il nous manque cette pièce.",
      }).categorie,
    ).toBe("reponse_attendue");
  });

  it("traite une question client comme appelant une réponse", () => {
    expect(
      classerBesoinReponse({ sujet: "Question", texte: "Où en est mon dossier ?" }).categorie,
    ).toBe("reponse_attendue");
  });

  it("laisse en ambigu un message informationnel contenant une demande", () => {
    expect(
      classerBesoinReponse({
        expediteur_email: "notifications@ichange.fr",
        sujet: "Confirmation",
        texte: "Nous vous confirmons la réception. Pouvez-vous vérifier la quotité ?",
      }).categorie,
    ).toBe("ambigu");
  });

  it("laisse en ambigu un message sans signal clair", () => {
    expect(classerBesoinReponse({ sujet: "Dossier Dupont", texte: "Bonjour, ci-joint." }).categorie).toBe(
      "reponse_attendue",
    );
    expect(classerBesoinReponse({ sujet: "Dossier Dupont", texte: "Bonjour." }).categorie).toBe("ambigu");
  });

  it("ne classe rien sans contenu", () => {
    expect(classerBesoinReponse({}).categorie).toBe("ambigu");
  });
});
