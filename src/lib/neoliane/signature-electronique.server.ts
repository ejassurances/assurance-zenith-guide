/**
 * Signature électronique des documents Néoliane — SERVEUR UNIQUEMENT.
 *
 * L'EZ API n'accepte qu'un seul mode de finalisation : `handSign`
 * (`signType: "eSign"` est refusé — HTTP 400 « Le type de signature doit être
 * 'handSign' »). La signature électronique est donc réalisée **par le
 * cabinet** : le signataire signe dans nos écrans, nous apposons son
 * paraphe aux emplacements fournis par Néoliane
 * (`BAsignPositions`, `SEPAsignPositions`, `RESILIATIONsignPositions`),
 * nous incrustons le bandeau de preuve (identité, horodatage, IP, jeton)
 * puis nous déposons les PDF signés via `POST /offer/{id}/signature/documents`.
 *
 * Les PDF ne sont jamais persistés : ils transitent en mémoire uniquement.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { DocumentSigne } from "./api.server";

export interface PositionSignature {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

/** Document tel que renvoyé par `GET /offer/{id}/signature/documents`. */
export interface DocumentNeoliane {
  contractId: string;
  familyMember?: string;
  BA?: string;
  BAsignPositions?: Record<string, PositionSignature>;
  SEPA?: string;
  SEPAsignPositions?: Record<string, PositionSignature>;
  RESILIATION?: string;
  RESILIATIONsignPositions?: Record<string, PositionSignature>;
}

export interface PreuveSignature {
  /** Nom complet du signataire tel que saisi/validé côté cabinet. */
  signataire: string;
  /** Adresse IP d'origine de la signature (peut être absente). */
  ip?: string | null;
  /** Horodatage ISO 8601 de l'apposition. */
  horodatage: string;
  /** Jeton unique reporté dans le bandeau de preuve et le journal. */
  jeton: string;
}

/**
 * Origine du repère des positions renvoyées par Néoliane. PDF travaille en
 * bas-gauche ; les gabarits Néoliane sont exprimés en haut-gauche. Réglable
 * via `NEOLIANE_SIGN_POSITION_ORIGIN` = `top` (défaut) ou `bottom`.
 */
function origineY(): "top" | "bottom" {
  return (process.env["NEOLIANE_SIGN_POSITION_ORIGIN"] ?? "top").trim() === "bottom"
    ? "bottom"
    : "top";
}

function base64EnOctets(b64: string): Uint8Array {
  const propre = b64.includes(",") ? (b64.split(",").pop() as string) : b64;
  const binaire = atob(propre.replace(/\s/g, ""));
  const out = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) out[i] = binaire.charCodeAt(i);
  return out;
}

function octetsEnBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i] as number);
  return btoa(s);
}

/**
 * Appose les paraphes et le bandeau de preuve sur un PDF Base64.
 *
 * @param pdfBase64 document préremp­li non signé (Base64)
 * @param positions positions par `familyMember` fournies par Néoliane
 * @param paraphes  image PNG (data URL ou Base64) par `familyMember`
 */
export async function apposerSignatures(
  pdfBase64: string,
  positions: Record<string, PositionSignature> | undefined,
  paraphes: Record<string, string>,
  preuve: PreuveSignature,
): Promise<string> {
  const pdf = await PDFDocument.load(base64EnOctets(pdfBase64));
  const pages = pdf.getPages();
  const police = await pdf.embedFont(StandardFonts.Helvetica);

  const membres = Object.keys(positions ?? {});
  if (membres.length === 0) {
    throw new Error("Néoliane n'a fourni aucune position de signature pour ce document.");
  }

  for (const membre of membres) {
    const pos = (positions as Record<string, PositionSignature>)[membre] as PositionSignature;
    const source = paraphes[membre] ?? paraphes["holder"];
    if (!source) throw new Error(`Paraphe manquant pour le signataire « ${membre} ».`);

    const page = pages[Math.max(0, (pos.page ?? 1) - 1)];
    if (!page) throw new Error(`Page ${pos.page} absente du document à signer.`);

    const image = await pdf.embedPng(base64EnOctets(source));
    const hauteurPage = page.getSize().height;
    const y = origineY() === "top" ? hauteurPage - pos.y - pos.height : pos.y;

    // Le paraphe est ajusté dans le cadre sans déformation.
    const ratio = Math.min(pos.width / image.width, pos.height / image.height);
    const largeur = image.width * ratio;
    const hauteur = image.height * ratio;
    page.drawImage(image, {
      x: pos.x + (pos.width - largeur) / 2,
      y: y + (pos.height - hauteur) / 2,
      width: largeur,
      height: hauteur,
    });

    page.drawText(
      `Signé électroniquement par ${preuve.signataire} — ${new Date(preuve.horodatage).toLocaleString("fr-FR")}` +
        `${preuve.ip ? ` — IP ${preuve.ip}` : ""} — réf. ${preuve.jeton}`,
      {
        x: pos.x,
        y: Math.max(4, y - 9),
        size: 5.5,
        font: police,
        color: rgb(0.35, 0.35, 0.4),
      },
    );
  }

  return octetsEnBase64(await pdf.save());
}

/**
 * Signe électroniquement l'ensemble des documents d'une offre et renvoie le
 * tableau prêt pour `POST /offer/{id}/signature/documents`.
 */
export async function signerDocumentsOffre(
  documents: DocumentNeoliane[],
  paraphes: Record<string, string>,
  preuve: PreuveSignature,
): Promise<{ documents: DocumentSigne[]; journal: string[] }> {
  const parContrat = new Map<string, DocumentSigne>();
  const journal: string[] = [];

  const recuperer = (contractId: string): DocumentSigne => {
    const existant = parContrat.get(contractId);
    if (existant) return existant;
    const cree: DocumentSigne = { contractId };
    parContrat.set(contractId, cree);
    return cree;
  };

  for (const doc of documents) {
    const cible = recuperer(doc.contractId);

    if (doc.BA) {
      cible.ba = await apposerSignatures(doc.BA, doc.BAsignPositions, paraphes, preuve);
      journal.push(`BA signé (${doc.contractId})`);
    }
    if (doc.SEPA) {
      cible.sepa = await apposerSignatures(doc.SEPA, doc.SEPAsignPositions, paraphes, preuve);
      journal.push(`SEPA signé (${doc.contractId})`);
    }
    if (doc.RESILIATION) {
      const membre = doc.familyMember ?? Object.keys(doc.RESILIATIONsignPositions ?? {})[0] ?? "holder";
      const file = await apposerSignatures(
        doc.RESILIATION,
        doc.RESILIATIONsignPositions,
        paraphes,
        preuve,
      );
      cible.resiliation = [...(cible.resiliation ?? []), { familyMember: membre, file }];
      journal.push(`Mandat de résiliation signé (${doc.contractId} / ${membre})`);
    }
  }

  const prets = [...parContrat.values()].filter((d) => d.ba || d.sepa || d.resiliation?.length);
  if (prets.length === 0) throw new Error("Aucun document signable retourné par Néoliane.");
  return { documents: prets, journal };
}
