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
  /** Section de la trame standardisée (regroupement d'affichage et de comparatif). */
  groupe?: string;
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
  /** Délai d'attente / de carence applicable à cette garantie (texte libre : « 3 mois »). */
  delai_carence?: string | null;
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

/** Ligne rattachée à une section de la trame standardisée. */
const GS = (groupe: string, code: string, libelle: string, obligatoire = false, aide?: string): GarantieDef => ({
  ...G(code, libelle, obligatoire, aide),
  groupe,
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
    /**
     * Version 2 : trame standardisée complète (identique pour tous les
     * contrats emprunteur), renseignée contrat par contrat à partir des CG,
     * de l'IPID, de la fiche produit et de la fiche CCSF. Elle permet un
     * comparatif poste à poste et un devoir de conseil sur données réelles.
     */
    version: 2,
    garanties: [
      // 1. Garanties de base
      GS("Garanties", "deces", "Décès", true),
      GS("Garanties", "ptia", "PTIA — Perte totale et irréversible d'autonomie", true),
      GS("Garanties", "itt", "Incapacité temporaire totale de travail (ITT)"),
      GS("Garanties", "ipt", "Invalidité permanente totale (IPT)"),
      GS("Garanties", "ipp", "Invalidité permanente partielle (IPP)"),
      GS("Garanties", "mno", "Affections dorsales et psychiques (MNO / dos & psy)", false, "Couverture sans conditions, sous conditions (hospitalisation, intervention) ou exclue"),
      GS("Garanties", "perte_emploi", "Perte d'emploi (chômage)"),

      // 2. Modalités d'indemnisation — décisives pour le comparatif
      GS("Indemnisation", "type_indemnisation", "Type d'indemnisation (forfaitaire ou indemnitaire)", true, "Forfaitaire = prise en charge de l'échéance quels que soient les revenus ; indemnitaire = perte de revenus réelle"),
      GS("Indemnisation", "franchise_itt", "Franchise ITT (30 / 60 / 90 / 180 jours)", true),
      GS("Indemnisation", "delai_carence", "Délai de carence / d'attente", true),
      GS("Indemnisation", "duree_indemnisation", "Durée maximale d'indemnisation ITT"),
      GS("Indemnisation", "seuil_ipp", "Seuil de prise en charge IPP / IPT (taux d'invalidité)"),
      GS("Indemnisation", "temps_partiel_therapeutique", "Reprise à temps partiel thérapeutique"),
      GS("Indemnisation", "prise_en_charge_prorata", "Prise en charge au prorata de la quotité assurée"),

      // 3. Portée du contrat
      GS("Portée", "quotites", "Quotités assurables (par emprunteur, total)"),
      GS("Portée", "capital_max", "Capital maximum assurable"),
      GS("Portée", "ages_limites", "Âges limites (adhésion et cessation des garanties)", true),
      GS("Portée", "duree_max_pret", "Durée maximale du prêt couvert"),
      GS("Portée", "base_calcul_cotisation", "Base de calcul de la cotisation (capital initial / CRD)", true),
      GS("Portée", "equivalence_ccsf", "Équivalence de garanties CCSF (11 + 4 critères)", true, "Grille CCSF permettant l'acceptation par la banque au titre de la Loi Lemoine"),

      // 4. Conditions et limites
      GS("Limites", "formalites_medicales", "Formalités médicales (questionnaire, examens, Loi Lemoine)", true),
      GS("Limites", "professions_a_risque", "Professions à risque : surprime ou exclusion"),
      GS("Limites", "sports_loisirs", "Sports et loisirs à risque"),
      GS("Limites", "deplacements_etranger", "Déplacements et séjours à l'étranger"),
      GS("Limites", "exclusions", "Exclusions et limitations notables", true),
      GS("Limites", "delai_renonciation_resiliation", "Renonciation / résiliation annuelle (Loi Lemoine)"),
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
  return {
    couverture: "inconnu",
    plafond: null,
    franchise: null,
    delai_carence: null,
    conditions: null,
    extrait: null,
  };
}

/** Ligne de tableau destinée au devoir de conseil (un poste de garantie). */
export type LigneGarantie = {
  code: string;
  libelle: string;
  couverture: Couverture;
  plafond: string | null;
  franchise: string | null;
  delai_carence: string | null;
};

/** Garanties confirmées couvertes (ou en option) et garanties exclues. */
export function synthetiserGaranties(grille: GrilleGaranties, valeurs: ValeursGrille) {
  const couvertes: string[] = [];
  const optionnelles: string[] = [];
  const nonCouvertes: string[] = [];
  const indeterminees: string[] = [];
  const detail: LigneGarantie[] = [];

  for (const g of grille.garanties) {
    const v = valeurs[g.code];
    detail.push({
      code: g.code,
      libelle: g.libelle,
      couverture: v?.couverture ?? "inconnu",
      plafond: v?.plafond ?? null,
      franchise: v?.franchise ?? null,
      delai_carence: v?.delai_carence ?? null,
    });
    const detailTexte = [
      v?.plafond ? `plafond ${v.plafond}` : null,
      v?.franchise ? `franchise ${v.franchise}` : null,
      v?.delai_carence ? `délai de carence ${v.delai_carence}` : null,
      v?.conditions ? v.conditions : null,
    ]
      .filter(Boolean)
      .join(", ");
    const libelle = detailTexte ? `${g.libelle} (${detailTexte})` : g.libelle;
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
  return { couvertes, optionnelles, nonCouvertes, indeterminees, detail };
}


/** Sections de la trame standardisée, dans l'ordre (une seule si la grille n'est pas sectionnée). */
export function groupesGrille(grille: GrilleGaranties): { groupe: string | null; garanties: GarantieDef[] }[] {
  const ordre: (string | null)[] = [];
  const parGroupe = new Map<string | null, GarantieDef[]>();
  for (const g of grille.garanties) {
    const cle = g.groupe ?? null;
    if (!parGroupe.has(cle)) {
      parGroupe.set(cle, []);
      ordre.push(cle);
    }
    parGroupe.get(cle)!.push(g);
  }
  return ordre.map((groupe) => ({ groupe, garanties: parGroupe.get(groupe)! }));
}
