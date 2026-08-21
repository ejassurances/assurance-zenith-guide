// Configuration du recueil des besoins par branche d'assurance.
// Chaque champ est stocké dans dossiers.recueil_besoins (jsonb) sous sa clé.

export type BrancheAssurance =
  | "emprunteur"
  | "sante"
  | "prevoyance"
  /** Ancienne branche combinée — conservée en lecture seule pour les dossiers existants. */
  | "prevoyance_sante"
  | "epargne_retraite"
  | "iard"
  | "trottinette"
  /** Branches « recueil basique » alignées sur les produits Néoliane. */
  | "accidents_vie"
  | "juridique"
  | "animaux"
  | "expatrie";

export type FieldType =
  | "text"
  | "number"
  | "textarea"
  | "select"
  | "checkbox"
  | "cards"
  | "yesno"
  /** Liste dynamique de personnes à couvrir (voir PersonneAssuree) */
  | "personnes"
  /** Liste dynamique des assurés emprunteurs avec quotité (voir PersonneEmprunteur) */
  | "assures_emprunteur";

/** Niveaux de couverture proposés poste par poste en complémentaire santé. */
export const NIVEAUX_SOINS = [
  { value: "minimal", label: "Minimal", description: "Couverture de base, reste à charge important" },
  { value: "normal", label: "Normal", description: "Niveau courant du marché" },
  { value: "fort", label: "Fort", description: "Remboursements renforcés" },
  { value: "optimal", label: "Optimal", description: "Couverture maximale" },
] as const;

export type NiveauSoins = (typeof NIVEAUX_SOINS)[number]["value"];

export function labelNiveauSoins(value: unknown): string | null {
  return NIVEAUX_SOINS.find((n) => n.value === value)?.label ?? null;
}

/**
 * Postes de soins du recueil santé — alignés sur la grille de garanties
 * de la famille « sante » (voir src/lib/garanties-grille.ts).
 */
export const POSTES_SOINS = [
  { key: "hospitalisation", label: "Hospitalisation" },
  { key: "soins_courants", label: "Soins courants" },
  { key: "optique", label: "Optique" },
  { key: "dentaire", label: "Dentaire" },
  { key: "aides_auditives", label: "Aides auditives" },
  { key: "medecines_douces", label: "Médecines douces" },
] as const;

/** Liens de parenté possibles pour un assuré à couvrir. */
export const LIENS_ASSURE = [
  { value: "soi_meme", label: "Soi-même (assuré principal)" },
  { value: "conjoint", label: "Conjoint" },
  { value: "enfant", label: "Enfant" },
  { value: "autre", label: "Autre ayant droit" },
] as const;

/** Régimes obligatoires proposés dans le recueil santé. */
export const REGIMES_OBLIGATOIRES = [
  { value: "salarie", label: "Salarié" },
  { value: "tns", label: "Travailleur non salarié (TNS)" },
  { value: "fonctionnaire", label: "Fonctionnaire" },
  { value: "exploitant_agricole", label: "Exploitant agricole" },
  { value: "etudiant", label: "Étudiant" },
  { value: "sans_emploi", label: "Sans emploi" },
  { value: "alsace_moselle", label: "Régime local Alsace-Moselle" },
] as const;

export type PersonneAssuree = {
  lien: string;
  date_naissance: string;
  regime: string;
};

/** Liens possibles pour un assuré de la branche emprunteur. */
export const LIENS_EMPRUNTEUR = [
  { value: "principal", label: "Assuré principal" },
  { value: "co_emprunteur", label: "Co-emprunteur" },
] as const;

/** Catégories socio-professionnelles proposées aux assurés emprunteurs. */
export const CSP_EMPRUNTEUR = [
  { value: "cadre", label: "Cadre" },
  { value: "employe", label: "Employé" },
  { value: "artisan", label: "Artisan / commerçant" },
  { value: "profession_liberale", label: "Profession libérale" },
  { value: "tns", label: "TNS" },
  { value: "fonctionnaire", label: "Fonctionnaire" },
  { value: "retraite", label: "Retraité" },
  { value: "sans_activite", label: "Sans activité" },
] as const;

/** Assuré emprunteur : la quotité est portée par chaque personne. */
export type PersonneEmprunteur = {
  lien: string;
  date_naissance: string;
  quotite_pct: number | null;
  csp: string;
  /**
   * Statut fumeur : donnée de tarification standard, jamais un questionnaire
   * médical. Aucune donnée d'état de santé (antécédents, pathologies, sports à
   * risque) n'est collectée sur la branche emprunteur — loi Lemoine.
   */
  fumeur: boolean;
};


export interface FieldOption {
  value: string;
  label: string;
  description?: string;
  /** Clé d'illustration, résolue côté UI (voir recueil-workflow.tsx) */
  imageKey?: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  options?: FieldOption[];
  placeholder?: string;
  required?: boolean;
  help?: string;
  suffix?: string;
  /** Question mise en avant dans le workflow (sinon le label est utilisé) */
  question?: string;
  /** Bloc pédagogique « bon à savoir » affiché avant la question */
  info?: string;
  infoTitle?: string;
  /** Affichage conditionnel selon les réponses déjà saisies */
  showIf?: (values: Record<string, unknown>) => boolean;
}

export interface SectionConfig {
  title: string;
  /** Sous-titre / contexte de l'étape */
  intro?: string;
  fields: FieldConfig[];
}

export interface BrancheConfig {
  value: BrancheAssurance;
  label: string;
  description: string;
  /** Branche historique : lisible sur les dossiers existants, non proposée à la création. */
  legacy?: boolean;
  sections: SectionConfig[];
}


export const BRANCHES: BrancheConfig[] = [
  {
    value: "emprunteur",
    label: "Assurance emprunteur",
    description: "Assurance de prêt immobilier ou professionnel (loi Lemoine).",
    sections: [
      {
        title: "Le prêt",
        fields: [
          { key: "banque", label: "Banque prêteuse", type: "text", placeholder: "Ex : Crédit Agricole" },
          {
            key: "objet_pret",
            label: "Objet du prêt",
            type: "select",
            options: [
              { value: "residence_principale", label: "Résidence principale" },
              { value: "residence_secondaire", label: "Résidence secondaire" },
              { value: "investissement_locatif", label: "Investissement locatif" },
              { value: "professionnel", label: "Prêt professionnel" },
            ],
          },
          { key: "capital", label: "Capital emprunté", type: "number", suffix: "€", required: true },
          { key: "duree_mois", label: "Durée restante", type: "number", suffix: "mois", required: true },
          {
            key: "capital_restant_du",
            label: "Capital restant dû",
            type: "number",
            suffix: "€",
            help: "Montant du prêt restant à rembourser — utile en cas de substitution d'assurance sur un prêt en cours.",
          },
          {
            key: "mois_restants",
            label: "Mois restants sur le crédit",
            type: "number",
            suffix: "mois",
            help: "Nombre de mois restants à compter de la date d'effet prévue au contrat : base de la commission prévisionnelle.",
          },

          { key: "taux_pret", label: "Taux nominal du prêt", type: "number", suffix: "%" },
        ],
      },
      {
        title: "Assurés à couvrir",
        intro:
          "Listez chaque personne à assurer sur le prêt : l'assuré principal et, le cas échéant, le ou les co-emprunteurs. La quotité est portée par chaque assuré (ex. 70 % / 40 %).",
        fields: [
          {
            key: "assures",
            label: "Assurés emprunteurs",
            question: "Qui doit être assuré sur ce prêt, et avec quelle quotité ?",
            type: "assures_emprunteur",
            required: true,
            help: "La date de naissance et la quotité assurée sont obligatoires pour chaque personne : elles conditionnent la tarification.",
          },
        ],
      },
      {
        title: "Tarification & valorisation",
        intro:
          "Coût de l'assurance retenue et durée de commissionnement, pour valoriser le contrat dans le portefeuille.",
        fields: [
          {
            key: "tarif_montant_total",
            label: "Montant total de l'assurance",
            type: "number",
            suffix: "€",
            help: "Coût total de l'assurance sur toute la durée retenue.",
          },
          {
            key: "tarif_cotisation_mensuelle",
            label: "Cotisation mensuelle",
            type: "number",
            suffix: "€ / mois",
          },
          {
            key: "tarif_cotisation_annuelle",
            label: "Cotisation annuelle",
            type: "number",
            suffix: "€ / an",
          },
          {
            key: "tarif_nb_annees",
            label: "Nombre d'années de commissionnement",
            type: "number",
            suffix: "ans",
            help: "Nombre d'années sur lesquelles la commission est perçue : sert au calcul de la valorisation du portefeuille.",
          },
          {
            key: "tarif_taux_commission",
            label: "Taux de commission",
            type: "number",
            suffix: "% de la cotisation",
            placeholder: "5",
            help: "Laissé vide : 5 % par défaut (barème cabinet emprunteur).",
          },

        ],
      },
      {

        title: "Besoins & attentes",
        fields: [
          {
            key: "priorite",
            label: "Priorité",
            type: "select",
            options: [
              { value: "economies", label: "Réduire le coût de l'assurance" },
              { value: "garanties", label: "Améliorer les garanties" },
              { value: "equilibre", label: "Trouver un équilibre coût / garanties" },
            ],
          },
          {
            key: "garanties_souhaitees",
            label: "Garanties souhaitées",
            type: "textarea",
            placeholder: "Décès, PTIA, IPT, ITT, IPP, exonération dos/psy…",
          },
        ],
      },
    ],
  },
  {
    value: "sante",
    label: "Complémentaire santé",
    description: "Mutuelle / complémentaire santé : assurés à couvrir, postes de soins et budget.",
    sections: [
      {
        title: "Assurés à couvrir",
        intro:
          "Listez toutes les personnes à couvrir : l'assuré principal et, le cas échéant, le conjoint, les enfants et autres ayants droit.",
        fields: [
          {
            key: "assures",
            label: "Personnes à couvrir",
            question: "Qui doit être couvert par la complémentaire santé ?",
            type: "personnes",
            required: true,
            help: "La date de naissance est obligatoire pour chaque personne : elle conditionne la tarification.",
          },
        ],
      },
      {
        title: "Postes de soins",
        intro:
          "Pour chaque poste, indiquez le niveau de couverture souhaité par le client. Ces niveaux constituent ses exigences et besoins au sens du devoir de conseil.",
        fields: POSTES_SOINS.map((p) => ({
          key: `niveau_${p.key}`,
          label: p.label,
          question: `${p.label} : quel niveau souhaite-t-il ?`,
          type: "cards" as FieldType,
          options: NIVEAUX_SOINS.map((n) => ({ value: n.value, label: n.label, description: n.description })),
        })),
      },
      {
        title: "Budget",
        fields: [
          {
            key: "budget_mensuel",
            label: "Budget mensuel souhaité (montant choisi)",
            question: "Quel budget mensuel le client souhaite-t-il consacrer à sa complémentaire santé ?",
            type: "number",
            suffix: "€/mois",
            required: true,
          },
        ],
      },
      {
        title: "Contrat actuel",
        intro: "Facultatif : à renseigner si le client dispose déjà d'une complémentaire santé.",
        fields: [
          { key: "compagnie_actuelle", label: "Compagnie actuelle", type: "text" },
          { key: "cotisation_actuelle", label: "Cotisation actuelle", type: "number", suffix: "€/mois" },
          {
            key: "motif_changement",
            label: "Motif de changement",
            type: "textarea",
            placeholder: "Tarif, garanties insuffisantes, changement de situation…",
          },
        ],
      },
    ],
  },
  {
    value: "prevoyance",
    label: "Prévoyance",
    description: "Décès, incapacité de travail, invalidité, dépendance.",
    sections: [
      {
        title: "Assurés à couvrir",
        intro:
          "Personnes à garantir. La date de naissance et le régime conditionnent la tarification des compagnies (API).",
        fields: [
          {
            key: "assures",
            label: "Personnes à couvrir",
            question: "Qui doit être couvert par la prévoyance ?",
            type: "personnes",
            help: "Nécessaire pour interroger la tarification en ligne des compagnies.",
          },
        ],
      },
      {
        title: "Situation",
        fields: [
          {
            key: "regime_social",
            label: "Régime social",
            type: "select",
            options: [
              { value: "salarie", label: "Salarié" },
              { value: "tns", label: "Travailleur non salarié (TNS)" },
              { value: "fonctionnaire", label: "Fonctionnaire" },
              { value: "profession_liberale", label: "Profession libérale" },
              { value: "retraite", label: "Retraité" },
              { value: "autre", label: "Autre" },
            ],
          },
          {
            key: "composition_foyer",
            label: "Composition du foyer",
            type: "text",
            placeholder: "Ex : couple + 2 enfants",
          },
          { key: "revenus_annuels", label: "Revenus nets annuels du foyer", type: "number", suffix: "€" },
          { key: "budget_mensuel", label: "Budget mensuel envisagé", type: "number", suffix: "€/mois" },
        ],
      },
      {
        title: "Couverture actuelle",
        fields: [
          {
            key: "prevoyance_actuelle",
            label: "Prévoyance en place",
            type: "textarea",
            placeholder: "Contrats existants (compagnie, garanties)",
          },
        ],
      },
      {
        title: "Besoins prioritaires",
        fields: [
          { key: "besoin_deces", label: "Prévoyance décès (capital / rente conjoint)", type: "checkbox" },
          { key: "besoin_incapacite", label: "Incapacité de travail (indemnités journalières)", type: "checkbox" },
          { key: "besoin_invalidite", label: "Invalidité (rente)", type: "checkbox" },
          { key: "besoin_dependance", label: "Dépendance", type: "checkbox" },
          { key: "besoin_deces_accidentel", label: "Décès accidentel", type: "checkbox" },
          { key: "objectifs", label: "Objectifs et attentes", type: "textarea" },
        ],
      },
    ],
  },
  {
    value: "prevoyance_sante",
    legacy: true,

    label: "Prévoyance & Santé",
    description: "Décès, incapacité, invalidité, complémentaire santé.",
    sections: [
      {
        title: "Situation",
        fields: [
          {
            key: "regime_social",
            label: "Régime social",
            type: "select",
            options: [
              { value: "salarie", label: "Salarié" },
              { value: "tns", label: "Travailleur non salarié (TNS)" },
              { value: "fonctionnaire", label: "Fonctionnaire" },
              { value: "profession_liberale", label: "Profession libérale" },
              { value: "retraite", label: "Retraité" },
              { value: "autre", label: "Autre" },
            ],
          },
          {
            key: "composition_foyer",
            label: "Composition du foyer",
            type: "text",
            placeholder: "Ex : couple + 2 enfants",
          },
          { key: "revenus_annuels", label: "Revenus nets annuels du foyer", type: "number", suffix: "€" },
          { key: "budget_mensuel", label: "Budget mensuel envisagé", type: "number", suffix: "€/mois" },
        ],
      },
      {
        title: "Couvertures actuelles",
        fields: [
          {
            key: "prevoyance_actuelle",
            label: "Prévoyance en place",
            type: "textarea",
            placeholder: "Contrats existants (compagnie, garanties)",
          },
          { key: "sante_actuelle", label: "Complémentaire santé en place", type: "textarea" },
        ],
      },
      {
        title: "Besoins prioritaires",
        fields: [
          { key: "besoin_deces", label: "Prévoyance décès (capital / rente conjoint)", type: "checkbox" },
          { key: "besoin_incapacite", label: "Incapacité de travail (indemnités journalières)", type: "checkbox" },
          { key: "besoin_invalidite", label: "Invalidité (rente)", type: "checkbox" },
          { key: "besoin_sante", label: "Complémentaire santé", type: "checkbox" },
          { key: "besoin_dependance", label: "Dépendance", type: "checkbox" },
          { key: "objectifs", label: "Objectifs et attentes", type: "textarea" },
        ],
      },
    ],
  },
  {
    value: "epargne_retraite",
    label: "Épargne & Retraite",
    description: "Assurance-vie, PER, capitalisation, transmission.",
    sections: [
      {
        title: "Situation patrimoniale",
        fields: [
          { key: "age", label: "Âge", type: "number", required: true },
          { key: "situation_pro", label: "Situation professionnelle", type: "text" },
          { key: "revenus_annuels", label: "Revenus nets annuels", type: "number", suffix: "€" },
          { key: "patrimoine_financier", label: "Patrimoine financier actuel", type: "number", suffix: "€" },
          { key: "patrimoine_immobilier", label: "Patrimoine immobilier", type: "number", suffix: "€" },
        ],
      },
      {
        title: "Projet",
        fields: [
          {
            key: "objectif",
            label: "Objectif principal",
            type: "select",
            options: [
              { value: "retraite", label: "Préparer la retraite" },
              { value: "transmission", label: "Transmission / succession" },
              { value: "projet", label: "Financer un projet à moyen terme" },
              { value: "defiscalisation", label: "Défiscaliser" },
              { value: "epargne_precaution", label: "Épargne de précaution" },
            ],
          },
          { key: "horizon_ans", label: "Horizon de placement", type: "number", suffix: "ans" },
          {
            key: "profil_risque",
            label: "Profil de risque",
            type: "select",
            options: [
              { value: "prudent", label: "Prudent (capital garanti)" },
              { value: "equilibre", label: "Équilibré" },
              { value: "dynamique", label: "Dynamique" },
            ],
          },
          { key: "montant_initial", label: "Versement initial envisagé", type: "number", suffix: "€" },
          { key: "versements_mensuels", label: "Versements réguliers envisagés", type: "number", suffix: "€/mois" },
        ],
      },
      {
        title: "Attentes",
        fields: [{ key: "attentes", label: "Précisions / attentes particulières", type: "textarea" }],
      },
    ],
  },
  {
    value: "iard",
    label: "IARD (Auto / Habitation / MRP)",
    description: "Assurance de dommages : auto, habitation, RC pro, multirisque.",
    sections: [
      {
        title: "Nature du risque",
        fields: [
          {
            key: "sous_type",
            label: "Type de contrat recherché",
            type: "select",
            required: true,
            options: [
              { value: "auto", label: "Auto" },
              { value: "habitation", label: "Habitation" },
              { value: "mrp", label: "Multirisque professionnelle" },
              { value: "rc_pro", label: "RC professionnelle" },
              { value: "autre_iard", label: "Autre" },
            ],
          },
          {
            key: "description_bien",
            label: "Description du bien / activité à assurer",
            type: "textarea",
            required: true,
          },
          { key: "valeur_a_assurer", label: "Valeur à assurer", type: "number", suffix: "€" },
          { key: "adresse_risque", label: "Adresse du risque", type: "text" },
        ],
      },
      {
        title: "Antécédents",
        fields: [
          {
            key: "sinistres_36mois",
            label: "Sinistres des 36 derniers mois",
            type: "textarea",
            placeholder: "Nature, date, montant",
          },
          { key: "resiliation", label: "Résiliation par un précédent assureur", type: "checkbox" },
          { key: "assureur_actuel", label: "Assureur actuel & prime annuelle", type: "text" },
        ],
      },
      {
        title: "Besoins",
        fields: [
          { key: "budget_annuel", label: "Budget annuel envisagé", type: "number", suffix: "€" },
          { key: "garanties_souhaitees", label: "Garanties souhaitées", type: "textarea" },
          { key: "franchise_max", label: "Franchise maximale acceptable", type: "number", suffix: "€" },
        ],
      },
    ],
  },
  {
    value: "trottinette",
    label: "Assurance trottinette (EDPM)",
    description: "Engins de déplacement personnel motorisés : trottinette, gyroroue, monoroue, hoverboard.",
    sections: [
      {
        title: "L'engin",
        intro: "Identifions précisément l'engin à assurer : la tarification dépend du type et de la valeur du bien.",
        fields: [
          {
            key: "type_engin",
            label: "Type d'engin",
            question: "Quel engin votre client souhaite-t-il assurer ?",
            info: "On entend par « trottinette » tout véhicule électrique sans siège, constitué d'une plateforme à deux roues et d'une planche sur laquelle l'assuré conduit debout à l'aide d'un guidon, doté d'un moteur électrique. Le transport d'enfant ou d'adulte est interdit.",
            type: "cards",
            required: true,
            options: [
              { value: "trottinette", label: "Trottinette électrique", imageKey: "trottinette" },
              { value: "gyroroue", label: "Gyroroue", imageKey: "gyroroue" },
              { value: "monoroue", label: "Monoroue", imageKey: "monoroue" },
              { value: "hoverboard", label: "Hoverboard", imageKey: "hoverboard" },
              { value: "gyropode", label: "Gyropode / Segway", imageKey: "gyropode" },
              { value: "autre_edpm", label: "Autre EDPM", imageKey: "autre" },
            ],
          },
          {
            key: "bride_25",
            label: "Engin limité à 25 km/h",
            question: "Est-ce que l'engin est limité à 25 km/h ?",
            info: "Les trottinettes électriques non homologuées (sans immatriculation) sont limitées à 25 km/h. Au-delà, elles doivent être homologuées route et immatriculées — l'assurance EDPM classique ne s'applique plus.",
            type: "yesno",
            required: true,
            options: [
              { value: "oui", label: "Oui, elle est limitée à 25 km/h" },
              { value: "non", label: "Non, elle peut aller plus vite" },
            ],
          },
          { key: "marque_modele", label: "Marque et modèle", type: "text", placeholder: "Ex : Xiaomi Pro 2" },
          { key: "valeur_bien", label: "Valeur du bien (achat)", type: "number", suffix: "€", required: true },
          { key: "date_achat", label: "Date d'achat", type: "text", placeholder: "MM/AAAA" },
          { key: "numero_serie", label: "Numéro de série", type: "text" },
        ],
      },
      {
        title: "Usage et stationnement",
        intro: "L'usage déclaré conditionne la garantie : l'usage professionnel de livraison est exclu des contrats particuliers.",
        fields: [
          {
            key: "usage",
            label: "Usage principal",
            question: "Quel est l'usage principal de l'engin ?",
            type: "cards",
            required: true,
            options: [
              { value: "loisir", label: "Loisir", description: "Promenades, trajets occasionnels" },
              { value: "trajet_travail", label: "Domicile - travail", description: "Trajets quotidiens" },
              {
                value: "professionnel",
                label: "Usage professionnel",
                description: "Livraisons, tournées régulières (souvent exclu)",
              },
              { value: "mixte", label: "Mixte", description: "Loisir et déplacements professionnels privés" },
            ],
          },
          {
            key: "declaration_usage",
            label:
              "Le client déclare utiliser cet engin pour des déplacements privés et/ou professionnels, mais en aucun cas pour des tournées régulières (livraisons, dépôts, clientèle, agences, succursales ou chantiers), ni pour du transport à titre onéreux de marchandises ou de voyageurs.",
            type: "checkbox",
            required: true,
          },
          {
            key: "lieu_stationnement",
            label: "Lieu de stationnement habituel",
            question: "Où l'engin est-il stationné habituellement ?",
            info: "Le lieu de stationnement influe directement sur la garantie vol : un stationnement sur la voie publique est généralement plus restrictif (antivol homologué exigé).",
            type: "cards",
            options: [
              { value: "domicile_interieur", label: "Au domicile, à l'intérieur" },
              { value: "garage_ferme", label: "Garage ou local fermé" },
              { value: "cave_commune", label: "Cave / local commun" },
              { value: "voie_publique", label: "Voie publique (attaché)" },
              { value: "bureau", label: "Sur le lieu de travail" },
            ],
          },
          { key: "km_annuels", label: "Kilométrage annuel estimé", type: "number", suffix: "km" },
        ],
      },
      {
        title: "Antécédents",
        intro: "Les antécédents doivent être déclarés : une omission est une fausse déclaration opposable par l'assureur.",
        fields: [
          {
            key: "sinistres_36mois",
            label: "Sinistres des 36 derniers mois",
            question: "Le client a-t-il déclaré des sinistres au cours des 36 derniers mois ?",
            type: "textarea",
            placeholder: "Nature, date, montant (vol, casse, accident…)",
          },
          { key: "resiliation", label: "Résiliation par un précédent assureur", type: "checkbox" },
          { key: "assureur_actuel", label: "Assureur actuel & prime annuelle", type: "text" },
        ],
      },
      {
        title: "Périmètre à assurer",
        intro: "Qui doit être couvert ? Cette réponse détermine la formule proposée.",
        fields: [
          {
            key: "formule",
            label: "Formule",
            question: "Faut-il assurer uniquement le client, ou aussi sa famille ?",
            info: "Formule Famille : le souscripteur, son conjoint, partenaire de PACS ou concubin et ses enfants (titulaires au minimum de l'ASSR2) sont assurés pour des déplacements privés et professionnels en trottinette électrique. Les garanties sont également acquises pour l'usage de trottinettes en libre-service, dans le respect des conditions du loueur. Le transport de passager n'est jamais couvert.",
            type: "cards",
            required: true,
            options: [
              { value: "solo", label: "Solo", description: "Le client uniquement" },
              { value: "famille", label: "Famille", description: "Client + conjoint + enfants" },
            ],
          },
        ],
      },
      {
        title: "Garanties et budget",
        intro: "Formalisons les garanties retenues et les besoins exprimés : c'est le cœur du devoir de conseil.",
        fields: [
          {
            key: "besoin_protection_conducteur",
            label: "Protection corporelle du conducteur",
            question: "Souhaite-t-il couvrir ses propres blessures en cas d'accident responsable ?",
            info: "Si le client est victime d'un accident causé par un tiers, ses blessures sont indemnisées par l'assureur du tiers. Mais s'il est seul responsable, les conséquences financières d'une invalidité ou d'un décès restent à sa charge : la garantie Protection corporelle du conducteur y répond (capital invalidité et capital décès). Attention : en cas de dommages à la tête sans casque homologué, l'indemnisation est généralement réduite de moitié.",
            type: "yesno",
            required: true,
            options: [
              { value: "oui", label: "Oui, garantie recommandée" },
              { value: "non", label: "Non, refus exprimé par le client" },
            ],
          },
          { key: "besoin_rc", label: "Responsabilité civile (obligatoire)", type: "checkbox" },
          { key: "besoin_vol", label: "Vol", type: "checkbox" },
          { key: "besoin_casse", label: "Casse / dommages matériels", type: "checkbox" },
          { key: "besoin_assistance", label: "Assistance / dépannage", type: "checkbox" },
          { key: "besoin_defense_recours", label: "Défense pénale et recours suite à accident", type: "checkbox" },
          { key: "budget_annuel", label: "Budget annuel envisagé", type: "number", suffix: "€" },
          { key: "franchise_max", label: "Franchise maximale acceptable", type: "number", suffix: "€" },
          { key: "garanties_souhaitees", label: "Précisions sur les garanties souhaitées", type: "textarea" },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------------ */
  /* Recueils basiques — informations minimales exigées par les API des    */
  /* compagnies. Ils seront remplacés par des recueils complets.           */
  /* ------------------------------------------------------------------ */
  {
    value: "accidents_vie",
    label: "Garantie des accidents de la vie",
    description: "Recueil basique : accidents de la vie privée (GAV).",
    sections: [
      {
        title: "Assurés à couvrir",
        intro: "Recueil simplifié : seules les informations exigées par la tarification sont demandées.",
        fields: [
          {
            key: "assures",
            label: "Personnes à couvrir",
            question: "Qui doit être couvert ?",
            type: "personnes",
            required: true,
            help: "Date de naissance et régime obligatoires pour la tarification.",
          },
        ],
      },
      {
        title: "Besoins",
        fields: [
          { key: "budget_mensuel", label: "Budget mensuel envisagé", type: "number", suffix: "€/mois" },
          { key: "objectifs", label: "Attentes et précisions", type: "textarea" },
        ],
      },
    ],
  },
  {
    value: "juridique",
    label: "Protection juridique",
    description: "Recueil basique : soutien et protection juridique.",
    sections: [
      {
        title: "Assurés à couvrir",
        intro: "Recueil simplifié : seules les informations exigées par la tarification sont demandées.",
        fields: [
          {
            key: "assures",
            label: "Personnes à couvrir",
            question: "Qui doit être couvert ?",
            type: "personnes",
            required: true,
            help: "Date de naissance et régime obligatoires pour la tarification.",
          },
        ],
      },
      {
        title: "Besoins",
        fields: [
          {
            key: "domaines",
            label: "Domaines de litige attendus",
            type: "textarea",
            placeholder: "Consommation, habitation, travail, voisinage…",
          },
          { key: "budget_mensuel", label: "Budget mensuel envisagé", type: "number", suffix: "€/mois" },
        ],
      },
    ],
  },
  {
    value: "animaux",
    label: "Santé animale (chien / chat)",
    description: "Recueil basique : complémentaire santé pour un chien ou un chat.",
    sections: [
      {
        title: "L'animal",
        intro: "Recueil simplifié : espèce et date de naissance sont exigées par la tarification.",
        fields: [
          {
            key: "espece",
            label: "Espèce",
            type: "select",
            required: true,
            options: [
              { value: "chien", label: "Chien" },
              { value: "chat", label: "Chat" },
            ],
          },
          { key: "nom_animal", label: "Nom de l'animal", type: "text" },
          {
            key: "date_naissance",
            label: "Date de naissance (AAAA-MM-JJ)",
            type: "text",
            required: true,
            placeholder: "2021-04-15",
          },
          { key: "race", label: "Race", type: "text" },
          { key: "antecedents", label: "Antécédents connus", type: "textarea" },
        ],
      },
      {
        title: "Besoins",
        fields: [
          { key: "budget_mensuel", label: "Budget mensuel envisagé", type: "number", suffix: "€/mois" },
          { key: "objectifs", label: "Attentes et précisions", type: "textarea" },
        ],
      },
    ],
  },
  {
    value: "expatrie",
    label: "Expatriés / nomades",
    description: "Recueil basique : couverture santé à l'étranger (nomade / expatrié).",
    sections: [
      {
        title: "Assurés à couvrir",
        intro: "Recueil simplifié : seules les informations exigées par la tarification sont demandées.",
        fields: [
          {
            key: "assures",
            label: "Personnes à couvrir",
            question: "Qui doit être couvert ?",
            type: "personnes",
            required: true,
            help: "Date de naissance et régime obligatoires pour la tarification.",
          },
        ],
      },
      {
        title: "Situation à l'étranger",
        fields: [
          { key: "pays", label: "Pays de résidence ou de destination", type: "text" },
          { key: "duree_sejour", label: "Durée prévue du séjour", type: "text", placeholder: "Ex : 2 ans" },
          { key: "budget_mensuel", label: "Budget mensuel envisagé", type: "number", suffix: "€/mois" },
          { key: "objectifs", label: "Attentes et précisions", type: "textarea" },
        ],
      },
    ],
  },
];

export function getBranche(value: string): BrancheConfig | undefined {
  return BRANCHES.find((b) => b.value === value);
}

/** Branches proposées à la création d'un nouveau dossier (hors branches historiques). */
export const BRANCHES_CREATION: BrancheConfig[] = BRANCHES.filter((b) => !b.legacy);

export function isBrancheLegacy(value: string): boolean {
  return getBranche(value)?.legacy === true;
}

export function labelForBranche(value: string): string {
  return getBranche(value)?.label ?? value;
}

export function isFieldVisible(field: FieldConfig, values: Record<string, unknown>): boolean {
  return field.showIf ? field.showIf(values) : true;
}

/** Personnes à couvrir saisies dans un champ de type « personnes ». */
export function personnesAssurees(value: unknown): PersonneAssuree[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({
      lien: typeof p.lien === "string" ? p.lien : "",
      date_naissance: typeof p.date_naissance === "string" ? p.date_naissance : "",
      regime: typeof p.regime === "string" ? p.regime : "",
    }));
}

/** Assurés emprunteurs saisis dans un champ de type « assures_emprunteur ». */
export function assuresEmprunteur(value: unknown): PersonneEmprunteur[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => {
      const q = Number(p.quotite_pct ?? NaN);
      return {
        lien: typeof p.lien === "string" ? p.lien : "",
        date_naissance: typeof p.date_naissance === "string" ? p.date_naissance : "",
        quotite_pct: Number.isFinite(q) && q > 0 ? q : null,
        csp: typeof p.csp === "string" ? p.csp : "",
        fumeur: p.fumeur === true,
      };
    });
}

/** Assuré principal de la branche emprunteur (lien « principal », sinon 1er de la liste). */
export function assurePrincipalEmprunteur(value: unknown): PersonneEmprunteur | null {
  const list = assuresEmprunteur(value);
  if (list.length === 0) return null;
  return list.find((p) => p.lien === "principal") ?? list[0]!;
}

/** Âge en années révolues à partir d'une date ISO (AAAA-MM-JJ). */
export function ageDepuisDateNaissance(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Champs obligatoires non renseignés d'une étape */
export function missingRequired(section: SectionConfig, values: Record<string, unknown>): FieldConfig[] {
  return section.fields.filter((f) => {
    if (!f.required || !isFieldVisible(f, values)) return false;
    const v = values[f.key];
    if (f.type === "checkbox") return v !== true;
    if (f.type === "personnes") {
      const list = personnesAssurees(v);
      return list.length === 0 || list.some((p) => !p.date_naissance);
    }
    if (f.type === "assures_emprunteur") {
      const list = assuresEmprunteur(v);
      return (
        list.length === 0 ||
        list.some((p) => !p.date_naissance || p.quotite_pct == null || p.quotite_pct <= 0 || p.quotite_pct > 100)
      );
    }
    return v === undefined || v === null || v === "";
  });
}

/** Champs obligatoires manquants sur l'ensemble du recueil d'une branche. */
export function champsManquantsRecueil(branche: string, values: Record<string, unknown>): FieldConfig[] {
  const b = getBranche(branche);
  if (!b) return [];
  return b.sections.flatMap((s) => missingRequired(s, values));
}

/** Le recueil des besoins de la branche est-il complet ? */
export function recueilComplet(branche: string, values: Record<string, unknown> | null | undefined): boolean {
  if (!values || Object.keys(values).length === 0) return false;
  return champsManquantsRecueil(branche, values).length === 0;
}


/* ------------------------------------------------------------------ */
/* Emprunteur : valorisation du contrat dans le portefeuille           */
/* ------------------------------------------------------------------ */

export const TAUX_COMMISSION_EMPRUNTEUR_DEFAUT = 5;

export type ValorisationEmprunteur = {
  montantTotal: number | null;
  cotisationMensuelle: number | null;
  cotisationAnnuelle: number | null;
  nbAnnees: number | null;
  tauxCommission: number;
  commissionAnnuelle: number | null;
  /** Commission cumulée sur le nombre d'années de commissionnement */
  valorisation: number | null;
};

function nombre(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Valorisation d'un contrat emprunteur : commission annuelle (taux appliqué à
 * la cotisation annuelle, à défaut au montant total ramené sur la durée) puis
 * cumul sur le nombre d'années de commissionnement.
 */
export function valorisationEmprunteur(values: Record<string, unknown>): ValorisationEmprunteur {
  const montantTotal = nombre(values["tarif_montant_total"]);
  const cotisationMensuelle = nombre(values["tarif_cotisation_mensuelle"]);
  const nbAnnees = nombre(values["tarif_nb_annees"]);
  const tauxCommission = nombre(values["tarif_taux_commission"]) ?? TAUX_COMMISSION_EMPRUNTEUR_DEFAUT;

  let cotisationAnnuelle = nombre(values["tarif_cotisation_annuelle"]);
  if (cotisationAnnuelle === null && cotisationMensuelle !== null) cotisationAnnuelle = cotisationMensuelle * 12;
  if (cotisationAnnuelle === null && montantTotal !== null && nbAnnees && nbAnnees > 0) {
    cotisationAnnuelle = montantTotal / nbAnnees;
  }

  const commissionAnnuelle =
    cotisationAnnuelle === null ? null : (cotisationAnnuelle * tauxCommission) / 100;
  const valorisation =
    commissionAnnuelle === null || nbAnnees === null ? null : commissionAnnuelle * nbAnnees;

  return {
    montantTotal,
    cotisationMensuelle,
    cotisationAnnuelle,
    nbAnnees,
    tauxCommission,
    commissionAnnuelle,
    valorisation,
  };
}
