/**
 * LOT 1 — Présentation UNIQUEMENT. Ce module ne décide rien : il traduit en
 * langage conseiller les informations DÉJÀ présentes dans `crm_emails.triage_ia`
 * (`analyse_gemini` + `decision_crm`). Aucune information n'est inventée :
 * si un champ est absent, il n'est pas affiché.
 */

export type StatutAffiche = "action" | "validation" | "qualification" | "traite";

export interface TriageAffichage {
  statut: StatutAffiche;
  /** Titre court : « Action à effectuer », « Validation humaine requise »… */
  titre: string;
  /** Intention Gemini brute (clé technique) et son libellé lisible. */
  intention: string | null;
  intentionLisible: string | null;
  /** Phrase d'action métier, dérivée de l'intention (jamais du libellé Gmail). */
  action: string | null;
  /** Motif produit par le moteur de décision. */
  motif: string | null;
  /** Confiance Gemini (0-1) si disponible. */
  confiance: number | null;
  validationHumaine: boolean;
}

const LIBELLE_INTENTION: Record<string, string> = {
  DEMANDE_ATTESTATION: "Demande d'attestation",
  DEMANDE_INFORMATION_CONTRAT: "Demande d'information sur le contrat",
  DEMANDE_MODIFICATION_CONTRAT: "Demande de modification du contrat",
  RESILIATION: "Résiliation",
  SINISTRE: "Sinistre",
  RECLAMATION: "Réclamation",
  ENVOI_DE_DOCUMENTS: "Envoi de documents",
  PROSPECT_NOUVEAU_DOSSIER: "Nouveau dossier prospect",
  PIECES_COMPLEMENTAIRES: "Pièces complémentaires",
  DEMANDE_DEVIS: "Demande de devis",
  AUTRE: "Autre demande",
  A_QUALIFIER: "À qualifier",
};

const ACTION_PAR_INTENTION: Record<string, string> = {
  DEMANDE_ATTESTATION: "Préparer l'attestation",
  DEMANDE_INFORMATION_CONTRAT: "Répondre sur les éléments du contrat",
  DEMANDE_MODIFICATION_CONTRAT: "Acte sensible : modification du contrat",
  RESILIATION: "Acte sensible : résiliation",
  SINISTRE: "Acte sensible : déclaration de sinistre",
  RECLAMATION: "Acte sensible : réclamation",
  ENVOI_DE_DOCUMENTS: "Documents reçus — vérification du dossier nécessaire",
  PIECES_COMPLEMENTAIRES: "Documents reçus — vérification du dossier nécessaire",
  PROSPECT_NOUVEAU_DOSSIER: "Qualifier le nouveau dossier",
  DEMANDE_DEVIS: "Préparer un devis",
};

function nombreOuNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function texteOuNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Lit `triage_ia` (JSON libre) et en dérive l'affichage conseiller. */
export function lireTriageAffichage(triage: unknown): TriageAffichage | null {
  if (!triage || typeof triage !== "object") return null;
  const t = triage as Record<string, unknown>;
  const analyse = (t["analyse_gemini"] ?? null) as Record<string, unknown> | null;
  const decision = (t["decision_crm"] ?? null) as Record<string, unknown> | null;
  if (!analyse && !decision) return null;

  const intention = analyse ? texteOuNull(analyse["intention"]) : null;
  const statutMetier = decision ? texteOuNull(decision["statut_metier"]) : null;

  let statut: StatutAffiche = "qualification";
  let titre = "Qualification nécessaire";
  if (statutMetier === "VALIDATION_HUMAINE") {
    statut = "validation";
    titre = "Validation humaine requise";
  } else if (statutMetier === "ACTION_A_EFFECTUER") {
    statut = "action";
    titre = "Action à effectuer";
  } else if (statutMetier === "TRAITE") {
    statut = "traite";
    titre = "Traité";
  }

  return {
    statut,
    titre,
    intention,
    intentionLisible: intention ? (LIBELLE_INTENTION[intention] ?? intention) : null,
    action: intention ? (ACTION_PAR_INTENTION[intention] ?? null) : null,
    motif: decision ? texteOuNull(decision["motif"]) : null,
    confiance: analyse ? nombreOuNull(analyse["confidence"]) : null,
    validationHumaine: statut === "validation",
  };
}
