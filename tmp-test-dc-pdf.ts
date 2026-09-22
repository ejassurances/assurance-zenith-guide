/* Test temporaire : génération du PDF du devoir de conseil après unification tslib. */
import { writeFileSync } from "node:fs";
import { genererPdfDevoirConseil } from "@/lib/devoir-conseil-pdf.server";

const pdf = await genererPdfDevoirConseil({
  contenu: {
    dossier: { reference: "EJ-2026-EMP-TEST" },
    conseil: {
      exigences_client: "Couvrir le prêt immobilier, sans délai de carence.",
      compagnie: "Test Assurances",
      produit: "Formule Sécurité",
      cotisation_mensuelle: "45,20",
      economie_estimee: 6200,
      assiette: "capital_restant_du",
      capital_assure: 180000,
      quotite: 100,
      offres: [
        { compagnie: "Test Assurances", produit: "Formule Sécurité", cotisation_mensuelle: "45,20", statut: "recommandee", commentaire: "Meilleur rapport garanties/prix" },
        { compagnie: "Banque Exemple", produit: "Contrat groupe", cotisation_mensuelle: "82,10", statut: "ecartee", commentaire: "Tarif supérieur" },
      ],
      garanties: "Décès, PTIA, ITT, IPT.",
      garanties_produit: {
        detail: [
          { code: "deces", libelle: "Décès", couverture: "oui", plafond: "Capital assuré", delai_carence: "—" },
          { code: "itt", libelle: "ITT", couverture: "oui", plafond: "100 % de la mensualité", delai_carence: "90 jours" },
        ],
      },
    },
  },
  type_assurance: "emprunteur",
  statut: "brouillon",
  recommandation: "Souscrire la formule Test Assurances en substitution du contrat groupe.",
  motifs: "Économie estimée de 6 200 EUR sur la durée du prêt, garanties équivalentes ou supérieures.",
  mises_en_garde: "Vérification médicale requise ; équivalence des garanties contrôlée par le cabinet.",
  signature_png: null,
  signed_at: null,
  signed_ip: null,
  hash: null,
  refus_motif: null,
  refuse_le: null,
});

writeFileSync("/tmp/test-devoir-conseil.pdf", Buffer.from(pdf));
console.log("OK — PDF généré,", pdf.byteLength, "octets");
