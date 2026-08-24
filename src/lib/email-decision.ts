/**
 * LOT 1 — Moteur de décision CRM des emails entrants.
 *
 * GEMINI ANALYSE, LE CRM DÉCIDE. Ce module est volontairement PUR (aucun appel
 * réseau, aucune écriture) : il transforme une analyse d'intention en statut,
 * en appliquant l'ordre de priorité arrêté par le cabinet :
 *
 *  1. sécurité / actes engageants (validation humaine obligatoire) ;
 *  2. intention Gemini ;
 *  3. identification client / prospect ;
 *  4. identification dossier / contrat ;
 *  5. règles métier existantes (action réellement exécutée ou non) ;
 *  6. libellé Gmail (`config_labels_gmail`) en simple FALLBACK.
 *
 * Le libellé Gmail n'est plus une décision métier : à lui seul il ne provoque
 * plus « A valider ».
 */
import type { IntentionEmail } from "@/lib/email-intention-types";
import { INTENTIONS_SENSIBLES } from "@/lib/email-intention-types";

/** Seuils de gouvernance (arrêtés avec le cabinet). */
export const SEUIL_CONFIANCE_HAUTE = 0.85;
export const SEUIL_CONFIANCE_MINIMALE = 0.7;

/**
 * Statut métier retenu par le CRM. `crm_emails` ne possède pas de colonne de
 * statut : la vérité opérationnelle est le libellé d'état Gmail (« A valider »
 * / « Archives »). Le statut métier est conservé dans `crm_emails.triage_ia`
 * pour la traçabilité, sans création de colonne ni de table.
 */
export type StatutMetierEmail =
  | "VALIDATION_HUMAINE"
  | "A_QUALIFIER"
  | "ACTION_A_EFFECTUER"
  | "TRAITE";

export interface EntreeDecision {
  /** Analyse Gemini structurée (null si indisponible : on retombe sur le libellé). */
  analyse: {
    intention: IntentionEmail;
    confidence: number;
    client_identifiable: boolean;
    contrat_identifiable: boolean;
  } | null;
  /** Identification faite par le CRM (jamais par Gemini). */
  client_id: string | null;
  prospect_id?: string | null;
  dossier_id?: string | null;
  contrat_id?: string | null;
  /**
   * L'action administrative a-t-elle été RÉELLEMENT exécutée (réponse envoyée,
   * pièce classée, dossier créé) ? Une intention identifiée ne vaut jamais
   * « traité ».
   */
  action_executee: boolean;
  /** FALLBACK : le libellé Gmail d'arrivée exige-t-il une validation ? */
  label_requiert_validation?: boolean;
}

export interface DecisionEmail {
  /** Libellé d'état Gmail à poser. */
  etat: "archives" | "a_valider";
  statut_metier: StatutMetierEmail;
  /** Étape de l'ordre de priorité qui a tranché. */
  source: "securite" | "incertitude" | "intention" | "execution" | "label_fallback";
  motif: string;
}

/**
 * Décide du statut d'un email entrant.
 *
 * Note documentée (§9 du cahier des charges) : aucun statut « action à
 * effectuer » n'existe côté Gmail ni dans `crm_emails`. Pour ne jamais écrire
 * « traité » sans exécution réelle — et ne jamais laisser un mail boucler dans
 * la file —, le statut existant le plus proche est retenu (« A valider »), et
 * le statut métier `ACTION_A_EFFECTUER` est journalisé dans `triage_ia`.
 */
export function deciderStatutEmail(e: EntreeDecision): DecisionEmail {
  const a = e.analyse;

  // 1. Sécurité / actes engageants : validation humaine, sans exception.
  if (a && INTENTIONS_SENSIBLES.includes(a.intention)) {
    return {
      etat: "a_valider",
      statut_metier: "VALIDATION_HUMAINE",
      source: "securite",
      motif: `Acte sensible (${a.intention}) — validation humaine obligatoire`,
    };
  }

  // 2/3/4. Incertitude d'analyse ou d'identification : qualification humaine.
  if (a) {
    const identifie = Boolean(e.client_id) || Boolean(e.prospect_id);
    if (a.confidence < SEUIL_CONFIANCE_MINIMALE || a.intention === "A_QUALIFIER" || !identifie) {
      return {
        etat: "a_valider",
        statut_metier: "A_QUALIFIER",
        source: "incertitude",
        motif: !identifie
          ? "Expéditeur non identifié (ni client, ni prospect) — qualification humaine"
          : `Analyse incertaine (intention=${a.intention}, confiance=${a.confidence}) — qualification humaine`,
      };
    }
  }

  // 5. Règles métier : l'action a-t-elle réellement été exécutée ?
  if (e.action_executee) {
    return {
      etat: "archives",
      statut_metier: "TRAITE",
      source: "execution",
      motif: "Action administrative réellement exécutée",
    };
  }

  if (a) {
    return {
      etat: "a_valider",
      statut_metier: "ACTION_A_EFFECTUER",
      source: "intention",
      motif: `Intention ${a.intention} identifiée (confiance ${a.confidence}) — action à effectuer, non exécutée`,
    };
  }

  // 6. FALLBACK : aucune analyse exploitable, le libellé Gmail reprend la main.
  return {
    etat: e.label_requiert_validation === false ? "archives" : "a_valider",
    statut_metier: e.label_requiert_validation === false ? "TRAITE" : "A_QUALIFIER",
    source: "label_fallback",
    motif: "Analyse Gemini indisponible — repli sur le libellé Gmail",
  };
}

/**
 * L'intention permet-elle au CRM de préparer une action administrative sans
 * validation préalable (préparation ≠ envoi d'un acte engageant) ?
 */
export function preparationAutorisee(
  analyse: { intention: IntentionEmail; confidence: number } | null,
  clientId: string | null,
): boolean {
  if (!analyse || !clientId) return false;
  if (INTENTIONS_SENSIBLES.includes(analyse.intention)) return false;
  return analyse.confidence >= SEUIL_CONFIANCE_HAUTE;
}
