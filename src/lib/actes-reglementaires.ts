/**
 * BARRIÈRE RÉGLEMENTAIRE ACPR / DDA.
 *
 * Module PUR (aucun réseau, aucune écriture) : il dit si une réponse peut
 * partir en autonomie, ou si l'acte relève obligatoirement d'une intervention
 * humaine (obligations ACPR et Directive Distribution d'Assurance).
 *
 * Principe : l'autonomie est la règle pour la gestion commerciale,
 * administrative et financière ; la validation humaine est la règle pour tout
 * acte de distribution, de conseil, d'engagement contractuel ou de sinistre /
 * réclamation.
 */
import type { IntentionEmail } from "@/lib/email-intention-types";
import { INTENTIONS_SENSIBLES } from "@/lib/email-intention-types";

/** Actes dont la responsabilité ne peut jamais être déléguée à l'agent. */
export const ACTES_REGLEMENTAIRES = [
  "recueil_besoins_dda",
  "devoir_conseil",
  "lettre_mission",
  "der",
  "souscription",
  "resiliation",
  "reclamation",
  "sinistre",
  "tarification_conseil",
  "engagement_contractuel",
  "donnees_sante",
] as const;

export type ActeReglementaire = (typeof ACTES_REGLEMENTAIRES)[number];

/** Canal d'échange : détermine le niveau d'autonomie de base. */
export type CanalReponse = "client" | "prospect" | "partenaire" | "fournisseur" | "partenariat";

const MOTIFS: { acte: ActeReglementaire; motif: RegExp }[] = [
  { acte: "recueil_besoins_dda", motif: /(recueil (des )?besoins|\bdda\b|analyse de mes besoins|questionnaire de besoins)/i },
  { acte: "devoir_conseil", motif: /(devoir de conseil|conseil personnalis|préconisation|preconisation|quel contrat me conseill)/i },
  { acte: "lettre_mission", motif: /(lettre de mission|mandat de recherche)/i },
  { acte: "der", motif: /(document d'information|\bder\b|d[ée]claration d'information)/i },
  { acte: "souscription", motif: /(souscri|adh[ée]sion|signer le contrat|bulletin d'adh[ée]sion|mise en place du contrat)/i },
  { acte: "resiliation", motif: /(r[ée]sili|substitution de contrat|loi lemoine|d[ée]nonciation)/i },
  { acte: "reclamation", motif: /(r[ée]clamation|m[ée]diateur|litige|insatisfait|mise en demeure)/i },
  { acte: "sinistre", motif: /(sinistre|arr[êe]t de travail|invalidit|incapacit|d[ée]c[èe]s|hospitalis)/i },
  { acte: "tarification_conseil", motif: /(tarif|cotisation propos|devis|surprime|taux d'assurance|combien (co[ûu]terait|vais-je payer))/i },
  { acte: "engagement_contractuel", motif: /(convention de partenariat|contrat de courtage|protocole|engagement de commission|signature de la convention)/i },
  { acte: "donnees_sante", motif: /(questionnaire (m[ée]dical|de sant[ée])|antécédent|antecedent|pathologie|traitement m[ée]dical)/i },
];

/** Intentions qui, seules, ferment déjà l'autonomie (actes engageants). */
const INTENTION_VERS_ACTE: Partial<Record<IntentionEmail, ActeReglementaire>> = {
  RESILIATION: "resiliation",
  SINISTRE: "sinistre",
  RECLAMATION: "reclamation",
  DEMANDE_MODIFICATION_CONTRAT: "engagement_contractuel",
  DEMANDE_DEVIS: "tarification_conseil",
};

/** Premier acte réglementaire détecté dans le sujet / le corps, ou null. */
export function acteReglementaireDetecte(
  sujet: string | null | undefined,
  texte: string | null | undefined,
): ActeReglementaire | null {
  const contenu = `${sujet ?? ""}\n${texte ?? ""}`;
  if (!contenu.trim()) return null;
  for (const { acte, motif } of MOTIFS) {
    if (motif.test(contenu)) return acte;
  }
  return null;
}

export interface EntreeAutorisation {
  canal: CanalReponse;
  intention?: IntentionEmail | null;
  /** Confiance de l'analyse (0-1). En dessous du seuil : validation humaine. */
  confiance?: number | null;
  sujet?: string | null;
  texte?: string | null;
  /** Un humain a déjà pris la main sur ce message : plus aucune autonomie. */
  prise_en_charge_humaine?: boolean;
}

export interface Autorisation {
  autorise: boolean;
  motif: string;
  acte: ActeReglementaire | null;
}

/** Seuil minimal de confiance pour agir sans relecture humaine. */
export const SEUIL_CONFIANCE_AUTONOMIE = 0.75;

/**
 * Décide si l'agent peut répondre seul. Toute incertitude ferme l'autonomie :
 * l'humain reste le contrôle final.
 */
export function autorisationReponseAutonome(e: EntreeAutorisation): Autorisation {
  if (e.prise_en_charge_humaine) {
    return { autorise: false, motif: "Message pris en charge par un gestionnaire", acte: null };
  }

  if (e.intention && INTENTIONS_SENSIBLES.includes(e.intention)) {
    return {
      autorise: false,
      motif: `Intention sensible (${e.intention}) — validation humaine ACPR obligatoire`,
      acte: INTENTION_VERS_ACTE[e.intention] ?? null,
    };
  }

  const acteIntention = e.intention ? INTENTION_VERS_ACTE[e.intention] ?? null : null;
  if (acteIntention) {
    return {
      autorise: false,
      motif: `Acte réglementaire (${acteIntention}) déduit de l'intention — validation humaine obligatoire`,
      acte: acteIntention,
    };
  }

  const acte = acteReglementaireDetecte(e.sujet, e.texte);
  if (acte) {
    return {
      autorise: false,
      motif: `Acte réglementaire détecté (${acte}) — obligation ACPR / DDA, validation humaine`,
      acte,
    };
  }

  if (typeof e.confiance === "number" && e.confiance < SEUIL_CONFIANCE_AUTONOMIE) {
    return {
      autorise: false,
      motif: `Confiance d'analyse insuffisante (${(e.confiance * 100).toFixed(0)} %) — validation humaine`,
      acte: null,
    };
  }

  return {
    autorise: true,
    motif: `Gestion courante (${e.canal}) — réponse autonome autorisée`,
    acte: null,
  };
}
