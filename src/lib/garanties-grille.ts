/**
 * Grilles de garanties standardisées par typologie (famille de produits).
 *
 * La STRUCTURE vit dans le code : elle doit être identique pour toutes les
 * compagnies d'une même branche, versionnée avec l'application, et toute
 * évolution passe par une revue. Les VALEURS validées, elles, sont stockées
 * en base (`produit_garanties`), et les propositions issues de l'analyse
 * automatique des CG/IPID dans `produit_garanties_propositions`.
 */

export type Couverture = "oui" | "non" | "option" | "inconnu";

export const COUVERTURE_LABEL: Record<Couverture, string> = {
  oui: "Couverte",
  non: "Non couverte",
  option: "En option",
  inconnu: "Non déterminé",
};

export type GarantieDef = {
  code: string;
  libelle: string;
  /** Garantie attendue par la réglementation ou par la typologie. */
  obligatoire?: boolean;
  aide?: string;
};

export type GrilleGaranties = {
  familleCode: string;
  libelle: string;
  version: number;
  garanties: GarantieDef[];
};

export type ValeurGarantie = {
  couverture: Couverture;
  plafond?: string | null;
  franchise?: string | null;
  conditions?: string | null;
  /** Extrait des CG/IPID justifiant la valeur (traçabilité du conseil). */
  extrait?: string | null;
  /** Confiance de l'extraction automatique (0 → 1), absente si saisie humaine. */
  confiance?: number | null;
};

export type ValeursGrille = Record<string, ValeurGarantie>;

const G = (code: string, libelle: string, obligatoire = false, aide?: string): GarantieDef => ({
  code,
  libelle,
  obligatoire,
  ...(aide ? { aide } : {}),
});

export const GRILLES: GrilleGaranties[] = [
  {
    familleCode: "edpm",
    libelle: "Trottinette / EDPM",
    version: 1,
    garanties: [
      G("rc_obligatoire", "Responsabilité civile (obligatoire)", true),
      G("vol", "Vol de l'engin"),
      G("dommages_bris", "Dommages / bris de l'engin"),
      G("defense_penale_recours", "Défense pénale et recours"),
      G("garantie_mobilite", "Garantie mobilité"),
      G("protection_corporelle_conducteur", "Protection corporelle du conducteur"),
      G("assistance", "Assistance"),
      G("franchise", "Franchise applicable"),
    ],
  },
  {
    familleCode: "emprunteur",
    libelle: "Assurance emprunteur",
    version: 1,
    garanties: [
      G("deces", "Décès", true),
      G("ptia", "PTIA", true),
      G("itt", "Incapacité temporaire de travail (ITT)"),
      G("ipt", "Invalidité permanente totale (IPT)"),
      G("ipp", "Invalidité permanente partielle (IPP)"),
      G("mno", "Affections dorsales / psychiques (MNO)"),
      G("perte_emploi", "Perte d'emploi"),
      G("franchise_itt", "Franchise ITT"),
      G("delai_carence", "Délai de carence"),
      G("exclusions", "Exclusions et limitations notables"),
    ],
  },
  {
    familleCode: "prevoyance",
    libelle: "Prévoyance",
    version: 1,
    garanties: [
      G("deces", "Capital décès", true),
      G("iad", "Invalidité absolue et définitive"),
      G("itt", "Incapacité temporaire de travail"),
      G("ipt", "Invalidité permanente totale"),
      G("ipp", "Invalidité permanente partielle"),
      G("rente_conjoint", "Rente de conjoint"),
      G("rente_education", "Rente éducation"),
      G("franchise_itt", "Franchise ITT"),
      G("exclusions", "Exclusions et limitations notables"),
    ],
  },
  {
    familleCode: "sante",
    libelle: "Complémentaire santé",
    version: 1,
    garanties: [
      G("hospitalisation", "Hospitalisation", true),
      G("soins_courants", "Soins courants", true),
      G("optique", "Optique"),
      G("dentaire", "Dentaire"),
      G("aides_auditives", "Aides auditives"),
      G("medecines_douces", "Médecines douces"),
      G("assistance", "Assistance"),
      G("delai_carence", "Délai de carence"),
    ],
  },
  {
    familleCode: "auto",
    libelle: "Assurance auto",
    version: 1,
    garanties: [
      G("rc_obligatoire", "Responsabilité civile (obligatoire)", true),
      G("vol", "Vol"),
      G("incendie", "Incendie"),
      G("bris_de_glace", "Bris de glace"),
      G("dommages_tous_accidents", "Dommages tous accidents"),
      G("catastrophes_naturelles", "Événements climatiques / catastrophes naturelles"),
      G("protection_conducteur", "Protection du conducteur"),
      G("defense_penale_recours", "Défense pénale et recours"),
      G("assistance", "Assistance"),
      G("vehicule_remplacement", "Véhicule de remplacement"),
      G("franchise", "Franchise applicable"),
    ],
  },
  {
    familleCode: "moto",
    libelle: "Assurance moto",
    version: 1,
    garanties: [
      G("rc_obligatoire", "Responsabilité civile (obligatoire)", true),
      G("vol", "Vol"),
      G("incendie", "Incendie"),
      G("dommages", "Dommages tous accidents"),
      G("equipement_pilote", "Équipement du pilote"),
      G("protection_conducteur", "Protection du conducteur"),
      G("defense_penale_recours", "Défense pénale et recours"),
      G("assistance", "Assistance"),
      G("franchise", "Franchise applicable"),
    ],
  },
  {
    familleCode: "mrh",
    libelle: "Multirisque habitation",
    version: 1,
    garanties: [
      G("rc_vie_privee", "Responsabilité civile vie privée", true),
      G("incendie_degats_eaux", "Incendie et dégâts des eaux", true),
      G("vol_vandalisme", "Vol et vandalisme"),
      G("bris_de_glace", "Bris de glace"),
      G("catastrophes_naturelles", "Catastrophes naturelles / événements climatiques"),
      G("dommages_electriques", "Dommages électriques"),
      G("objets_valeur", "Objets de valeur"),
      G("protection_juridique", "Protection juridique"),
      G("assistance", "Assistance"),
      G("franchise", "Franchise applicable"),
    ],
  },
  {
    familleCode: "pro",
    libelle: "Multirisque professionnelle",
    version: 1,
    garanties: [
      G("rc_exploitation", "RC exploitation", true),
      G("rc_professionnelle", "RC professionnelle"),
      G("dommages_locaux", "Dommages aux locaux et contenu"),
      G("perte_exploitation", "Perte d'exploitation"),
      G("cyber", "Cyber-risques"),
      G("protection_juridique", "Protection juridique"),
      G("assistance", "Assistance"),
      G("franchise", "Franchise applicable"),
    ],
  },
  {
    familleCode: "epargne",
    libelle: "Épargne / Retraite",
    version: 1,
    garanties: [
      G("garantie_capital", "Garantie du capital (fonds euros)"),
      G("unites_de_compte", "Unités de compte"),
      G("garantie_plancher_deces", "Garantie plancher en cas de décès"),
      G("frais_gestion", "Frais de gestion"),
      G("frais_versement", "Frais sur versement"),
      G("disponibilite", "Disponibilité / conditions de rachat"),
    ],
  },
];

/** Grille de référence d'une famille (par code de famille produit). */
export function grillePourFamille(familleCode: string | null | undefined): GrilleGaranties | null {
  if (!familleCode) return null;
  return GRILLES.find((g) => g.familleCode === familleCode) ?? null;
}

export function valeurVide(): ValeurGarantie {
  return { couverture: "inconnu", plafond: null, franchise: null, conditions: null, extrait: null };
}

/** Garanties confirmées couvertes (ou en option) et garanties exclues. */
export function synthetiserGaranties(grille: GrilleGaranties, valeurs: ValeursGrille) {
  const couvertes: string[] = [];
  const optionnelles: string[] = [];
  const nonCouvertes: string[] = [];
  const indeterminees: string[] = [];

  for (const g of grille.garanties) {
    const v = valeurs[g.code];
    const detail = [
      v?.plafond ? `plafond ${v.plafond}` : null,
      v?.franchise ? `franchise ${v.franchise}` : null,
      v?.conditions ? v.conditions : null,
    ]
      .filter(Boolean)
      .join(", ");
    const libelle = detail ? `${g.libelle} (${detail})` : g.libelle;
    switch (v?.couverture) {
      case "oui":
        couvertes.push(libelle);
        break;
      case "option":
        optionnelles.push(libelle);
        break;
      case "non":
        nonCouvertes.push(g.libelle);
        break;
      default:
        indeterminees.push(g.libelle);
    }
  }
  return { couvertes, optionnelles, nonCouvertes, indeterminees };
}
