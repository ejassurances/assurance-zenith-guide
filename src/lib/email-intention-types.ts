/**
 * LOT 1 — Types partagés de l'analyse d'intention des emails entrants.
 * Module client-safe (aucun accès réseau, aucune clé) : réutilisé par le moteur
 * de décision CRM et par l'analyseur serveur.
 */

/** Énumération FERMÉE des intentions. Aucune autre catégorie n'est autorisée. */
export const INTENTIONS_EMAIL = [
  "DEMANDE_ATTESTATION",
  "DEMANDE_INFORMATION_CONTRAT",
  "DEMANDE_MODIFICATION_CONTRAT",
  "RESILIATION",
  "SINISTRE",
  "RECLAMATION",
  "ENVOI_DE_DOCUMENTS",
  "PROSPECT_NOUVEAU_DOSSIER",
  "PIECES_COMPLEMENTAIRES",
  "DEMANDE_DEVIS",
  "AUTRE",
  "A_QUALIFIER",
] as const;

export type IntentionEmail = (typeof INTENTIONS_EMAIL)[number];

/**
 * Intentions correspondant à un acte sensible : validation humaine obligatoire,
 * quelle que soit la confiance de l'analyse.
 */
export const INTENTIONS_SENSIBLES: readonly IntentionEmail[] = [
  "RESILIATION",
  "SINISTRE",
  "RECLAMATION",
  "DEMANDE_MODIFICATION_CONTRAT",
];

/** Analyse structurée renvoyée par Gemini (aucune décision métier). */
export interface AnalyseIntentionEmail {
  intention: IntentionEmail;
  /** Confiance numérique entre 0 et 1. */
  confidence: number;
  summary: string;
  client_identifiable: boolean;
  contrat_identifiable: boolean;
  reference_contrat: string | null;
  telephone: string | null;
  siren: string | null;
  documents_demandes: string[];
  documents_recus: string[];
  action_recommandee: string | null;
  /** Modèle réellement utilisé (traçabilité). */
  modele: string | null;
}

export function estIntention(v: unknown): v is IntentionEmail {
  return typeof v === "string" && (INTENTIONS_EMAIL as readonly string[]).includes(v);
}
