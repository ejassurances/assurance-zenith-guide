import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PDF_FOOTER_HEIGHT, dessinerEntete, dessinerPiedsDePage } from "@/lib/pdf-entete-pied";
import { sectionsContratMandataire, type ContratMandataireVariables } from "@/lib/mandataire-contrat-modele";

export interface ContratMandatairePdfInput {
  reference: string;
  variables: ContratMandataireVariables;
  signature_png: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  document_hash: string | null;
}

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

export async function genererPdfContratMandataire(input: ContratMandatairePdfInput): Promise<Uint8Array> {
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
    opts: { size?: number; bold?: boolean; color?: typeof INK; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const maxWidth = A4[0] - MARGIN * 2;
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
      page.drawText(l, { x: MARGIN, y: y - size, size, font: f, color: opts.color ?? INK });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  const kv = (label: string, value: string) => {
    ensure(16);
    page.drawText(safe(label), { x: MARGIN, y: y - 10, size: 9, font, color: MUTED });
    const v = safe(value);
    const w = font.widthOfTextAtSize(v, 10);
    page.drawText(v, { x: A4[0] - MARGIN - w, y: y - 10, size: 10, font: bold, color: INK });
    y -= 16;
  };

  const rule = () => {
    ensure(12);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.7, color: GOLD });
    y -= 14;
  };

  write("CONTRAT INTERNE MANDATAIRE", { size: 14, bold: true, gap: 2 });
  write(`Reference du document : ${input.reference}`, { size: 9, bold: true, color: GOLD, gap: 10 });

  for (const section of sectionsContratMandataire(input.variables)) {
    write(section.titre, { size: 11, bold: true, gap: 3 });
    write(section.texte, { gap: 10 });
  }

  ensure(190);
  rule();
  write("Signature electronique du mandataire", { size: 11, bold: true, gap: 4 });

  if (input.signature_png) {
    try {
      const base64 = input.signature_png.split(",").pop() ?? "";
      const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
      const png = await doc.embedPng(bytes);
      const dims = png.scale(1);
      const w = Math.min(200, dims.width);
      const h = (dims.height / dims.width) * w;
      ensure(h + 20);
      page.drawImage(png, { x: MARGIN, y: y - h, width: w, height: h });
      y -= h + 10;
    } catch {
      write("[signature illisible]", { color: MUTED });
    }
  }

  kv("Signee le", input.signed_at ? new Date(input.signed_at).toLocaleString("fr-FR") : "-");
  kv("Adresse IP", input.signed_ip ?? "-");
  kv("Empreinte SHA-256", (input.document_hash ?? "-").slice(0, 32) + "...");
  y -= 6;
  write(
    "Signature electronique simple au sens du reglement eIDAS (article 25). La date, l'heure, l'adresse IP, le navigateur et l'empreinte du document sont conserves par le cabinet a titre de preuve.",
    { size: 8, color: MUTED },
  );

  dessinerPiedsDePage(doc, { font, margin: MARGIN });
  return doc.save();
}
