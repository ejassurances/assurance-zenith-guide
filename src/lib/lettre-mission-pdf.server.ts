import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getBranche, labelForBranche } from "@/lib/recueil-besoins-schemas";
import {
  PDF_FOOTER_HEIGHT,
  dessinerEntete,
  dessinerPiedsDePage,
  referenceDocument,
} from "@/lib/pdf-entete-pied";

/**
 * Génération native du PDF de la lettre de mission signée (pdf-lib, JS pur —
 * compatible runtime serverless). Aucune dépendance externe, aucun Google Doc.
 */

type Contenu = {
  cabinet?: Record<string, string | null>;
  client?: Record<string, string | null>;
  dossier?: { reference?: string; type_assurance?: string };
  recueil_besoins?: Record<string, unknown>;
  genere_le?: string;
};

export interface LettrePdfInput {
  contenu: Contenu;
  type_assurance: string;
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

/** pdf-lib + polices standard = WinAnsi : on retire ce qui n'est pas encodable. */
function safe(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, "");
}

export async function genererPdfLettreMission(input: LettrePdfInput): Promise<Uint8Array> {
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

  const kv = (label: string, value: string) => {
    ensure(16);
    page.drawText(safe(label), { x: MARGIN, y: y - 10, size: 9, font, color: MUTED });
    const v = safe(value);
    const w = font.widthOfTextAtSize(v, 10);
    page.drawText(v, { x: A4[0] - MARGIN - w, y: y - 10, size: 10, font: bold, color: INK });
    y -= 16;
  };

  const c = input.contenu ?? {};
  const cab = c.cabinet ?? {};
  const cli = c.client ?? {};
  const dos = c.dossier ?? {};

  write("LETTRE DE MISSION DE COURTAGE", { size: 14, bold: true, gap: 2 });
  write(`Reference du document : ${referenceDocument(dos.reference, "LM")}`, {
    size: 9,
    bold: true,
    color: GOLD,
    gap: 2,
  });
  write(
    `${labelForBranche(input.type_assurance)} - Dossier ${dos.reference ?? "-"}`,
    { size: 10, color: MUTED, gap: 10 },
  );

  // Parties
  write("1. Les parties", { size: 11, bold: true, gap: 2 });
  kv("Client", String(cli.nom ?? "-"));
  if (cli.email) kv("Email", String(cli.email));
  if (cli.telephone) kv("Telephone", String(cli.telephone));
  y -= 6;

  // Objet
  write("2. Objet de la mission", { size: 11, bold: true, gap: 2 });
  write(
    `Le client donne mandat au cabinet ${cab.nom ?? ""}, courtier en assurances immatricule a l'ORIAS sous le numero ${cab.orias ?? "-"}, afin d'analyser ses besoins en ${labelForBranche(input.type_assurance).toLowerCase()}, de rechercher et presenter les solutions les plus adaptees aupres des compagnies partenaires, et de l'accompagner dans la souscription, le suivi et le cas echeant la gestion des sinistres.`,
    { gap: 8 },
  );

  // Recueil des besoins
  write("3. Recueil des besoins et exigences", { size: 11, bold: true, gap: 4 });
  const branche = getBranche(input.type_assurance);
  const r = (c.recueil_besoins ?? {}) as Record<string, unknown>;
  let auMoinsUne = false;
  branche?.sections.forEach((s) => {
    const rows = s.fields
      .map((f) => {
        const v = r[f.key];
        if (v === undefined || v === null || v === "" || v === false) return null;
        const label = f.options?.find((o) => o.value === v)?.label;
        const value = typeof v === "boolean" ? "Oui" : (label ?? String(v));
        return { label: f.label, value: `${value}${f.suffix ? ` ${f.suffix}` : ""}` };
      })
      .filter(Boolean) as { label: string; value: string }[];
    if (rows.length === 0) return;
    auMoinsUne = true;
    ensure(30);
    write(s.title.toUpperCase(), { size: 8, color: MUTED, gap: 2 });
    rows.forEach((row) => kv(row.label, row.value));
    y -= 4;
  });
  if (!auMoinsUne) write("Aucune reponse enregistree.", { color: MUTED, gap: 6 });

  // Rémunération
  y -= 4;
  write("4. Remuneration et duree", { size: 11, bold: true, gap: 2 });
  write(
    "La remuneration du courtier s'effectue par commission versee par la compagnie retenue, conformement au document d'information (DER) remis et signe par le client. Le present mandat prend effet a sa signature et peut etre revoque a tout moment sur simple demande ecrite.",
    { gap: 10 },
  );

  // Signature
  ensure(190);
  rule();
  write("5. Signature electronique du client", { size: 11, bold: true, gap: 4 });

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
