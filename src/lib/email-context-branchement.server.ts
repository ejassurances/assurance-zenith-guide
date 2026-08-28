/**
 * CD-SI-001-B — Branchement Lot 2 → Lot 3 en FONCTIONNEMENT RÉEL.
 *
 * Chaîne d'un email entrant, une seule fois par message et par passage :
 *   1. sélection (entrant, texte utile, plafond du lot) ;
 *   2. résolution de la ligne `crm_emails` (lecture) — si absente, seconde
 *      tentative en fin d'itération (les prospects sont insérés plus tard) ;
 *   3. garde d'idempotence / protection humaine (`peutEcrireContexte`, Q.11) ;
 *   4. Lot 2 : extraction Gemini puis écriture de `ai_context` (DETECTED) ;
 *   5. Lot 3 : croisement référentiel puis écriture gardée (PROPOSED/AMBIGUOUS).
 *
 * Garde-fous conservés : plafond par passage, aucune écriture hors
 * `crm_emails.ai_context` (aucune FK, aucun `triage_*`, aucun Lot 4/5),
 * aucun `force`, aucun retry, aucun appel Gmail supplémentaire, et isolation
 * totale des erreurs (le greffon ne lève jamais).
 */
import { extraireEtEnregistrerContexteEmail } from "./email-context-analyzer.server";
import { peutEcrireContexte } from "./email-context-analyzer.server";
import { croiserEtEnregistrerContexteEmail } from "./email-context-resolver.server";
import type { EmailAExtraire } from "./email-context-extraction";

/** Plafond de messages branchés par passage (coût Gemini / BDD borné). */
export const PLAFOND_LOT_CONTEXTE = 25;

const PREFIXE = "[branchement-contexte]";

export type StatutBranchement =
  | "hors_perimetre"
  | "plafond_atteint"
  | "sans_ligne_crm"
  | "refus_securise"
  | "contexte_deja_present"
  | "traite"
  | "erreur";

/** États d'itération (jamais persistés). */
export type EtatContexteMessage =
  | "NON_PRESENTEE"
  | "TRAITEE"
  | "IGNOREE"
  | "REFUSEE"
  | "ERREUR"
  | "EN_ATTENTE_LIGNE_CRM"
  | "SANS_LIGNE_CRM_DEFINITIF";

export interface MetriquesContexte {
  /** Emails éligibles retenus (plafond appliqué). */
  contexte_selectionnes: number;
  /** Emails dont le contexte a été extrait ET enregistré. */
  contexte_traites: number;
  /** Ignorés : un contexte exploitable existe déjà (idempotence). */
  contexte_ignores_contexte_present: number;
  /** Aucune ligne `crm_emails` même après la seconde tentative. */
  contexte_sans_ligne_crm: number;
  /** Refus sécurisés (sentinelle humaine / garde Q.11). */
  contexte_refus_securises: number;
  /** Erreurs du greffon — jamais le compteur historique `erreurs`. */
  contexte_erreurs: number;
  /** Résolutions Lot 3 enregistrées en `PROPOSED`. */
  contexte_resolus_proposes: number;
  /** Résolutions Lot 3 enregistrées en `AMBIGUOUS` / à qualifier. */
  contexte_resolus_ambigus: number;
  /** Ventilation des motifs, pour traçabilité. */
  contexte_motifs: Record<string, number>;
}

export function creerMetriquesContexte(): MetriquesContexte {
  return {
    contexte_selectionnes: 0,
    contexte_traites: 0,
    contexte_ignores_contexte_present: 0,
    contexte_sans_ligne_crm: 0,
    contexte_refus_securises: 0,
    contexte_erreurs: 0,
    contexte_resolus_proposes: 0,
    contexte_resolus_ambigus: 0,
    contexte_motifs: {},
  };
}

function motif(m: MetriquesContexte, cle: string): void {
  m.contexte_motifs[cle] = (m.contexte_motifs[cle] ?? 0) + 1;
}

/** Ligne `crm_emails` résolue (lecture). */
export interface LigneCrmEmailResolue {
  id: string;
  ai_context: unknown;
}

export interface DependancesBranchement {
  /** `SELECT id, ai_context WHERE gmail_message_id = :id`. */
  resoudreEmail: (gmailMessageId: string) => Promise<LigneCrmEmailResolue | null>;
  /** Lot 2 : extraction + écriture `ai_context`. */
  extraire: (
    emailId: string,
    email: EmailAExtraire,
  ) => Promise<{ ok: boolean; ecrit: boolean; motif?: string; raison?: string; modele?: string | null }>;
  /** Lot 3 : croisement + écriture gardée. */
  croiser: (emailId: string) => Promise<{ ecrit: boolean; statut?: string; motif?: string }>;
}

/** Message en attente de sa ligne `crm_emails` (mémoire d'itération). */
export interface AttenteLigneCrm {
  gmailMessageId: string;
  email: EmailAExtraire;
  deps: DependancesBranchement;
  tentativeFaite: boolean;
}

export interface ResultatBranchement {
  statut: StatutBranchement;
  motif?: string;
  /** Statut Lot 3 enregistré. */
  statut_resolu?: string;
  etat: EtatContexteMessage;
  attente?: AttenteLigneCrm;
}

export function dependancesParDefaut(): DependancesBranchement {
  return {
    async resoudreEmail(gmailMessageId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("crm_emails")
        .select("id, ai_context")
        .eq("gmail_message_id", gmailMessageId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { id: data.id, ai_context: data.ai_context };
    },
    extraire: (emailId, email) => extraireEtEnregistrerContexteEmail(emailId, email),
    croiser: (emailId) => croiserEtEnregistrerContexteEmail(emailId),
  };
}

export interface ParamsBranchement {
  gmailMessageId: string;
  email: EmailAExtraire;
  /** Direction déduite par le code existant (label `SENT`). */
  estSortant: boolean;
  metriques: MetriquesContexte;
  deps?: DependancesBranchement;
  plafond?: number;
}

/** Lot 2 puis Lot 3, écritures réelles bornées à `crm_emails.ai_context`. */
async function executerChaine(
  ligne: LigneCrmEmailResolue,
  email: EmailAExtraire,
  deps: DependancesBranchement,
  metriques: MetriquesContexte,
): Promise<ResultatBranchement> {
  const garde = peutEcrireContexte(ligne.ai_context);
  if (!garde.autorise) {
    if (garde.raison === "extraction_deja_effectuee" || garde.raison === "contexte_deja_qualifie") {
      metriques.contexte_ignores_contexte_present++;
      motif(metriques, garde.raison);
      return { statut: "contexte_deja_present", motif: garde.raison, etat: "IGNOREE" };
    }
    metriques.contexte_refus_securises++;
    motif(metriques, `refus_${garde.raison ?? "inconnu"}`);
    return { statut: "refus_securise", motif: garde.raison, etat: "REFUSEE" };
  }

  const analyse = await deps.extraire(ligne.id, email);
  if (!analyse.ok || !analyse.ecrit) {
    metriques.contexte_erreurs++;
    const cause = analyse.motif ?? analyse.raison ?? "inconnu";
    motif(metriques, `erreur_lot2_${cause}`);
    console.error(`${PREFIXE} Lot 2 échoué ${ligne.id} · ${cause}`);
    return { statut: "erreur", motif: cause, etat: "ERREUR" };
  }

  metriques.contexte_traites++;

  // Lot 3 : jamais bloquant — un croisement refusé laisse le contexte DETECTED
  // exploitable par l'IHM de qualification.
  let statutResolu: string | undefined;
  const resolution = await deps.croiser(ligne.id);
  if (resolution.ecrit) {
    statutResolu = resolution.statut;
    if (statutResolu === "PROPOSED") metriques.contexte_resolus_proposes++;
    else metriques.contexte_resolus_ambigus++;
    motif(metriques, `resolu_${statutResolu ?? "inconnu"}`);
  } else {
    motif(metriques, `lot3_non_ecrit_${resolution.motif ?? "inconnu"}`);
  }

  console.info(
    `${PREFIXE} ${ligne.id} · modele=${analyse.modele ?? "?"} · resolu=${statutResolu ?? "non"}`,
  );
  return { statut: "traite", statut_resolu: statutResolu, etat: "TRAITEE" };
}

/** Greffon unique. Ne lève JAMAIS : toute erreur est comptée et journalisée. */
export async function brancherContexteEmail(params: ParamsBranchement): Promise<ResultatBranchement> {
  const { gmailMessageId, email, estSortant, metriques } = params;
  const plafond = params.plafond ?? PLAFOND_LOT_CONTEXTE;

  try {
    const deps = params.deps ?? dependancesParDefaut();

    if (estSortant) {
      motif(metriques, "hors_perimetre_sortant");
      return { statut: "hors_perimetre", motif: "direction_sortant", etat: "NON_PRESENTEE" };
    }
    if (!email.texte || !email.texte.trim()) {
      motif(metriques, "hors_perimetre_texte_vide");
      return { statut: "hors_perimetre", motif: "texte_vide", etat: "NON_PRESENTEE" };
    }
    if (metriques.contexte_selectionnes >= plafond) {
      motif(metriques, "plafond_atteint");
      return { statut: "plafond_atteint", motif: "plafond_lot", etat: "NON_PRESENTEE" };
    }

    metriques.contexte_selectionnes++;

    const ligne = await deps.resoudreEmail(gmailMessageId);
    if (!ligne) {
      // Effet d'ordonnancement (prospect inséré plus tard dans l'itération) :
      // seconde et dernière tentative à la clôture du message.
      motif(metriques, "attente_ligne_crm");
      return {
        statut: "sans_ligne_crm",
        motif: "crm_email_absent",
        etat: "EN_ATTENTE_LIGNE_CRM",
        attente: { gmailMessageId, email, deps, tentativeFaite: false },
      };
    }

    return await executerChaine(ligne, email, deps, metriques);
  } catch (e) {
    metriques.contexte_erreurs++;
    motif(metriques, "erreur_greffon");
    console.error(`${PREFIXE} erreur isolée ${gmailMessageId}`, e instanceof Error ? e.message : e);
    return { statut: "erreur", motif: "erreur_greffon", etat: "ERREUR" };
  }
}

/**
 * Clôture du message, en fin d'itération : une seule seconde lecture de
 * `crm_emails`, puis la chaîne si la ligne existe désormais. Aucun appel Gmail,
 * une seule tentative par message, ne lève jamais.
 */
export async function cloturerContexteEmail(
  resultat: ResultatBranchement | null | undefined,
  metriques: MetriquesContexte,
): Promise<ResultatBranchement | null> {
  const attente = resultat?.etat === "EN_ATTENTE_LIGNE_CRM" ? resultat.attente : undefined;
  if (!attente || attente.tentativeFaite) return null;
  attente.tentativeFaite = true;

  try {
    const ligne = await attente.deps.resoudreEmail(attente.gmailMessageId);
    if (!ligne) {
      metriques.contexte_sans_ligne_crm++;
      motif(metriques, "sans_ligne_crm_definitif");
      console.info(`${PREFIXE} SKIP ${attente.gmailMessageId} · aucune ligne crm_emails`);
      return { statut: "sans_ligne_crm", motif: "crm_email_absent", etat: "SANS_LIGNE_CRM_DEFINITIF" };
    }
    return await executerChaine(ligne, attente.email, attente.deps, metriques);
  } catch (e) {
    metriques.contexte_erreurs++;
    motif(metriques, "erreur_post_traitement");
    console.error(
      `${PREFIXE} erreur isolée (clôture) ${attente.gmailMessageId}`,
      e instanceof Error ? e.message : e,
    );
    return { statut: "erreur", motif: "erreur_greffon", etat: "ERREUR" };
  }
}
