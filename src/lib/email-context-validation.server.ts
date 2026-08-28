/**
 * CD-SI-001-B — LOT IHM QUALIFICATION / VALIDATION HUMAINE — ORCHESTRATION.
 * Référence exclusive : docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.1.md
 *
 * Séquence : lecture T0 → moteur pur → défense en profondeur → UNIQUE `UPDATE`
 * gardé (garde Q.11 composée par le Lot 3, jamais réécrite ici).
 *
 * INTERDICTIONS APPLIQUÉES : aucun INSERT / UPSERT / DELETE / RPC mutante,
 * aucune FK écrite, aucun appel du Lot 4, aucun Gemini, aucun Gmail, aucun
 * retry, aucun second `UPDATE`, aucun paramètre `force`.
 */
import {
  updatedAtExploitable,
  preserverSentinellesHumaines,
  type LigneEmailLot3,
  type ParamsEcritureAiContext,
  type ResultatEcritureAiContext,
} from "./email-context-resolver.server";
import { lireContexteEmail } from "./email-context-schema";
import {
  appliquerIntentionHumaine,
  type IntentionHumaine,
  type MotifRefusValidation,
} from "./email-context-validation";

export interface LecteurValidation {
  lireEmail(emailId: string): Promise<LigneEmailLot3 | null>;
  ecrireAiContext(params: ParamsEcritureAiContext): Promise<ResultatEcritureAiContext>;
}

export interface ResultatValidationEmail {
  ecrit: boolean;
  motif: MotifRefusValidation | null;
  cle: string | null;
  /** NO-OP explicite : sentinelle existante + intention strictement identique. */
  noop?: boolean;
}

export async function validerContexteEmail(params: {
  emailId: string;
  intention: IntentionHumaine;
  /** Toujours `auth.uid()` côté serveur. */
  operateurId: string;
  valideLe?: string;
  db?: LecteurValidation;
}): Promise<ResultatValidationEmail> {
  const db = params.db;
  if (!db) return { ecrit: false, motif: "erreur_base", cle: null };

  const observe = await db.lireEmail(params.emailId);
  if (!observe) return { ecrit: false, motif: "email_introuvable", cle: null };

  // R-UA-2 : jeton de version inexploitable → refus sûr, aucune écriture tentée.
  if (!updatedAtExploitable(observe.updated_at)) {
    return { ecrit: false, motif: "updated_at_inexploitable", cle: null };
  }

  const contexteObserve = lireContexteEmail(observe.ai_context);
  if (!contexteObserve) return { ecrit: false, motif: "contexte_invalide", cle: null };

  const decision = appliquerIntentionHumaine({
    observe: contexteObserve,
    intention: params.intention,
    operateurId: params.operateurId,
    valideLe: params.valideLe ?? new Date().toISOString(),
  });
  if (!decision.autorise) return { ecrit: false, motif: decision.motif, cle: null };

  // NO-OP explicite : aucune écriture BDD, `updated_at` non renouvelé.
  if (decision.noop) return { ecrit: false, motif: null, cle: decision.cle, noop: true };

  // Défense en profondeur : aucune sentinelle observée ne peut être effacée.
  const cible = preserverSentinellesHumaines(contexteObserve, decision.contexte);

  const resultat = await db.ecrireAiContext({ emailId: params.emailId, observe, contexte: cible });
  if (resultat.erreur) return { ecrit: false, motif: "erreur_base", cle: decision.cle };

  if (resultat.lignesAffectees === 0) {
    // MINEUR-1 : distinguer habilitation et conflit. Aucune retentative.
    const relu = await db.lireEmail(params.emailId);
    if (!relu) return { ecrit: false, motif: "email_introuvable", cle: decision.cle };
    return { ecrit: false, motif: "conflit_concurrent", cle: decision.cle };
  }

  return { ecrit: true, motif: null, cle: decision.cle };
}
