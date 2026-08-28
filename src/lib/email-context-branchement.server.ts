/**
 * CD-SI-001-B — ACTION 43 : BRANCHEMENT LOT 2 → LOT 3 (greffon isolé).
 *
 * Conforme à `docs/CD-SI-001-B-BRANCHEMENT-LOT2-LOT3-DESIGN-V1.2.md`.
 *
 * PREMIER DÉPLOIEMENT : DRY-RUN STRICT.
 *   - aucun INSERT / UPSERT / DELETE ;
 *   - aucun UPDATE de `ai_context` (les orchestrateurs persistants
 *     `extraireEtEnregistrerContexteEmail` et `croiserEtEnregistrerContexteEmail`
 *     ne sont JAMAIS importés ni appelés par ce module) ;
 *   - aucune écriture `triage_ia` / `triage_le` ;
 *   - aucune FK, aucun Lot 4, aucun Lot 5 ;
 *   - aucun `force`, aucun retry, aucun appel Gmail supplémentaire.
 *
 * Le passage en écriture réelle est un changement de code déployé
 * (`BRANCHEMENT_CONTEXTE_DRY_RUN = false`) soumis à décision DG distincte.
 */
import { analyserContexteEmail } from "./email-context-analyzer.server";
import { peutEcrireContexte } from "./email-context-analyzer.server";
import { croiserContexteEmail, referentielVide } from "./email-context-resolution";
import { peutCroiserContexte } from "./email-context-resolver.server";
import type { EmailAExtraire } from "./email-context-extraction";
import type { EmailContext } from "./email-context-types";

/**
 * MODE DU GREFFON — `true` au premier déploiement (ACTION 43).
 * Toute bascule en écriture réelle est une décision DG séparée.
 */
export const BRANCHEMENT_CONTEXTE_DRY_RUN = true;

/** Plafond de messages branchés par passage (§7 du DESIGN). */
export const PLAFOND_LOT_CONTEXTE = 5;

const PREFIXE = "[branchement-contexte]";

export type StatutBranchement =
  | "hors_perimetre"
  | "plafond_atteint"
  | "sans_ligne_crm"
  | "refus_securise"
  | "contexte_deja_present"
  | "traite"
  | "erreur";

export interface MetriquesContexte {
  /** Mode du greffon lors du passage. */
  contexte_dry_run: boolean;
  /** Emails éligibles identifiés (candidats retenus par §3.2, plafond appliqué). */
  contexte_selectionnes: number;
  /** Emails éligibles effectivement traités (Lot 2 analysé sans persistance). */
  contexte_traites: number;
  /** Ignorés car un contexte est déjà présent (garde d'idempotence §6.1). */
  contexte_ignores_contexte_present: number;
  /** Ignorés car aucune ligne `crm_emails` (SKIP §3.4 — aucun insert/upsert). */
  contexte_sans_ligne_crm: number;
  /** Refus sécurisés (sentinelle humaine, `peutEcrireContexte`, garde Q.11). */
  contexte_refus_securises: number;
  /** Erreurs du greffon (Gateway, validation, lecture) — jamais `erreurs`. */
  contexte_erreurs: number;
  /** Simulations Lot 3 aboutissant à un statut proposé. */
  contexte_simules_proposes: number;
  /** Simulations Lot 3 aboutissant à un statut ambigu / à qualifier. */
  contexte_simules_ambigus: number;
  /** Couverture = traités / sélectionnés (0 si aucun sélectionné). */
  contexte_couverture: number;
  /** Ventilation détaillée des motifs (§7-1). */
  contexte_motifs: Record<string, number>;
}

export function creerMetriquesContexte(dryRun = BRANCHEMENT_CONTEXTE_DRY_RUN): MetriquesContexte {
  return {
    contexte_dry_run: dryRun,
    contexte_selectionnes: 0,
    contexte_traites: 0,
    contexte_ignores_contexte_present: 0,
    contexte_sans_ligne_crm: 0,
    contexte_refus_securises: 0,
    contexte_erreurs: 0,
    contexte_simules_proposes: 0,
    contexte_simules_ambigus: 0,
    contexte_couverture: 0,
    contexte_motifs: {},
  };
}

/** Couverture : éligibles traités / éligibles identifiés (arrondi 2 décimales). */
export function finaliserMetriquesContexte(m: MetriquesContexte): MetriquesContexte {
  m.contexte_couverture =
    m.contexte_selectionnes > 0
      ? Math.round((m.contexte_traites / m.contexte_selectionnes) * 100) / 100
      : 0;
  return m;
}

function motif(m: MetriquesContexte, cle: string): void {
  m.contexte_motifs[cle] = (m.contexte_motifs[cle] ?? 0) + 1;
}

/** Ligne `crm_emails` résolue en LECTURE SEULE (§3.4). */
export interface LigneCrmEmailResolue {
  id: string;
  ai_context: unknown;
  updated_at?: string | null;
}

export interface DependancesBranchement {
  /** `SELECT id, ai_context, updated_at ... WHERE gmail_message_id = :id` — lecture seule. */
  resoudreEmail: (gmailMessageId: string) => Promise<LigneCrmEmailResolue | null>;
  /** Lot 2 SANS persistance : `analyserContexteEmail` uniquement. */
  analyser: (email: EmailAExtraire) => Promise<{ ok: boolean; contexte: EmailContext; motif?: string; modele?: string | null }>;
}

export interface ResultatBranchement {
  statut: StatutBranchement;
  motif?: string;
  /** Statut du contexte simulé après croisement pur (dry-run). */
  statut_simule?: string;
}

/** Dépendances de production : une seule lecture Supabase, aucune écriture. */
export function dependancesParDefaut(): DependancesBranchement {
  return {
    async resoudreEmail(gmailMessageId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("crm_emails")
        .select("id, ai_context, updated_at")
        .eq("gmail_message_id", gmailMessageId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { id: data.id, ai_context: data.ai_context, updated_at: data.updated_at };
    },
    analyser: (email) => analyserContexteEmail(email),
  };
}

export interface ParamsBranchement {
  gmailMessageId: string;
  email: EmailAExtraire;
  /** Direction déduite par le code existant (label `SENT`) — sémantique inchangée. */
  estSortant: boolean;
  metriques: MetriquesContexte;
  deps?: DependancesBranchement;
  dryRun?: boolean;
  plafond?: number;
}

/**
 * Greffon unique du branchement. Ne LÈVE JAMAIS : toute erreur est capturée,
 * journalisée et comptabilisée dans `contexte_erreurs` uniquement.
 */
export async function brancherContexteEmail(params: ParamsBranchement): Promise<ResultatBranchement> {
  const { gmailMessageId, email, estSortant, metriques } = params;
  const dryRun = params.dryRun ?? BRANCHEMENT_CONTEXTE_DRY_RUN;
  const plafond = params.plafond ?? PLAFOND_LOT_CONTEXTE;

  try {
    const deps = params.deps ?? dependancesParDefaut();

    // §3.2-3 : direction `entrant` uniquement (sémantique §2.7 inchangée).
    if (estSortant) {
      motif(metriques, "hors_perimetre_sortant");
      return { statut: "hors_perimetre", motif: "direction_sortant" };
    }
    // §3.2-4 : texte utile non vide.
    if (!email.texte || !email.texte.trim()) {
      motif(metriques, "hors_perimetre_texte_vide");
      return { statut: "hors_perimetre", motif: "texte_vide" };
    }
    // §3.2-5 : plafond du passage.
    if (metriques.contexte_selectionnes >= plafond) {
      motif(metriques, "plafond_atteint");
      return { statut: "plafond_atteint", motif: "plafond_lot" };
    }

    metriques.contexte_selectionnes++;

    // §3.4 : résolution LECTURE SEULE. Aucune ligne n'est jamais créée.
    const ligne = await deps.resoudreEmail(gmailMessageId);
    if (!ligne) {
      metriques.contexte_sans_ligne_crm++;
      motif(metriques, "sans_ligne_crm");
      console.info(`${PREFIXE} SKIP ${gmailMessageId} · aucune ligne crm_emails`);
      return { statut: "sans_ligne_crm", motif: "crm_email_absent" };
    }

    // §3.4-6 : lecture préalable non mutatrice — ne remplace pas la garde BDD.
    const garde = peutEcrireContexte(ligne.ai_context);
    if (!garde.autorise) {
      if (garde.raison === "extraction_deja_effectuee") {
        metriques.contexte_ignores_contexte_present++;
        motif(metriques, "contexte_deja_present");
        console.info(`${PREFIXE} SKIP ${ligne.id} · contexte déjà présent`);
        return { statut: "contexte_deja_present", motif: garde.raison };
      }
      metriques.contexte_refus_securises++;
      motif(metriques, `refus_${garde.raison ?? "inconnu"}`);
      console.info(`${PREFIXE} refus sécurisé ${ligne.id} · ${garde.raison}`);
      return { statut: "refus_securise", motif: garde.raison };
    }

    if (!dryRun) {
      // Écriture réelle : décision DG ultérieure et distincte (P2/P3 du DESIGN).
      // Tant que cette branche n'est pas validée, aucune persistance n'existe.
      metriques.contexte_refus_securises++;
      motif(metriques, "ecriture_reelle_non_autorisee");
      console.warn(`${PREFIXE} mode écriture non autorisé — décision DG requise`);
      return { statut: "refus_securise", motif: "ecriture_reelle_non_autorisee" };
    }

    // Lot 2 SANS persistance : analyse Gemini + validation, jamais `persisterContexteEmail`.
    const analyse = await deps.analyser(email);
    if (!analyse.ok) {
      metriques.contexte_erreurs++;
      motif(metriques, `erreur_lot2_${analyse.motif ?? "inconnu"}`);
      console.error(`${PREFIXE} extraction indisponible ${ligne.id} · ${analyse.motif ?? "?"}`);
      return { statut: "erreur", motif: analyse.motif ?? "extraction_indisponible" };
    }

    metriques.contexte_traites++;

    // Simulation Lot 3 par FONCTIONS PURES uniquement (aucune écriture, aucun
    // orchestrateur de production, aucun accès référentiel mutateur).
    let statutSimule: string | undefined;
    const gardeLot3 = peutCroiserContexte(analyse.contexte);
    if (gardeLot3.autorise) {
      const simulation = croiserContexteEmail(analyse.contexte, referentielVide());
      statutSimule = simulation.statut;
      if (simulation.statut === "PROPOSED") metriques.contexte_simules_proposes++;
      else metriques.contexte_simules_ambigus++;
      motif(metriques, `simule_${simulation.statut}`);
    } else {
      motif(metriques, `simulation_refusee_${gardeLot3.raison ?? "inconnu"}`);
    }

    console.info(
      `${PREFIXE} DRY-RUN ${ligne.id} · modele=${analyse.modele ?? "?"} · detecte=${
        analyse.contexte.analyse?.statut ?? "?"
      } · simule=${statutSimule ?? "non_simule"} · aucune ecriture`,
    );
    return { statut: "traite", statut_simule: statutSimule };
  } catch (e) {
    metriques.contexte_erreurs++;
    motif(metriques, "erreur_greffon");
    console.error(`${PREFIXE} erreur isolée ${gmailMessageId}`, e instanceof Error ? e.message : e);
    return { statut: "erreur", motif: "erreur_greffon" };
  }
}
