/**
 * CD-SI-001-B — LOT 1 (fondations).
 * Types partagés du contexte relationnel des emails (`public.crm_emails.ai_context`).
 * Module client-safe : aucun accès réseau, aucune logique métier.
 *
 * RÈGLE DE SÉCURITÉ : tout élément de `ai_context` est une PROPOSITION issue de la
 * détection IA. Aucune écriture de FK maîtresse ne peut en être dérivée
 * automatiquement — la validation métier relève des lots ultérieurs.
 */

export const EMAIL_CONTEXT_SCHEMA_VERSION = "1.1.0" as const;

export const EMAIL_CONTEXT_STATUSES = [
  "DETECTED",
  "PROPOSED",
  "CONFIRMED",
  "AMBIGUOUS",
  "A_QUALIFIER",
] as const;
export type EmailContextStatus = (typeof EMAIL_CONTEXT_STATUSES)[number];

export const PROVENANCE_SOURCES = [
  "gemini",
  "regle_deterministe",
  "humain",
  "import",
  "inconnu",
] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

/** Confiance normalisée entre 0 et 1. */
export type Confidence = number;

export interface Provenance {
  source?: ProvenanceSource;
  champ?: string | null;
  modele?: string | null;
  detecte_le?: string | null;
  preuve_ids?: string[];
}

export type CorrespondantRole =
  | "client"
  | "prospect"
  | "compagnie"
  | "partenaire"
  | "interne"
  | "inconnu";

export interface EmailCorrespondant {
  email?: string | null;
  nom_affiche?: string | null;
  role_suppose?: CorrespondantRole | null;
  client_id?: string | null;
  compagnie_id?: string | null;
  statut?: EmailContextStatus;
  confiance?: Confidence;
  provenance?: Provenance;
}

export type PersonRole =
  | "souscripteur"
  | "co_emprunteur"
  | "conjoint"
  | "enfant"
  | "tiers"
  | "inconnu";

export interface DetectedPerson {
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  date_naissance?: string | null;
  role?: PersonRole | null;
  client_id_propose?: string | null;
  statut: EmailContextStatus;
  confiance?: Confidence;
  provenance?: Provenance;
}

export interface DetectedDossier {
  reference_citee?: string | null;
  dossier_id_propose?: string | null;
  branche?: string | null;
  statut: EmailContextStatus;
  confiance?: Confidence;
  provenance?: Provenance;
}

export interface DetectedContract {
  /** Donnée métier citée dans l'email ; l'UUID technique vit dans `contrat_id_propose`. */
  numero_police?: string | null;
  contrat_id_propose?: string | null;
  compagnie_citee?: string | null;
  statut: EmailContextStatus;
  confiance?: Confidence;
  provenance?: Provenance;
}

export interface CitedProduct {
  libelle?: string | null;
  produit_id_propose?: string | null;
  famille?: string | null;
  statut: EmailContextStatus;
  confiance?: Confidence;
  provenance?: Provenance;
}

export interface AssociatedDocument {
  nom_fichier?: string | null;
  type_detecte?: string | null;
  gmail_attachment_id?: string | null;
  document_id_propose?: string | null;
  statut: EmailContextStatus;
  confiance?: Confidence;
  provenance?: Provenance;
}

export const EVIDENCE_TYPES = [
  "email_expediteur",
  "email_corps",
  "objet",
  "signature",
  "piece_jointe",
  "reference_explicite",
  "thread",
  "autre",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface Evidence {
  id: string;
  type: EvidenceType;
  extrait?: string | null;
  cible?: string | null;
  poids?: Confidence;
}

export const AMBIGUITY_TYPES = [
  "client_multiple",
  "dossier_multiple",
  "contrat_multiple",
  "personne_inconnue",
  "confiance_insuffisante",
  "donnees_contradictoires",
  "autre",
] as const;
export type AmbiguityType = (typeof AMBIGUITY_TYPES)[number];

export interface Ambiguity {
  type: AmbiguityType;
  description?: string | null;
  candidats?: string[];
  resolution_requise?: boolean;
}

export interface EmailContextAnalysis {
  statut?: EmailContextStatus;
  confiance_globale?: Confidence;
  modele?: string | null;
  analyse_le?: string | null;
  validation_humaine_requise?: boolean;
  validated_by?: string | null;
  validated_at?: string | null;
  modifications_apportees?: string[];
  provenance?: Provenance;
}

export interface EmailContext {
  schema_version: typeof EMAIL_CONTEXT_SCHEMA_VERSION;
  correspondant?: EmailCorrespondant;
  personnes_detectees?: DetectedPerson[];
  dossiers_detectes?: DetectedDossier[];
  contrats_detectes?: DetectedContract[];
  produits_cites?: CitedProduct[];
  documents_associes?: AssociatedDocument[];
  preuves?: Evidence[];
  ambiguities?: Ambiguity[];
  analyse?: EmailContextAnalysis;
}

/** Contexte vide conforme au schéma (équivalent typé du défaut `{}` en base + version). */
export function contexteEmailVide(): EmailContext {
  return { schema_version: EMAIL_CONTEXT_SCHEMA_VERSION };
}
