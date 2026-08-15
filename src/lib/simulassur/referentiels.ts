/**
 * Référentiels Simulassur (codes documentés) et catégorisation CRM des
 * statuts de suivi. Module client-safe : aucun secret, aucun accès réseau.
 */

/** Civilité Simulassur : 1 = Monsieur, 2 = Madame. */
export function civiliteSimulassur(valeur: unknown): 1 | 2 {
  const v = String(valeur ?? "").trim().toLowerCase();
  if (v.startsWith("mme") || v.startsWith("madame") || v === "f" || v === "femme") return 2;
  return 1;
}

/** Situation familiale (codes documentés). */
export const SITUATION_FAMILIALE: Record<string, number> = {
  celibataire: 1,
  marie: 2,
  mariee: 2,
  pacse: 3,
  pacsee: 3,
  concubinage: 4,
  divorce: 5,
  divorcee: 5,
  veuf: 6,
  veuve: 6,
};

export function situationFamilialeSimulassur(valeur: unknown): number {
  const v = String(valeur ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return SITUATION_FAMILIALE[v] ?? 1;
}

/**
 * Professions Simulassur : correspondance depuis les CSP du recueil CRM.
 * 1 = sans activité, 2 = salarié cadre / non cadre, 3 = profession libérale,
 * 4 = artisan / commerçant, 5 = fonctionnaire, 6 = retraité, 7 = étudiant.
 */
export const PROFESSION: Record<string, number> = {
  sans_activite: 1,
  sans_emploi: 1,
  salarie: 2,
  cadre: 2,
  employe: 2,
  liberal: 3,
  profession_liberale: 3,
  artisan: 4,
  commercant: 4,
  agriculteur: 4,
  tns: 4,
  fonctionnaire: 5,
  retraite: 6,
  etudiant: 7,
};

export function professionSimulassur(csp: unknown): number {
  const v = String(csp ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  return PROFESSION[v] ?? 2;
}

/**
 * Professions pour lesquelles la documentation rend le champ `handling`
 * (port de charges) obligatoire : artisan / commerçant / agriculteur.
 */
export const PROFESSIONS_HANDLING_REQUIS = [4];

export function handlingRequis(professionCode: number): boolean {
  return PROFESSIONS_HANDLING_REQUIS.includes(professionCode);
}

/** Qualification du projet (options.projectQualification). */
export const QUALIFICATION_PROJET: Record<string, number> = {
  residence_principale: 1,
  residence_secondaire: 2,
  investissement_locatif: 3,
  travaux: 4,
  rachat_credit: 5,
  professionnel: 6,
};

export function qualificationProjetSimulassur(objet: unknown): number {
  const v = String(objet ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  return QUALIFICATION_PROJET[v] ?? 1;
}

/**
 * État du projet (options.projectState). 6 = prêt déjà en place (substitution
 * d'un contrat groupe), valeur de l'exemple documenté.
 */
export const ETAT_PROJET_PRET_EN_PLACE = 6;
export const ETAT_PROJET_RECHERCHE = 1;

/** Type de prêt (loans[n].type) — 1 = amortissable, 2 = in fine, 3 = relais. */
export const TYPE_PRET: Record<string, number> = {
  amortissable: 1,
  in_fine: 2,
  relais: 3,
};

/** Type de taux (loans[n].rateType) — 1 = fixe, 2 = variable. */
export const TYPE_TAUX_FIXE = 1;

/** Garanties Simulassur (orthographe `waranties` conservée côté payload). */
export interface GarantiesSimulassur {
  /** Incapacité permanente — intégration en cours chez Simulassur : forcée à false. */
  ip: boolean;
  ipp: boolean;
  ipt: boolean;
  itp: boolean;
  itt: boolean;
  dos: boolean;
  psy: boolean;
  pe: boolean;
  quotity: string;
}

/** Garanties standard du cabinet : Décès/PTIA, IPT, ITT/ITP, sans dos/psy. */
export function garantiesStandard(quotitePct: number): GarantiesSimulassur {
  return {
    ip: false,
    ipp: false,
    ipt: true,
    itp: true,
    itt: true,
    dos: false,
    psy: false,
    pe: false,
    quotity: String(Math.max(1, Math.min(100, Math.round(quotitePct)))),
  };
}

/** Types de documents publiés par l'API. */
export const TYPES_DOCUMENTS = ["fmc", "fsi", "cg", "devis"] as const;
export type TypeDocumentSimulassur = (typeof TYPES_DOCUMENTS)[number];

export const LIBELLE_DOCUMENT: Record<TypeDocumentSimulassur, string> = {
  fmc: "Fiche de mise en concurrence",
  fsi: "Fiche standardisée d'information",
  cg: "Conditions générales",
  devis: "Devis",
};

/** Catégories CRM d'un statut de suivi Simulassur. */
export type CategorieSuivi =
  | "action_client"
  | "action_conseiller"
  | "instruction"
  | "finalisation"
  | "resiliation"
  | "autre";

const MOTS_CATEGORIE: { categorie: CategorieSuivi; motifs: string[] }[] = [
  { categorie: "action_client", motifs: ["espace client", "souscription", "demande signee", "signée", "signee"] },
  { categorie: "action_conseiller", motifs: ["devoir de conseil", "retour courtier", "anomalie"] },
  { categorie: "instruction", motifs: ["etudier", "étudier", "medical", "médical", "information", "analyse"] },
  { categorie: "finalisation", motifs: ["contrat actif", "edition", "édition", "avenant"] },
  { categorie: "resiliation", motifs: ["mandat", "resiliation", "résiliation", "substitution", "retour banque", "accord", "sans suite"] },
];

/**
 * Attribue une catégorie CRM à un libellé Simulassur, tout en conservant la
 * valeur brute pour affichage et traçabilité.
 */
export function categoriserStatut(libelle: unknown): CategorieSuivi {
  const v = String(libelle ?? "").toLowerCase();
  if (!v) return "autre";
  for (const { categorie, motifs } of MOTS_CATEGORIE) {
    if (motifs.some((m) => v.includes(m))) return categorie;
  }
  return "autre";
}

export const LIBELLE_CATEGORIE: Record<CategorieSuivi, string> = {
  action_client: "Action client attendue",
  action_conseiller: "Action conseiller",
  instruction: "Instruction / étude",
  finalisation: "Finalisation",
  resiliation: "Résiliation",
  autre: "À qualifier",
};

/** Catégories qui doivent créer une tâche pour le conseiller. */
export function exigeTacheConseiller(categorie: CategorieSuivi): boolean {
  return categorie === "action_conseiller";
}
