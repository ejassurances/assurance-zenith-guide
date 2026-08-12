// Configuration du recueil des besoins par branche d'assurance.
// Chaque champ est stocké dans dossiers.recueil_besoins (jsonb) sous sa clé.

export type BrancheAssurance = "emprunteur" | "prevoyance_sante" | "epargne_retraite" | "iard" | "trottinette";

export type FieldType = "text" | "number" | "textarea" | "select" | "checkbox" | "cards" | "yesno";

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
          { key: "taux_pret", label: "Taux nominal du prêt", type: "number", suffix: "%" },
          { key: "quotite", label: "Quotité assurée", type: "number", suffix: "%", placeholder: "100" },
        ],
      },
      {
        title: "Assuré principal",
        fields: [
          { key: "age", label: "Âge de l'assuré", type: "number", required: true },
          {
            key: "csp",
            label: "Catégorie socio-professionnelle",
            type: "select",
            options: [
              { value: "cadre", label: "Cadre" },
              { value: "employe", label: "Employé" },
              { value: "artisan", label: "Artisan / commerçant" },
              { value: "profession_liberale", label: "Profession libérale" },
              { value: "tns", label: "TNS" },
              { value: "fonctionnaire", label: "Fonctionnaire" },
              { value: "retraite", label: "Retraité" },
              { value: "sans_activite", label: "Sans activité" },
            ],
          },
          { key: "fumeur", label: "Fumeur (ou vapoteur)", type: "checkbox" },
          {
            key: "sports_risque",
            label: "Sports à risque pratiqués",
            type: "text",
            placeholder: "Aucun / Moto / Alpinisme…",
          },
          { key: "antecedents_sante", label: "Antécédents de santé notables", type: "textarea" },
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
    value: "prevoyance_sante",
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
];

export function getBranche(value: string): BrancheConfig | undefined {
  return BRANCHES.find((b) => b.value === value);
}

export function labelForBranche(value: string): string {
  return getBranche(value)?.label ?? value;
}

export function isFieldVisible(field: FieldConfig, values: Record<string, unknown>): boolean {
  return field.showIf ? field.showIf(values) : true;
}

/** Champs obligatoires non renseignés d'une étape */
export function missingRequired(section: SectionConfig, values: Record<string, unknown>): FieldConfig[] {
  return section.fields.filter((f) => {
    if (!f.required || !isFieldVisible(f, values)) return false;
    const v = values[f.key];
    if (f.type === "checkbox") return v !== true;
    return v === undefined || v === null || v === "";
  });
}
