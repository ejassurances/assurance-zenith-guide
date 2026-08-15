/**
 * Grille de conversions UGIP Assurances — Réseau courtiers (WS Emprunteur).
 *
 * Valeurs reprises du document « Grille de correspondances » fourni par
 * APPLI-KEY. Elles sont figées ici pour éviter toute dépendance à un fichier
 * Excel au runtime.
 */

/** Produits UGIP tarifiables (identifiants du web service). */
export interface UgipProduit {
  id: string;
  nom: string;
  /** Base de calcul du capital assuré : CRD (dégressif) ou CI (capital initial). */
  base: "CRD" | "CI";
  /** false = en cours de paramétrage chez UGIP, hors tarification par défaut. */
  commercialise: boolean;
  /** Produit réservé à un usage particulier (officine, leasing…). */
  specifique?: "pharmacie" | "leasing";
}

export const UGIP_PRODUITS: UgipProduit[] = [
  { id: "1", nom: "UGIP GLOBAL+ CRD", base: "CRD", commercialise: true },
  { id: "3", nom: "UGIP GLOBAL+ CI", base: "CI", commercialise: true },
  { id: "6", nom: "UGIP ZÉNITH CI", base: "CI", commercialise: true },
  { id: "8", nom: "UGIP PREMIUM CI", base: "CI", commercialise: true },
  { id: "9", nom: "UGIP PREMIUM CRD", base: "CRD", commercialise: true },
  { id: "10", nom: "UGIP PHARMA +", base: "CRD", commercialise: true, specifique: "pharmacie" },
  { id: "12", nom: "UGIP GLOBAL LEASE", base: "CRD", commercialise: true, specifique: "leasing" },
  { id: "13", nom: "UGIP PRESTIGE CRD", base: "CRD", commercialise: true },
  { id: "14", nom: "UGIP PRESTIGE CI", base: "CI", commercialise: true },
  { id: "17", nom: "UGIP SÉRÉNITÉ CRD", base: "CRD", commercialise: true },
  { id: "18", nom: "UGIP SÉRÉNITÉ CI", base: "CI", commercialise: true },
  { id: "19", nom: "UGIP START CRD", base: "CRD", commercialise: true },
  { id: "20", nom: "UGIP START CI", base: "CI", commercialise: true },
  { id: "21", nom: "UGIP AVENIR CRD", base: "CRD", commercialise: true },
  { id: "22", nom: "UGIP AVENIR CI", base: "CI", commercialise: true },
  { id: "23", nom: "UGIP OPTIMAL CI", base: "CI", commercialise: false },
  { id: "24", nom: "UGIP OPTIMAL CRD", base: "CRD", commercialise: false },
];

export function ugipProduitParId(id: string): UgipProduit | undefined {
  return UGIP_PRODUITS.find((p) => p.id === id);
}

/** Produits interrogés par défaut : commercialisés et non spécifiques. */
export function ugipProduitsStandards(): UgipProduit[] {
  return UGIP_PRODUITS.filter((p) => p.commercialise && !p.specifique);
}

/** Familles de garantie. */
export const UGIP_FAMILLE_GARANTIE = {
  DECES: "1",
  PTIA: "2",
  ITT: "3",
  IPT: "4",
  ITP: "5",
  IPP: "6",
  IPM: "7",
  RACHAT_DOS: "8",
  RACHAT_PSY: "9",
  EXONERATION_PARTIELLE: "10",
  PERTE_EMPLOI: "11",
  IPT_CAPITAL: "12",
  EXTENSION: "13",
} as const;

/** Sexe (1 = masculin, 2 = féminin) et civilité (1 = Monsieur, 2 = Madame). */
export const UGIP_SEXE = { MASCULIN: "1", FEMININ: "2" } as const;
export const UGIP_CIVILITE = { MONSIEUR: "1", MADAME: "2" } as const;

/** Périodicité de paiement et d'amortissement. */
export const UGIP_PERIODICITE = {
  MENSUEL: "1",
  TRIMESTRIEL: "2",
  SEMESTRIEL: "3",
  ANNUEL: "4",
} as const;

/** Type de prêt. */
export const UGIP_TYPE_PRET = {
  AMORTISSABLE: "1",
  PALIERS: "2",
  IN_FINE: "3",
  RELAIS: "4",
  TAUX_ZERO: "5",
} as const;

/** Type d'assuré. */
export const UGIP_TYPE_ASSURE = { EMPRUNTEUR: "1", CAUTION: "2" } as const;

/** Franchise ITT : type (absolus / relatifs) et valeur en jours. */
export const UGIP_TYPE_FRANCHISE = { ABSOLUS: "1", RELATIFS: "2" } as const;
export const UGIP_VALEUR_FRANCHISE = {
  J30: "1",
  J60: "2",
  J90: "3",
  J120: "4",
  J180: "5",
} as const;

/** Ancienneté du prêt. */
export const UGIP_ANCIENNETE_PRET = { MOINS_5_ANS: "1", PLUS_5_ANS: "2" } as const;

/** Mode d'initialisation du projet. */
export const UGIP_MODE_INITIALISATION = {
  NOUVEAU: "1",
  HAMON: "2",
  BOURQUIN: "3",
  LEMOINE_GROUPE: "4",
  LEMOINE_DELEGATION: "5",
} as const;

/** Objet de financement — mapping depuis l'objet du prêt du recueil CRM. */
export const UGIP_OBJET_FINANCEMENT: Record<string, string> = {
  residence_principale: "1",
  investissement_locatif: "2",
  construction: "3",
  residence_secondaire: "11",
  professionnel: "18",
  travaux: "14",
  rachat_credit: "7",
};

/**
 * Statut professionnel UGIP à partir de la CSP du recueil CRM
 * (voir CSP_EMPRUNTEUR dans recueil-besoins-schemas).
 */
export const UGIP_STATUT_PROFESSIONNEL: Record<string, string> = {
  cadre: "6",
  employe: "10",
  artisan: "1",
  profession_liberale: "16",
  tns: "2",
  fonctionnaire: "12",
  retraite: "20",
  sans_activite: "21",
};

/** Travail de manutention / hauteur / déplacements : valeurs les plus favorables. */
export const UGIP_DEFAUTS_RISQUE = {
  travailManutention: "1",
  travailHauteur: "1",
  deplacementPro: "1",
  professionRisque: "1",
  /** France métropolitaine. */
  paysResidenceFiscal: "1",
} as const;
