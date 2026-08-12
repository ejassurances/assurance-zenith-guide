// Configuration du recueil des besoins par branche d'assurance.
// Chaque champ est stocké dans dossiers.recueil_besoins (jsonb) sous sa clé.

export type BrancheAssurance = "emprunteur" | "prevoyance_sante" | "epargne_retraite" | "iard" | "trottinette";

export type FieldType = "text" | "number" | "textarea" | "select" | "checkbox";

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  help?: string;
  suffix?: string;
}

export interface BrancheConfig {
  value: BrancheAssurance;
  label: string;
  description: string;
  sections: { title: string; fields: FieldConfig[] }[];
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
        fields: [
          {
            key: "type_engin",
            label: "Type d'engin",
            type: "select",
            required: true,
            options: [
              { value: "trottinette", label: "Trottinette électrique" },
              { value: "gyroroue", label: "Gyroroue" },
              { value: "monoroue", label: "Monoroue" },
              { value: "hoverboard", label: "Hoverboard" },
              { value: "gyropode", label: "Gyropode / Segway" },
              { value: "autre_edpm", label: "Autre EDPM" },
            ],
          },
          { key: "marque_modele", label: "Marque et modèle", type: "text", placeholder: "Ex : Xiaomi Pro 2" },
          { key: "valeur_bien", label: "Valeur du bien (achat)", type: "number", suffix: "€", required: true },
          { key: "date_achat", label: "Date d'achat", type: "text", placeholder: "MM/AAAA" },
          { key: "numero_serie", label: "Numéro de série", type: "text" },
          { key: "vitesse_max", label: "Vitesse maximale bridée", type: "number", suffix: "km/h" },
        ],
      },
      {
        title: "Usage et stationnement",
        fields: [
          {
            key: "usage",
            label: "Usage principal",
            type: "select",
            required: true,
            options: [
              { value: "loisir", label: "Loisir" },
              { value: "trajet_travail", label: "Trajets domicile - travail" },
              { value: "professionnel", label: "Usage professionnel (livraison, tournées…)" },
              { value: "mixte", label: "Mixte" },
            ],
          },
          {
            key: "lieu_stationnement",
            label: "Lieu de stationnement habituel",
            type: "select",
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
        fields: [
          {
            key: "sinistres_36mois",
            label: "Sinistres des 36 derniers mois",
            type: "textarea",
            placeholder: "Nature, date, montant (vol, casse, accident…)",
          },
          { key: "resiliation", label: "Résiliation par un précédent assureur", type: "checkbox" },
          { key: "assureur_actuel", label: "Assureur actuel & prime annuelle", type: "text" },
        ],
      },
      {
        title: "Besoins",
        fields: [
          { key: "besoin_rc", label: "Responsabilité civile (obligatoire)", type: "checkbox" },
          { key: "besoin_vol", label: "Vol", type: "checkbox" },
          { key: "besoin_casse", label: "Casse / dommages matériels", type: "checkbox" },
          { key: "besoin_assistance", label: "Assistance / dépannage", type: "checkbox" },
          { key: "besoin_protection_conducteur", label: "Protection corporelle du conducteur", type: "checkbox" },
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
