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

/** Libellés des colonnes de valeur, adaptés à la grille de lecture de la branche. */
export type LibellesChamps = {
  plafond: string;
  franchise: string;
  delai_carence: string;
  conditions: string;
};

export const LIBELLES_CHAMPS_DEFAUT: LibellesChamps = {
  plafond: "Plafond",
  franchise: "Franchise",
  delai_carence: "Délai de carence",
  conditions: "Conditions / limites",
};

export type GrilleGaranties = {
  familleCode: string;
  libelle: string;
  version: number;
  garanties: GarantieDef[];
  /**
   * Consignes de lecture propres à la branche, transmises telles quelles à
   * l'analyse automatique : chaque type de contrat a SA grille de lecture
   * (une assurance emprunteur ne se lit pas comme une complémentaire santé).
   */
  consignes?: string[];
  /** Libellés des colonnes de valeur pour cette branche. */
  champs?: Partial<LibellesChamps>;
};

/** Libellés de colonnes effectifs d'une grille. */
export function libellesChamps(grille: GrilleGaranties | null | undefined): LibellesChamps {
  return { ...LIBELLES_CHAMPS_DEFAUT, ...(grille?.champs ?? {}) };
}


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
    champs: {
      plafond: "Montant / limite (capital, quotité, taux)",
      franchise: "Franchise (jours)",
      delai_carence: "Carence / délai d'attente",
      conditions: "Conditions de mise en jeu / exclusions",
    },
    consignes: [
      "Grille de lecture EMPRUNTEUR : on ne raisonne PAS en postes de soins ni en plafonds de remboursement par acte.",
      "Pour chaque garantie de base (Décès, PTIA, ITT, IPT, IPP, dos & psy, perte d'emploi) : indique si elle est acquise, en option ou exclue, puis ses conditions de mise en jeu (définition retenue, seuil d'invalidité, obligation d'hospitalisation ou d'intervention chirurgicale pour le dos & psy, profession de référence).",
      "Traite séparément les options (rachat dos/psy, rachat des exclusions sportives, IP Pro / invalidité professionnelle, perte d'emploi) : couverture = \"option\" et coût ou modalité dans conditions.",
      "Franchises et délais de carence : renseigne-les garantie par garantie lorsqu'ils diffèrent (ex. ITT 90 jours, dos & psy 180 jours), dans franchise et delai_carence de la ligne concernée.",
      "N'invente aucun montant : les capitaux, quotités et taux se déduisent du contrat, pas d'un barème générique.",
    ],
  },

  {
    familleCode: "prevoyance",
    libelle: "Prévoyance",
    version: 2,
    garanties: [
      GS("Garanties", "deces", "Capital décès", true),
      GS("Garanties", "deces_accidentel", "Doublement / capital en cas de décès accidentel"),
      GS("Garanties", "iad", "Invalidité absolue et définitive (IAD / PTIA)"),
      GS("Garanties", "itt", "Incapacité temporaire de travail (indemnités journalières)"),
      GS("Garanties", "ipt", "Invalidité permanente totale"),
      GS("Garanties", "ipp", "Invalidité permanente partielle"),
      GS("Garanties", "hospitalisation", "Indemnité d'hospitalisation"),
      GS("Garanties", "dependance", "Dépendance (rente)"),
      GS("Garanties", "maladies_redoutees", "Maladies redoutées / graves"),
      GS("Garanties", "rente_conjoint", "Rente de conjoint"),
      GS("Garanties", "rente_education", "Rente éducation"),
      GS("Garanties", "obseques", "Prestation obsèques / assistance funéraire"),

      GS("Prestations", "base_prestation", "Nature de la prestation (capital, rente, indemnité journalière)", true),
      GS("Prestations", "montant_garanti", "Montants garantis / plafonds de souscription", true),
      GS("Prestations", "franchise_itt", "Franchise ITT (jours)", true),
      GS("Prestations", "delai_carence", "Délais d'attente par garantie", true),
      GS("Prestations", "duree_indemnisation", "Durée maximale d'indemnisation"),
      GS("Prestations", "revalorisation", "Revalorisation des prestations"),

      GS("Portée", "ages_limites", "Âges limites (adhésion, cessation)", true),
      GS("Portée", "formalites_medicales", "Formalités médicales / questionnaire de santé", true),
      GS("Portée", "beneficiaires", "Clause bénéficiaire"),
      GS("Limites", "professions_sports", "Professions et sports à risque"),
      GS("Limites", "exclusions", "Exclusions et limitations notables", true),
    ],
    champs: {
      plafond: "Montant garanti / plafond",
      franchise: "Franchise (jours)",
      delai_carence: "Délai d'attente",
      conditions: "Conditions de versement / exclusions",
    },
    consignes: [
      "Grille de lecture PRÉVOYANCE : ce qui compte est la nature de la prestation (capital, rente, indemnité journalière), son montant, les franchises et délais d'attente, les conditions de versement.",
      "Ne transpose aucune logique santé (pas de taux de remboursement de la Sécurité sociale, pas de poste de soins).",
      "Renseigne franchise et delai_carence garantie par garantie quand ils diffèrent.",
    ],
  },
  {
    familleCode: "sante",
    libelle: "Complémentaire santé",
    version: 2,
    garanties: [
      GS("Postes de soins", "hospitalisation", "Hospitalisation (honoraires, chambre particulière, forfait)", true),
      GS("Postes de soins", "soins_courants", "Soins courants (consultations, analyses, radiologie)", true),
      GS("Postes de soins", "pharmacie", "Pharmacie et dispositifs médicaux"),
      GS("Postes de soins", "optique", "Optique (verres, monture, 100 % Santé)"),
      GS("Postes de soins", "dentaire", "Dentaire (soins, prothèses, orthodontie, 100 % Santé)"),
      GS("Postes de soins", "aides_auditives", "Aides auditives (100 % Santé)"),
      GS("Postes de soins", "medecines_douces", "Médecines douces et prévention"),
      GS("Postes de soins", "cure_maternite", "Cures, maternité et forfaits spécifiques"),

      GS("Modalités", "niveau_remboursement", "Base et taux de remboursement (% BRSS, frais réels, forfaits)", true),
      GS("Modalités", "plafonds_annuels", "Plafonds annuels et limites par acte", true),
      GS("Modalités", "delai_carence", "Délais de carence par poste", true),
      GS("Modalités", "reseau_soins", "Réseau de soins / tiers payant"),
      GS("Modalités", "assistance", "Assistance et services"),
      GS("Modalités", "responsable_100_sante", "Contrat responsable et paniers 100 % Santé", true),
      GS("Modalités", "exclusions", "Exclusions et limitations notables"),
    ],
    champs: {
      plafond: "Plafond / niveau de remboursement",
      franchise: "Franchise / reste à charge",
      delai_carence: "Délai de carence",
      conditions: "Conditions / limites",
    },
    consignes: [
      "Grille de lecture SANTÉ : postes de soins, taux et bases de remboursement (% BRSS, frais réels, forfaits en euros), plafonds annuels, délais de carence, paniers 100 % Santé.",
      "Reprends les niveaux exactement comme le tableau de garanties les exprime, sans les convertir.",
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
  {
    familleCode: "animaux",
    libelle: "Assurance chien / chat",
    version: 1,
    garanties: [
      GS("Prises en charge", "maladie", "Frais de maladie", true),
      GS("Prises en charge", "accident", "Frais d'accident", true),
      GS("Prises en charge", "chirurgie", "Chirurgie et hospitalisation"),
      GS("Prises en charge", "medicaments", "Médicaments et analyses"),
      GS("Prises en charge", "prevention", "Forfait prévention (vaccins, vermifuges, stérilisation)"),
      GS("Prises en charge", "euthanasie_deces", "Euthanasie / décès"),
      GS("Prises en charge", "rc_animal", "Responsabilité civile de l'animal"),
      GS("Prises en charge", "assistance", "Assistance (recherche, garde, rapatriement)"),

      GS("Modalités", "taux_remboursement", "Taux de remboursement des frais vétérinaires", true),
      GS("Modalités", "plafond_annuel", "Plafond annuel d'indemnisation", true),
      GS("Modalités", "franchise", "Franchise (fixe ou en pourcentage)", true),
      GS("Modalités", "delai_carence", "Délais de carence (maladie / accident)", true),

      GS("Limites", "ages_limites", "Âges limites à la souscription et à la résiliation", true),
      GS("Limites", "races_exclues", "Races, catégories et animaux exclus"),
      GS("Limites", "affections_hereditaires", "Affections héréditaires, congénitales et préexistantes", true),
      GS("Limites", "exclusions", "Autres exclusions notables"),
    ],
    champs: {
      plafond: "Plafond / taux de prise en charge",
      franchise: "Franchise",
      delai_carence: "Délai de carence",
      conditions: "Conditions / exclusions",
    },
    consignes: [
      "Grille de lecture ANIMAUX : taux de remboursement des frais vétérinaires, plafond annuel, franchise, délais de carence distincts maladie/accident, âges limites, races et affections exclues.",
      "N'applique aucune logique de complémentaire santé humaine (pas de BRSS, pas de 100 % Santé).",
    ],
  },
  {
    familleCode: "gav",
    libelle: "Garantie des accidents de la vie",
    version: 1,
    garanties: [
      GS("Événements couverts", "accidents_vie_privee", "Accidents de la vie privée", true),
      GS("Événements couverts", "accidents_medicaux", "Accidents médicaux / aléa thérapeutique"),
      GS("Événements couverts", "agressions_attentats", "Agressions et attentats"),
      GS("Événements couverts", "catastrophes", "Catastrophes naturelles et technologiques"),
      GS("Événements couverts", "deces_accidentel", "Décès accidentel"),

      GS("Indemnisation", "seuil_aipp", "Seuil d'intervention (taux d'AIPP)", true),
      GS("Indemnisation", "capital_reference", "Capital / plafond d'indemnisation par victime", true),
      GS("Indemnisation", "prejudices_indemnises", "Préjudices indemnisés (économiques et personnels)", true),
      GS("Indemnisation", "assistance", "Assistance et aide à domicile"),
      GS("Indemnisation", "delai_carence", "Délai d'attente"),

      GS("Portée", "beneficiaires", "Assurés couverts (souscripteur, conjoint, enfants)", true),
      GS("Portée", "ages_limites", "Âges limites"),
      GS("Limites", "sports_exclus", "Sports et activités exclus"),
      GS("Limites", "exclusions", "Exclusions notables", true),
    ],
    champs: {
      plafond: "Capital / plafond",
      franchise: "Seuil d'AIPP / franchise",
      delai_carence: "Délai d'attente",
      conditions: "Conditions / exclusions",
    },
    consignes: [
      "Grille de lecture GAV : événements couverts, seuil d'AIPP déclenchant l'indemnisation, capitaux et préjudices indemnisés selon le droit commun, assurés couverts.",
      "Pas de logique de remboursement de soins.",
    ],
  },
  {
    familleCode: "pj",
    libelle: "Protection juridique",
    version: 1,
    garanties: [
      GS("Domaines", "consommation", "Litiges consommation et achats", true),
      GS("Domaines", "habitation_voisinage", "Habitation, voisinage, immobilier"),
      GS("Domaines", "travail", "Droit du travail"),
      GS("Domaines", "administratif_fiscal", "Litiges administratifs et fiscaux"),
      GS("Domaines", "famille", "Droit de la famille"),
      GS("Domaines", "penal", "Défense pénale et recours"),

      GS("Prestations", "information_juridique", "Information juridique par téléphone", true),
      GS("Prestations", "prise_en_charge_honoraires", "Prise en charge des honoraires d'avocat / expertise", true),
      GS("Prestations", "plafond_par_litige", "Plafond par litige et par année", true),
      GS("Prestations", "seuil_intervention", "Seuil d'intervention (montant minimal du litige)", true),
      GS("Prestations", "libre_choix_avocat", "Libre choix de l'avocat"),

      GS("Limites", "delai_carence", "Délai de carence / d'attente", true),
      GS("Limites", "litiges_anterieurs", "Litiges antérieurs et en cours", true),
      GS("Limites", "exclusions", "Exclusions notables"),
    ],
    champs: {
      plafond: "Plafond de prise en charge",
      franchise: "Seuil d'intervention",
      delai_carence: "Délai de carence",
      conditions: "Conditions / exclusions",
    },
    consignes: [
      "Grille de lecture PROTECTION JURIDIQUE : domaines de litige couverts, seuil d'intervention, plafonds d'honoraires par litige et par an, libre choix de l'avocat, délais de carence, litiges antérieurs exclus.",
    ],
  },
  {
    familleCode: "risques_divers",
    libelle: "Risques divers (soutien financier, décès accidentel, juridique)",
    version: 1,
    garanties: [
      GS("Prestations", "capital_forfaitaire", "Capital ou prestation forfaitaire garantie", true),
      GS("Prestations", "evenements_couverts", "Événements ouvrant droit à la prestation", true),
      GS("Prestations", "beneficiaires", "Bénéficiaires de la prestation", true),
      GS("Prestations", "assistance", "Services et assistance associés"),

      GS("Modalités", "plafonds", "Plafonds et limites de garantie", true),
      GS("Modalités", "franchise", "Franchise applicable"),
      GS("Modalités", "delai_carence", "Délai de carence / d'attente", true),
      GS("Modalités", "duree_garantie", "Durée de la garantie"),

      GS("Limites", "ages_limites", "Âges limites"),
      GS("Limites", "formalites", "Formalités médicales ou déclaratives"),
      GS("Limites", "exclusions", "Exclusions notables", true),
    ],
    champs: {
      plafond: "Montant / plafond garanti",
      franchise: "Franchise",
      delai_carence: "Délai de carence",
      conditions: "Conditions / exclusions",
    },
    consignes: [
      "Grille de lecture RISQUES DIVERS : prestation forfaitaire garantie, événements déclencheurs, bénéficiaires, plafonds, délais de carence.",
      "Aucune logique de remboursement de frais de soins.",
    ],
  },
  {
    familleCode: "nomade",
    libelle: "Nomade / expatriés",
    version: 1,
    garanties: [
      GS("Couverture", "frais_medicaux_etranger", "Frais médicaux à l'étranger", true),
      GS("Couverture", "hospitalisation", "Hospitalisation à l'étranger", true),
      GS("Couverture", "rapatriement", "Rapatriement sanitaire et transport", true),
      GS("Couverture", "assistance_24h", "Assistance 24h/24 et avance de frais"),
      GS("Couverture", "responsabilite_civile", "Responsabilité civile à l'étranger"),
      GS("Couverture", "bagages", "Bagages et effets personnels"),
      GS("Couverture", "interruption_voyage", "Annulation / interruption de séjour"),
      GS("Couverture", "capital_deces_invalidite", "Capital décès / invalidité accidentelle"),

      GS("Modalités", "plafonds", "Plafonds par garantie", true),
      GS("Modalités", "franchise", "Franchises applicables", true),
      GS("Modalités", "zones_geographiques", "Zones géographiques couvertes", true),
      GS("Modalités", "duree_sejour", "Durée maximale de séjour couverte", true),
      GS("Modalités", "delai_carence", "Délai de carence"),

      GS("Limites", "pays_exclus", "Pays et zones exclus"),
      GS("Limites", "affections_preexistantes", "Affections préexistantes", true),
      GS("Limites", "exclusions", "Exclusions notables"),
    ],
    champs: {
      plafond: "Plafond par garantie",
      franchise: "Franchise",
      delai_carence: "Délai de carence",
      conditions: "Conditions / exclusions",
    },
    consignes: [
      "Grille de lecture NOMADE / EXPATRIÉS : zones géographiques et durées de séjour couvertes, plafonds par garantie, rapatriement et assistance, exclusions de pays et d'affections préexistantes.",
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
