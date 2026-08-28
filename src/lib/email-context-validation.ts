/**
 * CD-SI-001-B — LOT IHM QUALIFICATION / VALIDATION HUMAINE — MOTEUR PUR.
 * Référence exclusive : docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.1.md
 *
 * Aucune I/O, aucun accès base, aucun appel Gemini ni Gmail.
 * Seule responsabilité : appliquer une intention humaine à un `ai_context`
 * observé, en refusant toute dégradation d'une sentinelle humaine existante.
 *
 * INTERDICTIONS APPLIQUÉES : aucune FK, aucun champ hors schéma 1.1.0, aucun
 * changement de `schema_version`, aucun appel du Lot 4, aucun scoring.
 */
import { lireContexteEmail } from "./email-context-schema";
import {
  EMAIL_CONTEXT_SCHEMA_VERSION,
  type Ambiguity,
  type AssociatedDocument,
  type CitedProduct,
  type CorrespondantRole,
  type DetectedContract,
  type DetectedDossier,
  type DetectedPerson,
  type EmailContext,
  type EmailContextStatus,
  type PersonRole,
  type Provenance,
} from "./email-context-types";

export type CibleCorrection =
  | { objet: "correspondant" }
  | { objet: "personne"; index: number }
  | { objet: "dossier"; index: number }
  | { objet: "contrat"; index: number }
  | { objet: "produit"; index: number }
  | { objet: "document"; index: number };

/** Union FERMÉE : aucun chemin JSON libre, aucun champ hors schéma 1.1.0. */
export type CorrectionContexte =
  | { cible: CibleCorrection; champ: "statut"; valeur: EmailContextStatus }
  | {
      cible: { objet: "correspondant" };
      champ: "client_id" | "compagnie_id";
      valeur: string | null;
    }
  | { cible: { objet: "correspondant" }; champ: "role_suppose"; valeur: CorrespondantRole | null }
  | { cible: { objet: "personne"; index: number }; champ: "client_id_propose"; valeur: string | null }
  | { cible: { objet: "personne"; index: number }; champ: "role"; valeur: PersonRole | null }
  | { cible: { objet: "dossier"; index: number }; champ: "dossier_id_propose"; valeur: string | null }
  | { cible: { objet: "contrat"; index: number }; champ: "contrat_id_propose"; valeur: string | null }
  | { cible: { objet: "produit"; index: number }; champ: "produit_id_propose"; valeur: string | null }
  | { cible: { objet: "document"; index: number }; champ: "document_id_propose"; valeur: string | null };

export type IntentionHumaine =
  | { type: "valider" }
  | { type: "corriger_et_valider"; corrections: CorrectionContexte[] }
  | { type: "renvoyer_qualification"; motif: string };

export type MotifRefusValidation =
  | "email_introuvable"
  | "contexte_invalide"
  | "deja_valide"
  | "degradation_interdite"
  | "correction_hors_perimetre"
  | "updated_at_inexploitable"
  | "conflit_concurrent"
  | "erreur_base";

export type ResultatIntentionHumaine =
  | { autorise: true; contexte: EmailContext; cle: string; noop?: boolean }
  | { autorise: false; motif: MotifRefusValidation };

/** Statuts qu'un opérateur humain peut poser sur un élément du contexte. */
export const STATUTS_HUMAINS = ["CONFIRMED", "AMBIGUOUS", "A_QUALIFIER"] as const;
export type StatutHumain = (typeof STATUTS_HUMAINS)[number];

/**
 * Clé de corrélation / traçabilité de l'opération. Non déterministe dans le
 * temps car `validated_at` est généré côté serveur ; l'idempotence
 * fonctionnelle repose sur l'état déjà validé, pas sur l'égalité de cette clé.
 */
export function cleValidation(input: {
  emailId: string;
  statutCible: EmailContextStatus;
  validatedBy: string | null;
  validatedAt: string | null;
  corrections: readonly CorrectionContexte[];
}): string {
  const corrections = input.corrections
    .map((c) => {
      const index = "index" in c.cible ? c.cible.index : -1;
      return `${c.cible.objet}:${index}:${c.champ}:${String(c.valeur)}`;
    })
    .join("|");
  return [
    input.emailId,
    input.statutCible,
    input.validatedBy ?? "-",
    input.validatedAt ?? "-",
    corrections,
  ].join("#");
}

/* ------------------------------------------------------------------ */
/* Outils internes purs                                               */
/* ------------------------------------------------------------------ */

type ObjetCorrigible =
  | { kind: "correspondant" }
  | { kind: "liste"; liste: "personnes" | "dossiers" | "contrats" | "produits" | "documents"; index: number };

const CHAMPS_AUTORISES: Record<string, readonly string[]> = {
  correspondant: ["statut", "client_id", "compagnie_id", "role_suppose"],
  personne: ["statut", "client_id_propose", "role"],
  dossier: ["statut", "dossier_id_propose"],
  contrat: ["statut", "contrat_id_propose"],
  produit: ["statut", "produit_id_propose"],
  document: ["statut", "document_id_propose"],
};

const marquerHumain = (provenance: Provenance | undefined): Provenance => ({
  ...(provenance ?? {}),
  source: "humain",
});

function localiser(contexte: EmailContext, cible: CibleCorrection): ObjetCorrigible | null {
  if (cible.objet === "correspondant") return { kind: "correspondant" };
  const listes = {
    personne: { liste: "personnes" as const, taille: (contexte.personnes_detectees ?? []).length },
    dossier: { liste: "dossiers" as const, taille: (contexte.dossiers_detectes ?? []).length },
    contrat: { liste: "contrats" as const, taille: (contexte.contrats_detectes ?? []).length },
    produit: { liste: "produits" as const, taille: (contexte.produits_cites ?? []).length },
    document: { liste: "documents" as const, taille: (contexte.documents_associes ?? []).length },
  };
  const cfg = listes[cible.objet];
  if (!Number.isInteger(cible.index) || cible.index < 0 || cible.index >= cfg.taille) return null;
  return { kind: "liste", liste: cfg.liste, index: cible.index };
}

/** Valeur actuellement portée par le champ visé (pour la détection de NO-OP). */
function valeurCourante(contexte: EmailContext, correction: CorrectionContexte): unknown {
  const c = correction.cible;
  if (c.objet === "correspondant") {
    const o = contexte.correspondant ?? {};
    if (correction.champ === "statut") return o.statut ?? null;
    if (correction.champ === "client_id") return o.client_id ?? null;
    if (correction.champ === "compagnie_id") return o.compagnie_id ?? null;
    if (correction.champ === "role_suppose") return o.role_suppose ?? null;
    return null;
  }
  if (c.objet === "personne") {
    const p = (contexte.personnes_detectees ?? [])[c.index];
    if (correction.champ === "statut") return p?.statut ?? null;
    if (correction.champ === "client_id_propose") return p?.client_id_propose ?? null;
    if (correction.champ === "role") return p?.role ?? null;
    return null;
  }
  if (c.objet === "dossier") {
    const d = (contexte.dossiers_detectes ?? [])[c.index];
    if (correction.champ === "statut") return d?.statut ?? null;
    if (correction.champ === "dossier_id_propose") return d?.dossier_id_propose ?? null;
    return null;
  }
  if (c.objet === "contrat") {
    const k = (contexte.contrats_detectes ?? [])[c.index];
    if (correction.champ === "statut") return k?.statut ?? null;
    if (correction.champ === "contrat_id_propose") return k?.contrat_id_propose ?? null;
    return null;
  }
  if (c.objet === "produit") {
    const p = (contexte.produits_cites ?? [])[c.index];
    if (correction.champ === "statut") return p?.statut ?? null;
    if (correction.champ === "produit_id_propose") return p?.produit_id_propose ?? null;
    return null;
  }
  const doc = (contexte.documents_associes ?? [])[c.index];
  if (correction.champ === "statut") return doc?.statut ?? null;
  if (correction.champ === "document_id_propose") return doc?.document_id_propose ?? null;
  return null;
}


function appliquerCorrection(contexte: EmailContext, correction: CorrectionContexte): EmailContext | null {
  const emplacement = localiser(contexte, correction.cible);
  if (!emplacement) return null;
  const autorises = CHAMPS_AUTORISES[correction.cible.objet];
  if (!autorises || !autorises.includes(correction.champ)) return null;

  if (emplacement.kind === "correspondant") {
    const correspondant = { ...(contexte.correspondant ?? {}) };
    if (correction.champ === "statut") correspondant.statut = correction.valeur as EmailContextStatus;
    else if (correction.champ === "client_id") correspondant.client_id = correction.valeur as string | null;
    else if (correction.champ === "compagnie_id") correspondant.compagnie_id = correction.valeur as string | null;
    else if (correction.champ === "role_suppose")
      correspondant.role_suppose = correction.valeur as CorrespondantRole | null;
    correspondant.provenance = marquerHumain(correspondant.provenance);
    return { ...contexte, correspondant };
  }

  const champ = correction.champ;
  const valeur = correction.valeur;

  if (emplacement.liste === "personnes") {
    const liste = [...(contexte.personnes_detectees ?? [])];
    const item: DetectedPerson = { ...liste[emplacement.index]! };
    if (champ === "statut") item.statut = valeur as EmailContextStatus;
    else if (champ === "client_id_propose") item.client_id_propose = valeur as string | null;
    else if (champ === "role") item.role = valeur as PersonRole | null;
    item.provenance = marquerHumain(item.provenance);
    liste[emplacement.index] = item;
    return { ...contexte, personnes_detectees: liste };
  }
  if (emplacement.liste === "dossiers") {
    const liste = [...(contexte.dossiers_detectes ?? [])];
    const item: DetectedDossier = { ...liste[emplacement.index]! };
    if (champ === "statut") item.statut = valeur as EmailContextStatus;
    else if (champ === "dossier_id_propose") item.dossier_id_propose = valeur as string | null;
    item.provenance = marquerHumain(item.provenance);
    liste[emplacement.index] = item;
    return { ...contexte, dossiers_detectes: liste };
  }
  if (emplacement.liste === "contrats") {
    const liste = [...(contexte.contrats_detectes ?? [])];
    const item: DetectedContract = { ...liste[emplacement.index]! };
    if (champ === "statut") item.statut = valeur as EmailContextStatus;
    else if (champ === "contrat_id_propose") item.contrat_id_propose = valeur as string | null;
    item.provenance = marquerHumain(item.provenance);
    liste[emplacement.index] = item;
    return { ...contexte, contrats_detectes: liste };
  }
  if (emplacement.liste === "produits") {
    const liste = [...(contexte.produits_cites ?? [])];
    const item: CitedProduct = { ...liste[emplacement.index]! };
    if (champ === "statut") item.statut = valeur as EmailContextStatus;
    else if (champ === "produit_id_propose") item.produit_id_propose = valeur as string | null;
    item.provenance = marquerHumain(item.provenance);
    liste[emplacement.index] = item;
    return { ...contexte, produits_cites: liste };
  }
  const liste = [...(contexte.documents_associes ?? [])];
  const item: AssociatedDocument = { ...liste[emplacement.index]! };
  if (champ === "statut") item.statut = valeur as EmailContextStatus;
  else if (champ === "document_id_propose") item.document_id_propose = valeur as string | null;
  item.provenance = marquerHumain(item.provenance);
  liste[emplacement.index] = item;
  return { ...contexte, documents_associes: liste };
}

const libelleCorrection = (c: CorrectionContexte): string => {
  const index = "index" in c.cible ? `[${c.cible.index}]` : "";
  return `${c.cible.objet}${index}.${c.champ} = ${c.valeur === null ? "null" : String(c.valeur)}`;
};

/** Sentinelles humaines lues sur un contexte déjà validé (lecture pure). */
export function sentinellePresente(contexte: EmailContext): boolean {
  const a = contexte.analyse;
  return Boolean(a?.validated_by || a?.validated_at || a?.provenance?.source === "humain" || a?.statut === "CONFIRMED");
}

/* ------------------------------------------------------------------ */
/* Moteur                                                            */
/* ------------------------------------------------------------------ */

export function appliquerIntentionHumaine(input: {
  observe: EmailContext;
  intention: IntentionHumaine;
  /** Provient du serveur (`auth.uid()`), jamais du client. */
  operateurId: string;
  /** Horodatage serveur au format ISO. */
  valideLe: string;
}): ResultatIntentionHumaine {
  const observe = lireContexteEmail(input.observe);
  if (!observe) return { autorise: false, motif: "contexte_invalide" };
  if (!input.operateurId.trim() || !input.valideLe.trim()) {
    return { autorise: false, motif: "contexte_invalide" };
  }

  const intention = input.intention;
  const dejaValide = sentinellePresente(observe);

  // Règle de non-dégradation : un renvoi en qualification ne peut jamais
  // toucher un contexte déjà porteur d'une sentinelle humaine.
  if (dejaValide && intention.type === "renvoyer_qualification") {
    return { autorise: false, motif: "degradation_interdite" };
  }

  const corrections: CorrectionContexte[] =
    intention.type === "corriger_et_valider" ? intention.corrections : [];

  // Contrôle de périmètre des corrections avant toute décision d'idempotence.
  for (const c of corrections) {
    if (!localiser(observe, c.cible)) return { autorise: false, motif: "correction_hors_perimetre" };
    const autorises = CHAMPS_AUTORISES[c.cible.objet];
    if (!autorises || !autorises.includes(c.champ)) {
      return { autorise: false, motif: "correction_hors_perimetre" };
    }
    if (c.champ === "statut" && !STATUTS_HUMAINS.includes(c.valeur as StatutHumain)) {
      return { autorise: false, motif: "correction_hors_perimetre" };
    }
  }

  if (dejaValide) {
    const a = observe.analyse;
    const memeOperateur = a?.validated_by === input.operateurId;
    const dejaConfirme = a?.statut === "CONFIRMED" && a?.provenance?.source === "humain" && memeOperateur;
    const correctionsDejaAppliquees = corrections.every(
      (c) => valeurCourante(observe, c) === c.valeur,
    );
    if (dejaConfirme && correctionsDejaAppliquees) {
      // NO-OP explicite : aucune écriture BDD, `updated_at` inchangé.
      return {
        autorise: true,
        noop: true,
        contexte: observe,
        cle: cleValidation({
          emailId: "",
          statutCible: "CONFIRMED",
          validatedBy: a?.validated_by ?? null,
          validatedAt: a?.validated_at ?? null,
          corrections,
        }),
      };
    }
    return { autorise: false, motif: "deja_valide" };
  }

  let cible: EmailContext = { ...observe, schema_version: EMAIL_CONTEXT_SCHEMA_VERSION };

  if (intention.type === "renvoyer_qualification") {
    const motif = intention.motif.trim();
    if (!motif) return { autorise: false, motif: "correction_hors_perimetre" };
    const ambiguite: Ambiguity = {
      type: "autre",
      description: motif,
      resolution_requise: true,
    };
    cible = {
      ...cible,
      ambiguities: [...(cible.ambiguities ?? []), ambiguite],
      analyse: {
        ...(cible.analyse ?? {}),
        statut: "A_QUALIFIER",
        validation_humaine_requise: true,
      },
    };
  } else {
    const modifications: string[] = [];
    for (const c of corrections) {
      const suivant = appliquerCorrection(cible, c);
      if (!suivant) return { autorise: false, motif: "correction_hors_perimetre" };
      cible = suivant;
      modifications.push(libelleCorrection(c));
    }
    cible = {
      ...cible,
      analyse: {
        ...(cible.analyse ?? {}),
        statut: "CONFIRMED",
        validated_by: input.operateurId,
        validated_at: input.valideLe,
        validation_humaine_requise: false,
        provenance: marquerHumain(cible.analyse?.provenance),
        ...(modifications.length > 0
          ? {
              modifications_apportees: [
                ...(cible.analyse?.modifications_apportees ?? []),
                ...modifications,
              ],
            }
          : {}),
      },
    };
  }

  const sortie = lireContexteEmail(cible);
  if (!sortie) return { autorise: false, motif: "contexte_invalide" };

  return {
    autorise: true,
    contexte: sortie,
    cle: cleValidation({
      emailId: "",
      statutCible: sortie.analyse?.statut ?? "A_QUALIFIER",
      validatedBy: sortie.analyse?.validated_by ?? null,
      validatedAt: sortie.analyse?.validated_at ?? null,
      corrections,
    }),
  };
}
