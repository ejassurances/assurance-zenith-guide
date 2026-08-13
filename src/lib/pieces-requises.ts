/**
 * Référentiel des pièces justificatives attendues par branche d'assurance
 * + règles de classement automatique des fichiers reçus.
 *
 * Fonctions pures — utilisables côté serveur comme côté client.
 */

export type CategoriePiece = "kyc" | "dossier" | "contrat" | "a_qualifier";
export type KycType = "cni" | "justificatif_domicile" | "rib";

export interface PieceRequise {
  code: string;
  libelle: string;
  categorie: CategoriePiece;
  obligatoire: boolean;
  /** Renseigné pour les pièces stockées dans client_kyc_documents */
  kyc_type?: KycType;
}

const KYC_COMMUN: PieceRequise[] = [
  { code: "cni", libelle: "Pièce d'identité (CNI ou passeport)", categorie: "kyc", obligatoire: true, kyc_type: "cni" },
  {
    code: "justificatif_domicile",
    libelle: "Justificatif de domicile (moins de 3 mois)",
    categorie: "kyc",
    obligatoire: true,
    kyc_type: "justificatif_domicile",
  },
  { code: "rib", libelle: "RIB", categorie: "kyc", obligatoire: true, kyc_type: "rib" },
];

const PAR_BRANCHE: Record<string, PieceRequise[]> = {
  emprunteur: [
    { code: "offre_pret", libelle: "Offre de prêt / tableau d'amortissement", categorie: "dossier", obligatoire: true },
    { code: "contrat_groupe", libelle: "Contrat d'assurance groupe bancaire actuel", categorie: "contrat", obligatoire: false },
    { code: "questionnaire_sante", libelle: "Questionnaire de santé", categorie: "dossier", obligatoire: false },
  ],
  sante: [
    { code: "contrat_actuel", libelle: "Contrat de complémentaire santé actuel", categorie: "contrat", obligatoire: false },
    { code: "attestation_vitale", libelle: "Attestation de droits (carte Vitale)", categorie: "dossier", obligatoire: false },
  ],
  prevoyance: [
    { code: "contrat_actuel", libelle: "Contrat de prévoyance actuel", categorie: "contrat", obligatoire: false },
    { code: "bulletin_salaire", libelle: "Dernier bulletin de salaire ou bilan (TNS)", categorie: "dossier", obligatoire: false },
  ],
  prevoyance_sante: [
    { code: "contrat_actuel", libelle: "Contrat de prévoyance / santé actuel", categorie: "contrat", obligatoire: false },
    { code: "bulletin_salaire", libelle: "Dernier bulletin de salaire ou bilan (TNS)", categorie: "dossier", obligatoire: false },
  ],
  epargne_retraite: [
    { code: "avis_imposition", libelle: "Dernier avis d'imposition", categorie: "dossier", obligatoire: true },
    { code: "releves_placements", libelle: "Relevés de placements existants", categorie: "dossier", obligatoire: false },
  ],
  iard: [
    { code: "releve_information", libelle: "Relevé d'information (auto / habitation)", categorie: "dossier", obligatoire: true },
    { code: "contrat_actuel", libelle: "Contrat en cours", categorie: "contrat", obligatoire: false },
  ],
  trottinette: [
    { code: "facture_achat", libelle: "Facture d'achat de l'engin", categorie: "dossier", obligatoire: true },
  ],
};

/** Liste complète des pièces attendues pour une branche donnée. */
export function piecesRequisesPour(typeAssurance: string): PieceRequise[] {
  return [...KYC_COMMUN, ...(PAR_BRANCHE[typeAssurance] ?? [])];
}

/**
 * Catalogue dédupliqué de toutes les pièces connues, toutes branches confondues.
 * Sert au classement manuel des pièces « à qualifier ».
 */
export function toutesPiecesConnues(): PieceRequise[] {
  const vues = new Map<string, PieceRequise>();
  for (const p of [...KYC_COMMUN, ...Object.values(PAR_BRANCHE).flat()]) {
    if (!vues.has(p.code)) vues.set(p.code, p);
  }
  return [...vues.values()];
}


interface RegleClassement {
  code: string;
  motifs: RegExp;
}

/**
 * Règles de classement basées sur le nom de fichier (et le type MIME déclaré).
 * L'ordre compte : la première règle qui matche gagne.
 */
const REGLES: RegleClassement[] = [
  { code: "cni", motifs: /(cni|carte[-_ ]?identite|identit|passeport|passport|titre[-_ ]?sejour)/i },
  { code: "justificatif_domicile", motifs: /(domicile|edf|engie|quittance|loyer|taxe[-_ ]?fonciere|facture[-_ ]?(eau|elec|gaz|internet|telecom))/i },
  { code: "rib", motifs: /(rib|iban|coordonnees[-_ ]?bancaires|bancaire)/i },
  { code: "offre_pret", motifs: /(offre[-_ ]?de[-_ ]?pret|offre[-_ ]?pret|amortissement|tableau[-_ ]?amort|pret[-_ ]?immo)/i },
  { code: "contrat_groupe", motifs: /(contrat[-_ ]?groupe|assurance[-_ ]?groupe|conditions[-_ ]?particulieres)/i },
  { code: "questionnaire_sante", motifs: /(questionnaire[-_ ]?sante|declaration[-_ ]?etat[-_ ]?sante)/i },
  { code: "avis_imposition", motifs: /(avis[-_ ]?d?[-_ ]?imposition|impots|fiscal)/i },
  { code: "releves_placements", motifs: /(releve[-_ ]?placement|assurance[-_ ]?vie|pea|per\b)/i },
  { code: "releve_information", motifs: /(releve[-_ ]?d?[-_ ]?information|bonus[-_ ]?malus)/i },
  { code: "bulletin_salaire", motifs: /(bulletin|salaire|paie|paye|bilan)/i },
  { code: "facture_achat", motifs: /(facture[-_ ]?achat|facture)/i },
  { code: "contrat_actuel", motifs: /(contrat)/i },
];

export interface ClassementResultat {
  /** Code de la pièce reconnue, ou null si non identifiable */
  code: string | null;
  categorie: CategoriePiece;
  kyc_type: KycType | null;
  libelle: string;
}

/**
 * Détermine la nature d'un fichier reçu : pièce KYC client, pièce de dossier,
 * pièce contractuelle, ou « à qualifier » si non identifiable.
 */
export function classerPiece(nomFichier: string, typeAssurance: string): ClassementResultat {
  const attendues = piecesRequisesPour(typeAssurance);
  const nom = nomFichier.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const regle of REGLES) {
    if (!regle.motifs.test(nom)) continue;
    const piece = attendues.find((p) => p.code === regle.code);
    if (!piece) continue;
    return {
      code: piece.code,
      categorie: piece.categorie,
      kyc_type: piece.kyc_type ?? null,
      libelle: piece.libelle,
    };
  }

  return { code: null, categorie: "a_qualifier", kyc_type: null, libelle: nomFichier };
}

export const CATEGORIE_LABEL: Record<CategoriePiece, string> = {
  kyc: "Conformité client (KYC)",
  dossier: "Dossier",
  contrat: "Contrat",
  a_qualifier: "À qualifier",
};

export const STATUT_PIECE_LABEL: Record<string, string> = {
  manquante: "Manquante",
  recue: "Reçue",
  validee: "Validée",
  refusee: "Refusée",
};
