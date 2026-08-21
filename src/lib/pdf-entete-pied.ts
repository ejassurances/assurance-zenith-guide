import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * En-tête et pied de page communs aux 3 documents PDF réglementaires du CRM :
 * DER, lettre de mission et devoir de conseil.
 *
 * ⚠️ VIGILANCE : l'attestation RCP Lloyd's (contrat n°BZIA0001756) expire le
 * 28/02/2027. Mettre à jour RCP_MENTION (et le modèle Word) avant cette date.
 */

export const PDF_NAVY = rgb(0.039, 0.098, 0.184); // #0A192F
export const PDF_GOLD = rgb(0.725, 0.608, 0.247); // #B99B3F
export const PDF_GREY = rgb(0.45, 0.47, 0.5);

/** Hauteur réservée en bas de page pour le pied de page commun. */
export const PDF_FOOTER_HEIGHT = 72;

export const CABINET_ENTETE_DROITE = "Courtier en assurances - ORIAS n\u00b025005811";
export const CABINET_NOM_ENTETE = "EJ PARTNERS ASSURANCES";

export const PDF_PIED_LIGNES = [
  "EJ Partners Assurances - 71 rue du Docteur Roux, 95600 Eaubonne - SIRET 500 256 904 - contact@ej-assurances.fr",
  "Courtier en assurances immatricule a l'ORIAS sous le n\u00b025005811 (www.orias.fr), soumis au controle de l'ACPR (4 place de Budapest, CS 92459, 75436 Paris Cedex 09).",
  "Assurance responsabilite civile professionnelle souscrite aupres de Lloyd's Insurance Company SA (contrat n\u00b0BZIA0001756, validite 01/03/2026-28/02/2027), par l'intermediaire de +Simple.fr.",
];

function nettoyer(text: string) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, "");
}

/** Dessine l'en-tête commun et renvoie l'ordonnée du curseur sous la ligne dorée. */
export function dessinerEntete(
  page: PDFPage,
  opts: { font: PDFFont; bold: PDFFont; margin: number },
): number {
  const { width, height } = page.getSize();
  const baseline = height - 48;

  page.drawText(CABINET_NOM_ENTETE, {
    x: opts.margin,
    y: baseline,
    size: 12,
    font: opts.bold,
    color: PDF_NAVY,
  });

  const droite = nettoyer(CABINET_ENTETE_DROITE);
  page.drawText(droite, {
    x: width - opts.margin - opts.font.widthOfTextAtSize(droite, 8),
    y: baseline + 1.5,
    size: 8,
    font: opts.font,
    color: PDF_NAVY,
  });

  page.drawRectangle({
    x: opts.margin,
    y: height - 60,
    width: width - opts.margin * 2,
    height: 1.2,
    color: PDF_GOLD,
  });

  return height - 76;
}

/** Dessine le pied de page commun (mentions + pagination) sur toutes les pages. */
export function dessinerPiedsDePage(
  doc: PDFDocument,
  opts: { font: PDFFont; margin: number },
) {
  const pages = doc.getPages();
  const total = pages.length;

  pages.forEach((page, index) => {
    const { width } = page.getSize();
    const maxWidth = width - opts.margin * 2 - 60;

    page.drawRectangle({
      x: opts.margin,
      y: 60,
      width: width - opts.margin * 2,
      height: 0.6,
      color: PDF_GOLD,
    });

    let y = 49;
    for (const ligne of PDF_PIED_LIGNES) {
      const size = 5.9;
      // Repli sur plusieurs lignes si la mention dépasse la largeur utile.
      const mots = nettoyer(ligne).split(/\s+/);
      let courante = "";
      const lignes: string[] = [];
      for (const mot of mots) {
        const candidat = courante ? `${courante} ${mot}` : mot;
        if (opts.font.widthOfTextAtSize(candidat, size) > maxWidth && courante) {
          lignes.push(courante);
          courante = mot;
        } else courante = candidat;
      }
      if (courante) lignes.push(courante);
      for (const l of lignes) {
        page.drawText(l, { x: opts.margin, y, size, font: opts.font, color: PDF_GREY });
        y -= 7.4;
      }
    }

    const pagination = `${index + 1}/${total}`;
    page.drawText(pagination, {
      x: width - opts.margin - opts.font.widthOfTextAtSize(pagination, 7),
      y: 49,
      size: 7,
      font: opts.font,
      color: PDF_GREY,
    });
  });
}

/** Référence unique du document, dérivée de la référence du dossier. */
export function referenceDocument(
  referenceDossier: string | null | undefined,
  suffixe: "DER" | "LM" | "DC",
): string {
  const base = (referenceDossier ?? "").trim();
  return base ? `${base}-${suffixe}` : `-${suffixe}`;
}
