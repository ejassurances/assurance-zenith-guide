import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DER_SECTIONS, type DerContenu } from "@/lib/der-modele";
import {
  PDF_FOOTER_HEIGHT,
  dessinerEntete,
  dessinerPiedsDePage,
  referenceDocument,
} from "@/lib/pdf-entete-pied";


/** Rendu PDF natif du DER (pdf-lib, JS pur — compatible runtime serverless). */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0.04, 0.1, 0.18);
const MUTED = rgb(0.42, 0.46, 0.52);
const GOLD = rgb(0.83, 0.69, 0.22);

function safe(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, "");
}

export async function genererPdfDer(
  contenu: DerContenu,
  options: { reference_dossier?: string | null } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage(A4);
  let y = dessinerEntete(page, { font, bold, margin: MARGIN });

  const newPage = () => {
    page = doc.addPage(A4);
    y = dessinerEntete(page, { font, bold, margin: MARGIN });
  };
  const ensure = (needed: number) => {
    if (y - needed < PDF_FOOTER_HEIGHT + 8) newPage();
  };


  const write = (
    text: string,
    opts: { size?: number; bold?: boolean; color?: typeof INK; gap?: number; indent?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const x = MARGIN + (opts.indent ?? 0);
    const maxWidth = A4[0] - MARGIN - x;
    const words = safe(text).split(/\s+/);
    let line = "";
    const lines: string[] = [];
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    for (const l of lines) {
      ensure(size + 4);
      page.drawText(l, { x, y: y - size, size, font: f, color: opts.color ?? INK });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  const rule = () => {
    ensure(12);
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 0.7,
      color: GOLD,
    });
    y -= 14;
  };

  void contenu.cabinet;
  const refDoc = options.reference_dossier
    ? referenceDocument(options.reference_dossier, "DER")
    : `DER-v${contenu.version}`;

  write("DOCUMENT D'ENTREE EN RELATION (DER)", { size: 14, bold: true, gap: 2 });
  write(`Reference du document : ${refDoc}`, { size: 9, bold: true, color: GOLD, gap: 2 });
  write(
    `Version ${contenu.version} - genere le ${new Date(contenu.genere_le).toLocaleDateString("fr-FR")}`,
    { size: 9, color: MUTED, gap: 12 },
  );


  for (const s of DER_SECTIONS) {
    const texte = contenu.mentions[s.cle];
    if (!texte) continue;
    ensure(40);
    write(s.titre, { size: 11, bold: true, gap: 2 });
    write(texte, { gap: 10 });
  }

  ensure(40);
  write("6. Entreprises d'assurance partenaires et produits distribues", {
    size: 11,
    bold: true,
    gap: 4,
  });
  if (contenu.partenaires.length === 0) {
    write("Aucun partenaire actif enregistre a la date de generation du present document.", {
      color: MUTED,
      gap: 8,
    });
  } else {
    for (const p of contenu.partenaires) {
      ensure(28);
      write(p.compagnie, { size: 10, bold: true, gap: 1 });
      if (p.produits.length === 0) {
        write("- Aucun produit actif reference", { size: 9, color: MUTED, indent: 12, gap: 4 });
      } else {
        for (const prod of p.produits) {
          write(`- ${prod}`, { size: 9, indent: 12 });
        }
        y -= 4;
      }
    }
  }

  y -= 6;
  rule();
  write(
    "Le present document est remis au client prealablement a la conclusion de tout contrat, conformement aux articles L. 521-2 et suivants du Code des assurances.",
    { size: 8, color: MUTED },
  );

  return doc.save();
}
