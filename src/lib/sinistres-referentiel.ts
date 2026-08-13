/**
 * Référentiel du workflow sinistres : étapes de gestion et pièces
 * justificatives attendues selon la branche d'assurance.
 * Module pur (aucun accès réseau) — utilisable côté client comme serveur.
 */

export type EtapeSinistre = "declare" | "pieces" | "expertise" | "indemnisation" | "clos" | "refuse";

export const ETAPES_SINISTRE: {
  key: EtapeSinistre;
  label: string;
  description: string;
  horsParcours?: boolean;
}[] = [
  {
    key: "declare",
    label: "Déclaré",
    description: "Sinistre déclaré par le client ou saisi par le cabinet.",
  },
  {
    key: "pieces",
    label: "Pièces en collecte",
    description: "Collecte des justificatifs avant transmission à la compagnie.",
  },
  {
    key: "expertise",
    label: "Expertise / instruction",
    description: "Dossier transmis à la compagnie, expertise en cours.",
  },
  {
    key: "indemnisation",
    label: "Indemnisation",
    description: "Accord de la compagnie, règlement en cours.",
  },
  { key: "clos", label: "Clos", description: "Sinistre réglé et clôturé." },
  {
    key: "refuse",
    label: "Refusé",
    description: "Prise en charge refusée par la compagnie.",
    horsParcours: true,
  },
];

export function labelEtapeSinistre(key: string): string {
  return ETAPES_SINISTRE.find((e) => e.key === key)?.label ?? key;
}

export function indexEtapeSinistre(key: string): number {
  return ETAPES_SINISTRE.findIndex((e) => e.key === key);
}

export type PieceSinistre = { code: string; libelle: string; obligatoire: boolean };

const COMMUNES: PieceSinistre[] = [
  { code: "declaration", libelle: "Déclaration de sinistre signée", obligatoire: true },
  { code: "rib", libelle: "RIB du bénéficiaire", obligatoire: true },
  { code: "piece_identite", libelle: "Pièce d'identité", obligatoire: true },
];

const PAR_BRANCHE: Record<string, PieceSinistre[]> = {
  emprunteur: [
    { code: "arret_travail", libelle: "Arrêt de travail ou certificat médical", obligatoire: true },
    { code: "tableau_amortissement", libelle: "Tableau d'amortissement du prêt", obligatoire: true },
    { code: "attestation_banque", libelle: "Attestation de la banque prêteuse", obligatoire: true },
    { code: "decompte_cpam", libelle: "Décomptes d'indemnités journalières", obligatoire: false },
  ],
  sante: [
    { code: "decompte_secu", libelle: "Décompte de la Sécurité sociale", obligatoire: true },
    { code: "facture_soins", libelle: "Facture acquittée des soins", obligatoire: true },
    { code: "prescription", libelle: "Prescription médicale", obligatoire: false },
  ],
  prevoyance: [
    { code: "certificat_medical", libelle: "Certificat médical initial", obligatoire: true },
    { code: "bulletins_salaire", libelle: "3 derniers bulletins de salaire", obligatoire: true },
    { code: "decompte_cpam", libelle: "Décomptes d'indemnités journalières", obligatoire: false },
  ],
  auto: [
    { code: "constat", libelle: "Constat amiable", obligatoire: true },
    { code: "carte_grise", libelle: "Carte grise du véhicule", obligatoire: true },
    { code: "permis", libelle: "Permis de conduire du conducteur", obligatoire: true },
    { code: "devis_reparation", libelle: "Devis ou facture de réparation", obligatoire: false },
    { code: "pv_police", libelle: "Procès-verbal / dépôt de plainte", obligatoire: false },
  ],
  habitation: [
    { code: "photos", libelle: "Photos des dommages", obligatoire: true },
    { code: "devis_reparation", libelle: "Devis de réparation ou remplacement", obligatoire: true },
    { code: "factures_biens", libelle: "Factures des biens endommagés", obligatoire: false },
    { code: "pv_police", libelle: "Dépôt de plainte (vol / vandalisme)", obligatoire: false },
  ],
  rc_pro: [
    { code: "reclamation", libelle: "Réclamation écrite du tiers", obligatoire: true },
    { code: "contrat_mission", libelle: "Contrat ou lettre de mission concernée", obligatoire: true },
    { code: "echanges", libelle: "Échanges avec le tiers", obligatoire: false },
  ],
};

/** Pièces attendues pour une branche donnée (communes + spécifiques). */
export function piecesPourBranche(branche: string | null | undefined): PieceSinistre[] {
  const specifiques = branche ? PAR_BRANCHE[branche] ?? [] : [];
  return [...COMMUNES, ...specifiques];
}

export const BRANCHES_SINISTRE = [
  { value: "emprunteur", label: "Assurance emprunteur" },
  { value: "sante", label: "Santé / complémentaire" },
  { value: "prevoyance", label: "Prévoyance" },
  { value: "auto", label: "Auto / moto" },
  { value: "habitation", label: "Habitation" },
  { value: "rc_pro", label: "Responsabilité civile pro" },
  { value: "autre", label: "Autre" },
];
