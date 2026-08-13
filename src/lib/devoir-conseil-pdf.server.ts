import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { labelForBranche } from "@/lib/recueil-besoins-schemas";
import { OPTIONS_DECISION, STATUT_OFFRE_LABEL, type OffreComparee, type StatutOffre } from "@/lib/devoir-conseil-modeles";

/**
 * Génération native du PDF du devoir de conseil (pdf-lib, JS pur — compatible
 * runtime serverless). Mise en page soignée : bandeau d'en-tête, sections
 * numérotées, tableau comparatif des offres, encadrés de mise en garde,
 * options de décision et bloc de preuve de signature électronique.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DevoirPdfInput {
  contenu: any;
  type_assurance: string;
  statut: string;
  recommandation: string | null;
  motifs: string | null;
  mises_en_garde: string | null;
  signature_png: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  hash: string | null;
  refus_motif: string | null;
  refuse_le: string | null;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 52;
const CONTENT = A4[0] - MARGIN * 2;

const INK = rgb(0.04, 0.1, 0.18);
const WHITE = rgb(1, 1, 1);
const MUTED = rgb(0.42, 0.46, 0.52);
const GOLD = rgb(0.78, 0.63, 0.19);
const LINE = rgb(0.85, 0.87, 0.9);
const SOFT = rgb(0.96, 0.97, 0.98);
const WARN_BG = rgb(0.996, 0.965, 0.89);
const WARN_BORDER = rgb(0.85, 0.68, 0.25);
const OK = rgb(0.09, 0.44, 0.29);
const BAD = rgb(0.6, 0.14, 0.14);

/** Polices standard = WinAnsi : on neutralise les caractères non encodables. */
function safe(text: string) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u20AC/g, "EUR")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, "");
}

const euro = (v?: number | null) =>
  typeof v === "number" && Number.isFinite(v)
    ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v)} EUR`
    : "-";

const dateFr = (v?: string | null) => (v ? new Date(v).toLocaleDateString("fr-FR") : "-");
const dateHeureFr = (v?: string | null) => (v ? new Date(v).toLocaleString("fr-FR") : "-");

export async function genererPdfDevoirConseil(input: DevoirPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const c = input.contenu ?? {};
  const cab = c.cabinet ?? {};
  const cli = c.client ?? {};
  const dos = c.dossier ?? {};
  const conseil = c.conseil ?? {};

  const pages: PDFPage[] = [];
  let page = doc.addPage(A4);
  pages.push(page);
  let y = A4[1] - MARGIN;
  let section = 0;

  const newPage = () => {
    page = doc.addPage(A4);
    pages.push(page);
    y = A4[1] - MARGIN - 8;
  };
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 34) newPage();
  };

  const wrap = (text: string, f: PDFFont, size: number, maxWidth: number) => {
    const lines: string[] = [];
    for (const paragraph of safe(text).split("\n")) {
      let line = "";
      for (const w of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(candidate, size) > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = candidate;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  const para = (
    text: string,
    opts: { size?: number; bold?: boolean; italic?: boolean; color?: typeof INK; gap?: number; x?: number; width?: number } = {},
  ) => {
    const size = opts.size ?? 9.5;
    const f = opts.bold ? bold : opts.italic ? italic : font;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? CONTENT;
    for (const l of wrap(text, f, size, width)) {
      ensure(size + 4.5);
      page.drawText(l, { x, y: y - size, size, font: f, color: opts.color ?? INK });
      y -= size + 4.5;
    }
    y -= opts.gap ?? 0;
  };

  const titreSection = (titre: string) => {
    section += 1;
    ensure(40);
    y -= 8;
    page.drawText(`${section}.`, { x: MARGIN, y: y - 11, size: 11, font: bold, color: GOLD });
    page.drawText(safe(titre.toUpperCase()), {
      x: MARGIN + 20,
      y: y - 11,
      size: 10.5,
      font: bold,
      color: INK,
    });
    y -= 17;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.8, color: GOLD });
    y -= 11;
  };

  const kv = (label: string, value: string, opts: { color?: typeof INK } = {}) => {
    ensure(15);
    page.drawText(safe(label), { x: MARGIN, y: y - 9.5, size: 8.5, font, color: MUTED });
    const lines = wrap(value, bold, 9.5, CONTENT - 160);
    lines.forEach((l, i) => {
      if (i > 0) {
        y -= 13;
        ensure(15);
      }
      page.drawText(l, { x: MARGIN + 160, y: y - 9.5, size: 9.5, font: bold, color: opts.color ?? INK });
    });
    y -= 15;
  };

  const encadre = (titre: string, texte: string) => {
    const size = 9;
    const inner = CONTENT - 24;
    const lines = wrap(texte, font, size, inner);
    const h = 30 + lines.length * (size + 4);
    ensure(h + 6);
    page.drawRectangle({
      x: MARGIN,
      y: y - h,
      width: CONTENT,
      height: h,
      color: WARN_BG,
      borderColor: WARN_BORDER,
      borderWidth: 0.8,
    });
    page.drawText(safe(titre.toUpperCase()), {
      x: MARGIN + 12,
      y: y - 17,
      size: 8.5,
      font: bold,
      color: rgb(0.45, 0.32, 0.03),
    });
    let ly = y - 30;
    for (const l of lines) {
      page.drawText(l, { x: MARGIN + 12, y: ly, size, font, color: rgb(0.28, 0.2, 0.02) });
      ly -= size + 4;
    }
    y -= h + 10;
  };

  /** Tableau comparatif des offres. */
  const tableauOffres = (offres: OffreComparee[]) => {
    const cols = [
      { key: "compagnie", label: "Compagnie / produit", w: 0.34 },
      { key: "cotisation", label: "Cotisation /mois", w: 0.16 },
      { key: "cout", label: "Cout total", w: 0.16 },
      { key: "statut", label: "Appreciation", w: 0.34 },
    ];
    const widths = cols.map((col) => col.w * CONTENT);
    const headH = 20;
    ensure(headH + 30);

    page.drawRectangle({ x: MARGIN, y: y - headH, width: CONTENT, height: headH, color: INK });
    let x = MARGIN + 8;
    cols.forEach((col, i) => {
      page.drawText(safe(col.label), { x, y: y - 13.5, size: 8, font: bold, color: WHITE });
      x += widths[i]!;
    });
    y -= headH;

    offres.forEach((o, idx) => {
      const nom = [o.compagnie, o.produit].filter(Boolean).join(" - ") || "-";
      const appreciation = STATUT_OFFRE_LABEL[o.statut as StatutOffre] ?? o.statut;
      const cell1 = wrap(nom, font, 8.5, widths[0]! - 12);
      const cell4 = wrap(
        appreciation + (o.commentaire ? ` : ${o.commentaire}` : ""),
        font,
        8.5,
        widths[3]! - 12,
      );
      const rowH = Math.max(22, 12 + Math.max(cell1.length, cell4.length) * 11);
      ensure(rowH);
      if (idx % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT, height: rowH, color: SOFT });
      }
      page.drawLine({
        start: { x: MARGIN, y: y - rowH },
        end: { x: A4[0] - MARGIN, y: y - rowH },
        thickness: 0.5,
        color: LINE,
      });

      const retenue = o.statut === "retenue";
      cell1.forEach((l, i) => {
        page.drawText(l, {
          x: MARGIN + 8,
          y: y - 14 - i * 11,
          size: 8.5,
          font: retenue ? bold : font,
          color: INK,
        });
      });
      page.drawText(safe(euro(o.cotisation_mensuelle)), {
        x: MARGIN + widths[0]! + 8,
        y: y - 14,
        size: 8.5,
        font,
        color: INK,
      });
      page.drawText(safe(euro(o.cout_total)), {
        x: MARGIN + widths[0]! + widths[1]! + 8,
        y: y - 14,
        size: 8.5,
        font,
        color: INK,
      });
      cell4.forEach((l, i) => {
        page.drawText(l, {
          x: MARGIN + widths[0]! + widths[1]! + widths[2]! + 8,
          y: y - 14 - i * 11,
          size: 8.5,
          font: retenue ? bold : font,
          color: retenue ? OK : o.statut === "ecartee" ? BAD : INK,
        });
      });
      y -= rowH;
    });
    y -= 10;
  };

  /* ---------------------- En-tête ---------------------- */
  const bandH = 74;
  page.drawRectangle({ x: 0, y: A4[1] - bandH, width: A4[0], height: bandH, color: INK });
  page.drawRectangle({ x: 0, y: A4[1] - bandH - 3, width: A4[0], height: 3, color: GOLD });
  page.drawText(safe(String(cab.nom ?? "EJ Partners Assurances")), {
    x: MARGIN,
    y: A4[1] - 34,
    size: 16,
    font: bold,
    color: WHITE,
  });
  page.drawText(
    safe(`Courtier en assurances - SIRET ${cab.siret ?? "-"} - ${cab.orias ?? "-"}`),
    { x: MARGIN, y: A4[1] - 50, size: 8, font, color: rgb(0.75, 0.79, 0.84) },
  );
  page.drawText(safe(`${cab.adresse ?? ""} - ${cab.telephone ?? ""} - ${cab.email ?? ""}`), {
    x: MARGIN,
    y: A4[1] - 63,
    size: 8,
    font,
    color: rgb(0.75, 0.79, 0.84),
  });
  const titreDoc = "DEVOIR DE CONSEIL";
  page.drawText(titreDoc, {
    x: A4[0] - MARGIN - bold.widthOfTextAtSize(titreDoc, 12),
    y: A4[1] - 34,
    size: 12,
    font: bold,
    color: GOLD,
  });

  y = A4[1] - bandH - 26;

  para(safe(labelForBranche(input.type_assurance)), { size: 13, bold: true });
  para(
    `Document remis en application des articles L. 521-1 et suivants du Code des assurances (DDA) - Dossier ${dos.reference ?? "-"} - Etabli le ${dateFr(c.genere_le)}`,
    { size: 8.5, color: MUTED, gap: 6 },
  );

  /* ---------------------- Identification ---------------------- */
  titreSection("Identification des parties");
  kv("Cabinet", String(cab.nom ?? "-"));
  kv("Immatriculation", `${cab.orias ?? "-"} - SIRET ${cab.siret ?? "-"}`);
  kv("Client", String(cli.nom ?? "-"));
  if (cli.email) kv("Adresse e-mail", String(cli.email));
  if (cli.telephone) kv("Telephone", String(cli.telephone));
  kv("Reference du dossier", String(dos.reference ?? "-"));

  /* ---------------------- 2. Exigences ---------------------- */
  titreSection("Vos exigences et besoins");
  para(
    String(conseil.exigences_client ?? "Exigences et besoins recueillis lors de l'entretien de decouverte."),
    { gap: 4 },
  );

  /* ---------------------- 3. Offres comparées ---------------------- */
  const offres: OffreComparee[] = Array.isArray(conseil.offres) ? conseil.offres : [];
  if (offres.length > 0) {
    titreSection("Offres comparees et appreciation qualitative");
    para(
      "Les offres ci-dessous ont ete etudiees a garanties au moins equivalentes. L'appreciation est qualitative et motivee : aucune note chiffree n'est attribuee.",
      { size: 8.5, color: MUTED, gap: 6 },
    );
    tableauOffres(offres);
  }

  /* ---------------------- 4. Base de calcul (conditionnel) ---------------------- */
  const assiette = conseil.assiette as string | undefined;
  if (assiette) {
    titreSection("Base de calcul du cout de l'assurance");
    kv(
      "Assiette retenue",
      assiette === "capital_restant_du"
        ? "Capital restant du (tarification degressive)"
        : "Capital initial (tarification fixe)",
    );
    if (conseil.capital_assure != null) kv("Capital assure", euro(Number(conseil.capital_assure)));
    if (conseil.capital_restant_du != null)
      kv("Capital restant du", euro(Number(conseil.capital_restant_du)));
    if (conseil.quotite != null) kv("Quotite assuree", `${conseil.quotite} %`);
    if (conseil.duree_mois != null) kv("Duree residuelle", `${conseil.duree_mois} mois`);
    para(
      assiette === "capital_restant_du"
        ? "La cotisation est calculee chaque annee sur le capital restant du : elle diminue au fil du remboursement du pret."
        : "La cotisation est calculee sur le capital initial emprunte : elle reste constante pendant toute la duree du pret.",
      { size: 8.5, color: MUTED, gap: 4 },
    );
  }

  /* ---------------------- 5. Recommandation ---------------------- */
  titreSection("Notre recommandation");
  const solution = [conseil.compagnie, conseil.produit].filter(Boolean).join(" - ");
  if (solution) kv("Solution recommandee", solution, { color: OK });
  if (conseil.cotisation_mensuelle != null)
    kv("Cotisation mensuelle", euro(Number(conseil.cotisation_mensuelle)));
  if (conseil.economie_estimee != null) kv("Economie estimee", euro(Number(conseil.economie_estimee)));
  if (conseil.garanties) kv("Garanties retenues", String(conseil.garanties));
  y -= 4;
  para(String(input.recommandation ?? "-"), { gap: 4 });

  /* ---------------------- 6. Motifs ---------------------- */
  titreSection("Motifs du conseil au regard de vos exigences (point 2)");
  para(String(input.motifs ?? "-"), { gap: 4 });

  /* ---------------------- 7. Mises en garde ---------------------- */
  if (input.mises_en_garde) {
    titreSection("Mises en garde");
    encadre("A retenir avant de souscrire", input.mises_en_garde);
  }

  /* ---------------------- 8. Accusé de remise ---------------------- */
  titreSection("Accuse de remise des documents d'information");
  const remis = [
    { label: "Document d'information sur le produit d'assurance (IPID)", ok: conseil.ipid_remis !== false },
    { label: "Conditions generales et tableau de garanties (CG)", ok: conseil.cg_remis !== false },
    { label: "Grille tarifaire / proposition d'assurance", ok: conseil.tarifs_remis !== false },
    { label: "Document d'entree en relation (DER)", ok: conseil.der_remis !== false },
  ];
  for (const r of remis) {
    ensure(15);
    page.drawRectangle({
      x: MARGIN,
      y: y - 11,
      width: 9,
      height: 9,
      borderColor: INK,
      borderWidth: 0.8,
      color: r.ok ? INK : WHITE,
    });
    if (r.ok) {
      page.drawText("X", { x: MARGIN + 1.8, y: y - 9.5, size: 7.5, font: bold, color: WHITE });
    }
    page.drawText(safe(r.label), { x: MARGIN + 16, y: y - 10, size: 9, font, color: INK });
    y -= 15;
  }
  y -= 2;
  para(
    "Le client reconnait avoir recu, prealablement a toute souscription, les documents coches ci-dessus et avoir eu le temps necessaire pour en prendre connaissance.",
    { size: 8.5, color: MUTED, gap: 4 },
  );

  /* ---------------------- 9. Décision du client ---------------------- */
  titreSection("Decision du client");
  const refuse = input.statut === "refuse";
  const signe = input.statut === "signe";
  for (const opt of OPTIONS_DECISION) {
    const coche = (opt.code === "A" && signe) || (opt.code === "C" && refuse);
    ensure(34);
    page.drawRectangle({
      x: MARGIN,
      y: y - 11,
      width: 9,
      height: 9,
      borderColor: coche ? INK : LINE,
      borderWidth: 0.9,
      color: coche ? INK : WHITE,
    });
    if (coche) page.drawText("X", { x: MARGIN + 1.8, y: y - 9.5, size: 7.5, font: bold, color: WHITE });
    page.drawText(safe(opt.titre), {
      x: MARGIN + 16,
      y: y - 10,
      size: 9,
      font: bold,
      color: coche ? INK : MUTED,
    });
    y -= 15;
    para(opt.texte, { size: 8.5, color: MUTED, x: MARGIN + 16, width: CONTENT - 16, gap: 4 });
  }

  if (refuse) {
    encadre(
      "Motif de refus (mention obligatoire - option C)",
      `${input.refus_motif ?? "-"}\nRefus enregistre le ${dateHeureFr(input.refuse_le)}.`,
    );
  }

  /* ---------------------- 10. Signature ---------------------- */
  titreSection("Signature electronique du client");
  if (input.signature_png) {
    try {
      const base64 = input.signature_png.split(",").pop() ?? "";
      const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
      const png = await doc.embedPng(bytes);
      const dims = png.scale(1);
      const w = Math.min(190, dims.width);
      const h = (dims.height / dims.width) * w;
      ensure(h + 16);
      page.drawImage(png, { x: MARGIN, y: y - h, width: w, height: h });
      y -= h + 10;
    } catch {
      para("[signature illisible]", { color: MUTED });
    }
  } else {
    para(
      signe || refuse ? "Reponse enregistree sans trace graphique." : "En attente de la reponse du client.",
      { size: 9, color: MUTED, gap: 2 },
    );
  }
  kv("Statut", signe ? "Accepte et signe" : refuse ? "Refuse (option C)" : "En attente de reponse", {
    color: signe ? OK : refuse ? BAD : INK,
  });
  kv("Horodatage", dateHeureFr(input.signed_at ?? input.refuse_le));
  kv("Adresse IP", input.signed_ip ?? "-");
  kv("Empreinte SHA-256", (input.hash ?? "-").slice(0, 40) + (input.hash ? "..." : ""));
  y -= 2;
  para(
    "Signature electronique simple au sens du reglement eIDAS (article 25). La date, l'heure, l'adresse IP, le navigateur et l'empreinte du document sont conserves par le cabinet a titre de preuve.",
    { size: 8, color: MUTED, gap: 6 },
  );

  /* ---------------------- 11. Mentions légales ---------------------- */
  const mentions: string[] = Array.isArray(c.mentions_legales) ? c.mentions_legales : [];
  if (mentions.length > 0) {
    titreSection("Mentions legales et informations reglementaires");
    for (const m of mentions) {
      ensure(16);
      page.drawText("-", { x: MARGIN, y: y - 8, size: 8, font, color: GOLD });
      para(m, { size: 8, color: MUTED, x: MARGIN + 10, width: CONTENT - 10, gap: 1 });
    }
  }

  /* ---------------------- Pieds de page ---------------------- */
  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN - 14 },
      end: { x: A4[0] - MARGIN, y: MARGIN - 14 },
      thickness: 0.5,
      color: LINE,
    });
    const left = safe(`${cab.nom ?? "EJ Partners Assurances"} - ${cab.orias ?? ""} - Devoir de conseil ${dos.reference ?? ""}`);
    p.drawText(left, { x: MARGIN, y: MARGIN - 26, size: 7, font, color: MUTED });
    const right = `Page ${i + 1} / ${total}`;
    p.drawText(right, {
      x: A4[0] - MARGIN - font.widthOfTextAtSize(right, 7),
      y: MARGIN - 26,
      size: 7,
      font,
      color: MUTED,
    });
  });

  return doc.save();
}
