/**
 * Référentiels documentés de l'API Néoliane Extraverse 1.0 (§6).
 *
 * Ces valeurs sont utilisées pour la validation côté serveur et l'affichage
 * côté navigateur. Lorsqu'un endpoint dynamique existe (`/offer/fields`,
 * `/lrinfos`, `/prelevementchoices`, `/product/formulas-pet`), la réponse
 * Néoliane fait toujours foi : ces listes ne servent que de garde-fou.
 */

export const SOCIAL_SECURITY_SCHEMES = [
  "employee",
  "selfEmployed",
  "farmer",
  "retiredEmployee",
  "retiredSelfEmployed",
  "student",
  "unemployed",
  "alsaceMoselle",
  "civilServant",
  "teacher",
  "expatriate",
  "agriculturalEmployee",
] as const;
export type SocialSecurityScheme = (typeof SOCIAL_SECURITY_SCHEMES)[number];

export const FAMILY_MEMBERS = [
  "holder",
  "spouse",
  "child.0",
  "child.1",
  "child.2",
  "child.3",
  "child.4",
] as const;
export type FamilyMember = (typeof FAMILY_MEMBERS)[number];

/** Types de produits documentés. */
export const PRODUCT_TYPES = [
  "sante",
  "deces",
  "dependance",
  "gav",
  "ijh",
  "ijhtc",
  "maccid",
  "nomade",
  "pemp",
  "pj",
  "qenun",
  "sda",
  "pmr",
  "pet",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** Libellés métier pour l'interface du cabinet. */
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  sante: "Santé (complémentaire)",
  deces: "Décès",
  dependance: "Dépendance",
  gav: "Garantie des accidents de la vie",
  ijh: "Indemnités journalières hospitalisation",
  ijhtc: "Confort hospitalier / Hospizen",
  maccid: "Décès accidentel",
  nomade: "Nomade / expatriés",
  pemp: "Prévoyance emprunteur",
  pj: "Soutien juridique",
  qenun: "Questionnaire / autres",
  sda: "Soutien décès accidentel",
  pmr: "Prévoyance maintien de revenus",
  pet: "Chien / Chat",
};

export const PROSPECT_TYPES = [
  "client",
  "optIn",
  "canvassing",
  "canvassing24h",
  "unknown",
] as const;
export type ProspectType = (typeof PROSPECT_TYPES)[number];

export const CIVILITES = ["mr", "mrs"] as const;
export type Civilite = (typeof CIVILITES)[number];

export const EVENT_NAMES = ["contract", "contractDemarche"] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Espèces animales documentées (1 = chat, 2 = chien). */
export const PET_SPECIES = { chat: 1, chien: 2 } as const;

/** Étapes de la machine d'état du parcours EZ API (§4). */
export const ETAPES_PARCOURS = [
  "profil",
  "tarifs",
  "panier",
  "offre",
  "finalisation",
  "documents",
  "depot_signature",
  "validation",
  "termine",
] as const;
export type EtapeParcours = (typeof ETAPES_PARCOURS)[number];

export const ETAPE_LABELS: Record<EtapeParcours, string> = {
  profil: "Profil créé",
  tarifs: "Tarifs générés",
  panier: "Panier composé",
  offre: "Offre créée",
  finalisation: "Offre finalisée",
  documents: "Documents récupérés",
  depot_signature: "Documents signés déposés",
  validation: "Validation demandée",
  termine: "Souscription validée",
};

/** Régimes du recueil interne → valeurs Néoliane. */
export const REGIME_NEOLIANE: Record<string, SocialSecurityScheme> = {
  salarie: "employee",
  tns: "selfEmployed",
  fonctionnaire: "civilServant",
  exploitant_agricole: "farmer",
  agricole: "agriculturalEmployee",
  etudiant: "student",
  sans_emploi: "unemployed",
  alsace_moselle: "alsaceMoselle",
  retraite: "retiredEmployee",
  retraite_tns: "retiredSelfEmployed",
  enseignant: "teacher",
  expatrie: "expatriate",
};

/** 1er jour du mois suivant, au format AAAA-MM-JJ. */
export function dateEffetParDefaut(from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 10);
}
