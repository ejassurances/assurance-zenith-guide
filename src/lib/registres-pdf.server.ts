import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* Rendus PDF des registres réglementaires (pdf-lib, JS pur — runtime serverless). */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const INK = rgb(0.04, 0.1, 0.18);
const MUTED = rgb(0.42, 0.46, 0.52);
const GOLD = rgb(0.83, 0.69, 0.22);

const CABINET = {
  nom: "EJ Partners Assurances",
  siret: "500 256 904",
  orias: "25005811",
  adresse: "71 rue du Docteur Roux, 95600 Eaubonne",
  telephone: "01 89 31 40 29",
};

function safe(text: string) {
  return (text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\u00A1-\u00FF]/g, "");
}

type Ecrivain = {
  write: (text: string, opts?: { size?: number; bold?: boolean; color?: typeof INK; gap?: number; indent?: number }) => void;
  trait: () => void;
  saut: () => void;
  finaliser: () => Promise<Uint8Array>;
};

async function creerDocument(titre: string, sousTitre: string): Promise<Ecrivain> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  const nouvellePage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };

  const write: Ecrivain["write"] = (text, opts = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    const x = MARGIN + (opts.indent ?? 0);
    const maxWidth = A4[0] - MARGIN - x;
    const lignes: string[] = [];
    for (const paragraphe of safe(text).split("\n")) {
      let ligne = "";
      for (const mot of paragraphe.split(/\s+/)) {
        const candidat = ligne ? `${ligne} ${mot}` : mot;
        if (f.widthOfTextAtSize(candidat, size) > maxWidth && ligne) {
          lignes.push(ligne);
          ligne = mot;
        } else ligne = candidat;
      }
      lignes.push(ligne);
    }
    for (const l of lignes) {
      if (y - (size + 4) < MARGIN) nouvellePage();
      page.drawText(l, { x, y: y - size, size, font: f, color: opts.color ?? INK });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  const trait = () => {
    if (y - 10 < MARGIN) nouvellePage();
    page.drawRectangle({ x: MARGIN, y: y - 4, width: A4[0] - 2 * MARGIN, height: 1, color: GOLD });
    y -= 12;
  };

  // En-tête
  write(CABINET.nom, { size: 16, bold: true });
  write(
    `SIRET ${CABINET.siret} — ORIAS ${CABINET.orias} — ${CABINET.adresse} — ${CABINET.telephone}`,
    { size: 8, color: MUTED, gap: 6 },
  );
  trait();
  write(titre, { size: 14, bold: true });
  write(sousTitre, { size: 9, color: MUTED, gap: 8 });

  return {
    write,
    trait,
    saut: () => {
      y -= 10;
    },
    finaliser: async () => doc.save(),
  };
}

/** Attestation de contrôle « Gel des avoirs » (preuve archivée sur Drive). */
export async function genererPdfGelAvoirs(params: {
  reference_client: string;
  nom_client: string;
  date_naissance: string | null;
  effectue_le: string;
  effectue_par: string;
  resultat: string;
  observations: string | null;
  niveau_vigilance: string | null;
  score_risque: number | null;
}): Promise<Uint8Array> {
  const d = await creerDocument(
    "Attestation de controle - Gel des avoirs",
    "Registre LCB-FT — art. L.562-1 et suivants du Code monetaire et financier",
  );
  const fmt = (v: string) => new Date(v).toLocaleString("fr-FR");

  d.write("Client controle", { size: 11, bold: true });
  d.write(`Reference : ${params.reference_client}`);
  d.write(`Identite : ${params.nom_client}`);
  d.write(`Date de naissance : ${params.date_naissance ? new Date(params.date_naissance).toLocaleDateString("fr-FR") : "non renseignee"}`, { gap: 8 });

  d.trait();
  d.write("Controle effectue", { size: 11, bold: true });
  d.write(`Nature : consultation de la liste nationale et europeenne des mesures de gel des avoirs`);
  d.write(`Horodatage : ${fmt(params.effectue_le)}`);
  d.write(`Realise par : ${params.effectue_par}`);
  d.write(`Resultat : ${params.resultat}`);
  if (params.observations) d.write(`Observations : ${params.observations}`);
  d.write(
    `Profil de risque LCB-FT : ${params.niveau_vigilance ?? "non evalue"}${params.score_risque !== null ? ` (score ${params.score_risque}/100)` : ""}`,
    { gap: 8 },
  );

  d.trait();
  d.write(
    "En cas de correspondance confirmee, le cabinet applique sans delai les mesures de gel, s'abstient de nouer ou poursuivre la relation d'affaires et adresse une declaration a la Direction generale du Tresor ainsi qu'une declaration de soupcon a TRACFIN.",
    { size: 9, color: MUTED, gap: 10 },
  );
  d.write("Document genere automatiquement par le CRM du cabinet — a conserver 5 ans.", {
    size: 8,
    color: MUTED,
  });
  return d.finaliser();
}

type TraitementRgpd = {
  nom_traitement: string;
  finalite: string | null;
  base_legale: string | null;
  categories_donnees: string | null;
  personnes_concernees: string | null;
  destinataires: string | null;
  sous_traitants: string | null;
  duree_conservation: string | null;
  mesures_securite: string | null;
  transfert_hors_ue: boolean;
  version: number;
  revise_le: string | null;
};

/** Registre des traitements RGPD (art. 30) — export PDF archivé au registre DDA/ACPR. */
export async function genererPdfRegistreRgpd(lignes: TraitementRgpd[]): Promise<Uint8Array> {
  const version = lignes.length ? Math.max(...lignes.map((l) => l.version)) : 1;
  const d = await creerDocument(
    "Registre des traitements de donnees a caractere personnel",
    `RGPD art. 30 — version ${version} — edite le ${new Date().toLocaleDateString("fr-FR")}`,
  );

  d.write(
    `Responsable de traitement : ${CABINET.nom}, ${CABINET.adresse}. Courtier en assurances immatricule a l'ORIAS sous le numero ${CABINET.orias}.`,
    { size: 9, color: MUTED, gap: 8 },
  );

  if (lignes.length === 0) d.write("Aucun traitement enregistre.", { color: MUTED });

  for (const l of lignes) {
    d.trait();
    d.write(l.nom_traitement, { size: 11, bold: true });
    const champs: [string, string | null][] = [
      ["Finalite", l.finalite],
      ["Base legale", l.base_legale],
      ["Categories de donnees", l.categories_donnees],
      ["Personnes concernees", l.personnes_concernees],
      ["Destinataires", l.destinataires],
      ["Sous-traitants", l.sous_traitants],
      ["Duree de conservation", l.duree_conservation],
      ["Mesures de securite", l.mesures_securite],
      ["Transfert hors UE", l.transfert_hors_ue ? "Oui (clauses contractuelles types)" : "Non"],
      ["Derniere revision", l.revise_le ? new Date(l.revise_le).toLocaleDateString("fr-FR") : "non validee"],
    ];
    for (const [label, valeur] of champs) {
      d.write(`${label} : ${valeur ?? "—"}`, { size: 9, indent: 8 });
    }
    d.saut();
  }
  return d.finaliser();
}

type SystemeDora = {
  nom: string;
  fournisseur: string | null;
  categorie: string;
  criticite: string;
  donnees_traitees: string | null;
  localisation_donnees: string | null;
  plan_continuite: string | null;
  derniere_revue_le: string | null;
  actif: boolean;
};

type IncidentDora = {
  titre: string;
  gravite: string;
  statut: string;
  survenu_le: string;
  resolu_le: string | null;
  impact_donnees: boolean;
  notification_acpr: boolean;
  notification_cnil: boolean;
  mesures_correctives: string | null;
};

/** Registre DORA : systèmes tiers et incidents informatiques. */
export async function genererPdfRegistreDora(
  systemes: SystemeDora[],
  incidents: IncidentDora[],
): Promise<Uint8Array> {
  const d = await creerDocument(
    "Registre DORA - Systemes tiers et incidents informatiques",
    `Resilience operationnelle numerique — edite le ${new Date().toLocaleDateString("fr-FR")}`,
  );

  d.write("1. Prestataires de services informatiques tiers", { size: 11, bold: true, gap: 4 });
  if (systemes.length === 0) d.write("Aucun systeme enregistre.", { color: MUTED });
  for (const s of systemes) {
    d.write(`${s.nom}${s.actif ? "" : " (inactif)"}`, { size: 10, bold: true });
    d.write(`Fournisseur : ${s.fournisseur ?? "—"} — Categorie : ${s.categorie} — Criticite : ${s.criticite}`, { size: 9, indent: 8 });
    d.write(`Donnees traitees : ${s.donnees_traitees ?? "—"}`, { size: 9, indent: 8 });
    d.write(`Localisation des donnees : ${s.localisation_donnees ?? "—"}`, { size: 9, indent: 8 });
    d.write(`Plan de continuite : ${s.plan_continuite ?? "—"}`, { size: 9, indent: 8 });
    d.write(`Derniere revue : ${s.derniere_revue_le ? new Date(s.derniere_revue_le).toLocaleDateString("fr-FR") : "—"}`, { size: 9, indent: 8, gap: 6 });
  }

  d.trait();
  d.write("2. Registre des incidents informatiques", { size: 11, bold: true, gap: 4 });
  if (incidents.length === 0) d.write("Aucun incident declare sur la periode.", { color: MUTED });
  for (const i of incidents) {
    d.write(`${i.titre} — ${i.gravite} — ${i.statut}`, { size: 10, bold: true });
    d.write(
      `Survenu le ${new Date(i.survenu_le).toLocaleString("fr-FR")}${i.resolu_le ? ` — resolu le ${new Date(i.resolu_le).toLocaleString("fr-FR")}` : ""}`,
      { size: 9, indent: 8 },
    );
    d.write(
      `Impact donnees personnelles : ${i.impact_donnees ? "oui" : "non"} — Notification ACPR : ${i.notification_acpr ? "oui" : "non"} — Notification CNIL : ${i.notification_cnil ? "oui" : "non"}`,
      { size: 9, indent: 8 },
    );
    d.write(`Mesures correctives : ${i.mesures_correctives ?? "—"}`, { size: 9, indent: 8, gap: 6 });
  }
  return d.finaliser();
}
