/**
 * CD-SI-001-B — LOT 2 : INTÉGRATION GEMINI EXTRACTION (couche pure).
 *
 * Ce module contient UNIQUEMENT :
 *  - le prompt système d'extraction factuelle ;
 *  - le schéma JSON imposé à Gemini (sortie brute d'extraction) ;
 *  - la normalisation de cette sortie ;
 *  - la construction du contexte `ai_context` au statut DETECTED ;
 *  - la construction d'un contexte minimal en cas d'erreur d'extraction.
 *
 * RÈGLES ABSOLUES DU LOT 2 :
 *  - toute sortie Gemini est une PROPOSITION ;
 *  - aucune FK métier n'est écrite ni proposée sous forme d'UUID
 *    (`*_id_propose` reste toujours `null` : la résolution est hors périmètre) ;
 *  - aucun statut `CONFIRMED` ni `PROPOSED` n'est produit ;
 *  - aucune décision métier, aucune création d'entité, aucun moteur de résolution.
 *
 * Le contexte produit est validé par le validateur du LOT 1
 * (`email-context-schema.ts`) — aucun second schéma, aucun second modèle.
 */
import {
  AMBIGUITY_TYPES,
  EMAIL_CONTEXT_SCHEMA_VERSION,
  type AmbiguityType,
  type EmailContext,
  type Evidence,
  type PersonRole,
} from "./email-context-types";

/** Modèle prévu par le DESIGN, avec repli sur un modèle réellement disponible. */
export const MODELES_EXTRACTION = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"] as const;

/** Température basse et déterministe (DESIGN). */
export const TEMPERATURE_EXTRACTION = 0;

/** Délai maximal d'un appel Gemini (ms). */
export const TIMEOUT_EXTRACTION_MS = 30_000;

const ROLES_PERSONNE: PersonRole[] = [
  "souscripteur",
  "co_emprunteur",
  "conjoint",
  "enfant",
  "tiers",
  "inconnu",
];

export interface EmailAExtraire {
  sujet: string | null;
  expediteur_nom: string | null;
  expediteur_email: string | null;
  texte: string | null;
  pieces_jointes?: { nom: string }[];
}

/** Sortie BRUTE attendue de Gemini (extraction factuelle, sans décision). */
export interface ExtractionBruteGemini {
  personnes: {
    nom: string | null;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    role: PersonRole | null;
    extrait: string | null;
  }[];
  dossiers: { reference_citee: string | null; branche: string | null; extrait: string | null }[];
  contrats: {
    numero_police: string | null;
    compagnie_citee: string | null;
    extrait: string | null;
  }[];
  produits: { libelle: string | null; famille: string | null; extrait: string | null }[];
  documents: { nom_fichier: string | null; type_detecte: string | null; extrait: string | null }[];
  ambiguites: { type: string | null; description: string | null }[];
  confiance_extraction: number;
}

const objet = (props: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});
const txt = { type: ["string", "null"] };

/** Schéma JSON strict imposé au modèle (sortie brute d'extraction uniquement). */
export const SCHEMA_EXTRACTION_GEMINI = objet({
  personnes: {
    type: "array",
    items: objet({ nom: txt, prenom: txt, email: txt, telephone: txt, role: txt, extrait: txt }),
  },
  dossiers: {
    type: "array",
    items: objet({ reference_citee: txt, branche: txt, extrait: txt }),
  },
  contrats: {
    type: "array",
    items: objet({ numero_police: txt, compagnie_citee: txt, extrait: txt }),
  },
  produits: { type: "array", items: objet({ libelle: txt, famille: txt, extrait: txt }) },
  documents: {
    type: "array",
    items: objet({ nom_fichier: txt, type_detecte: txt, extrait: txt }),
  },
  ambiguites: { type: "array", items: objet({ type: txt, description: txt }) },
  confiance_extraction: { type: "number" },
});

export const PROMPT_SYSTEME_EXTRACTION = `Tu es un MOTEUR D'EXTRACTION FACTUELLE pour un cabinet de courtage en assurances.

PÉRIMÈTRE STRICT
Tu lis un email et tu extrais UNIQUEMENT ce qui est explicitement écrit :
- personnes citées (nom, prénom, email, téléphone, rôle si explicitement indiqué) ;
- références de dossiers citées textuellement ;
- numéros de contrats / de polices cités textuellement ;
- produits ou garanties mentionnés ;
- documents ou pièces jointes mentionnés ;
- un extrait textuel de preuve pour chaque élément (copie littérale, courte) ;
- une confiance d'extraction globale entre 0 et 1.

INTERDICTIONS ABSOLUES
- N'INVENTE RIEN : si une information n'est pas écrite, renvoie null.
- Ne détermine JAMAIS un client, un prospect, un dossier, un contrat, un produit
  ou une compagnie définitifs.
- Ne prends AUCUNE décision métier, ne valide rien, ne rattache rien.
- Ne propose aucun identifiant technique, aucun UUID, aucune clé de base.
- Ne crée rien, ne suggère aucune action, ne rédige aucune réponse.

ÉLÉMENTS INCERTAINS
Tout élément douteux reste une PROPOSITION : conserve-le dans sa liste et déclare
l'incertitude dans "ambiguites" (type parmi : client_multiple, dossier_multiple,
contrat_multiple, personne_inconnue, confiance_insuffisante,
donnees_contradictoires, autre).

SORTIE
Réponds EXCLUSIVEMENT par un JSON conforme au schéma fourni, sans commentaire ni texte libre.`;

export function consigneExtraction(email: EmailAExtraire): string {
  const pj = (email.pieces_jointes ?? []).map((p) => p.nom).join(", ") || "aucune";
  return `${PROMPT_SYSTEME_EXTRACTION}

--- EMAIL À ANALYSER ---
Expéditeur : ${email.expediteur_nom ?? "inconnu"} <${email.expediteur_email ?? "inconnu"}>
Objet : ${email.sujet ?? "(sans objet)"}
Pièces jointes : ${pj}
Corps :
${(email.texte ?? "").slice(0, 12_000)}
--- FIN DE L'EMAIL ---`;
}

const chaine = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t.slice(0, 500) : null;
};

const liste = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

const confiance01 = (v: unknown): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(1, Math.max(0, n));
};

const role = (v: unknown): PersonRole | null => {
  const t = chaine(v)?.toLowerCase();
  return t && (ROLES_PERSONNE as string[]).includes(t) ? (t as PersonRole) : null;
};

const typeAmbiguite = (v: unknown): AmbiguityType => {
  const t = chaine(v)?.toLowerCase();
  return t && (AMBIGUITY_TYPES as readonly string[]).includes(t) ? (t as AmbiguityType) : "autre";
};

/** Normalise la sortie brute du modèle (tolérante, sans invention). */
export function normaliserExtractionGemini(brut: unknown): ExtractionBruteGemini | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  return {
    personnes: liste(o["personnes"]).map((p) => ({
      nom: chaine(p["nom"]),
      prenom: chaine(p["prenom"]),
      email: chaine(p["email"]),
      telephone: chaine(p["telephone"]),
      role: role(p["role"]),
      extrait: chaine(p["extrait"]),
    })),
    dossiers: liste(o["dossiers"]).map((d) => ({
      reference_citee: chaine(d["reference_citee"]),
      branche: chaine(d["branche"]),
      extrait: chaine(d["extrait"]),
    })),
    contrats: liste(o["contrats"]).map((c) => ({
      numero_police: chaine(c["numero_police"]),
      compagnie_citee: chaine(c["compagnie_citee"]),
      extrait: chaine(c["extrait"]),
    })),
    produits: liste(o["produits"]).map((p) => ({
      libelle: chaine(p["libelle"]),
      famille: chaine(p["famille"]),
      extrait: chaine(p["extrait"]),
    })),
    documents: liste(o["documents"]).map((d) => ({
      nom_fichier: chaine(d["nom_fichier"]),
      type_detecte: chaine(d["type_detecte"]),
      extrait: chaine(d["extrait"]),
    })),
    ambiguites: liste(o["ambiguites"]).map((a) => ({
      type: typeAmbiguite(a["type"]),
      description: chaine(a["description"]),
    })),
    confiance_extraction: confiance01(o["confiance_extraction"]),
  };
}

/**
 * Construit le contexte `ai_context` au statut DETECTED à partir de l'extraction.
 * Aucun `*_id_propose` n'est renseigné : la résolution relève des lots suivants.
 */
export function construireContexteDetecte(
  extraction: ExtractionBruteGemini,
  options: { modele: string; email?: EmailAExtraire; analyseLe?: string },
): EmailContext {
  const detecteLe = options.analyseLe ?? new Date().toISOString();
  const provenance = {
    source: "gemini" as const,
    modele: options.modele,
    detecte_le: detecteLe,
  };
  const preuves: Evidence[] = [];
  let n = 0;
  const preuve = (type: Evidence["type"], extrait: string | null, cible: string): string[] => {
    if (!extrait) return [];
    const id = `g${++n}`;
    preuves.push({ id, type, extrait, cible, poids: extraction.confiance_extraction });
    return [id];
  };

  const personnes = extraction.personnes.map((p) => ({
    nom: p.nom,
    prenom: p.prenom,
    email: p.email,
    telephone: p.telephone,
    role: p.role,
    client_id_propose: null,
    statut: "DETECTED" as const,
    confiance: extraction.confiance_extraction,
    provenance: { ...provenance, preuve_ids: preuve("email_corps", p.extrait, "personne") },
  }));

  const dossiers = extraction.dossiers.map((d) => ({
    reference_citee: d.reference_citee,
    dossier_id_propose: null,
    branche: d.branche,
    statut: "DETECTED" as const,
    confiance: extraction.confiance_extraction,
    provenance: {
      ...provenance,
      preuve_ids: preuve("reference_explicite", d.extrait, "dossier"),
    },
  }));

  const contrats = extraction.contrats.map((c) => ({
    numero_police: c.numero_police,
    contrat_id_propose: null,
    compagnie_citee: c.compagnie_citee,
    statut: "DETECTED" as const,
    confiance: extraction.confiance_extraction,
    provenance: {
      ...provenance,
      preuve_ids: preuve("reference_explicite", c.extrait, "contrat"),
    },
  }));

  const produits = extraction.produits.map((p) => ({
    libelle: p.libelle,
    produit_id_propose: null,
    famille: p.famille,
    statut: "DETECTED" as const,
    confiance: extraction.confiance_extraction,
    provenance: { ...provenance, preuve_ids: preuve("email_corps", p.extrait, "produit") },
  }));

  const documents = extraction.documents.map((d) => ({
    nom_fichier: d.nom_fichier,
    type_detecte: d.type_detecte,
    gmail_attachment_id: null,
    document_id_propose: null,
    statut: "DETECTED" as const,
    confiance: extraction.confiance_extraction,
    provenance: { ...provenance, preuve_ids: preuve("piece_jointe", d.extrait, "document") },
  }));

  const contexte: EmailContext = {
    schema_version: EMAIL_CONTEXT_SCHEMA_VERSION,
    correspondant: {
      email: options.email?.expediteur_email ?? null,
      nom_affiche: options.email?.expediteur_nom ?? null,
      role_suppose: null,
      client_id: null,
      compagnie_id: null,
      statut: "DETECTED",
      confiance: extraction.confiance_extraction,
      provenance: { ...provenance, champ: "expediteur" },
    },
    personnes_detectees: personnes,
    dossiers_detectes: dossiers,
    contrats_detectes: contrats,
    produits_cites: produits,
    documents_associes: documents,
    preuves,
    ambiguities: extraction.ambiguites.map((a) => ({
      type: a.type as AmbiguityType,
      description: a.description,
      candidats: [],
      resolution_requise: true,
    })),
    analyse: {
      statut: "DETECTED",
      confiance_globale: extraction.confiance_extraction,
      modele: options.modele,
      analyse_le: detecteLe,
      validation_humaine_requise: true,
      validated_by: null,
      validated_at: null,
      modifications_apportees: [],
      provenance,
    },
  };
  return contexte;
}

export type MotifEchecExtraction =
  | "cle_absente"
  | "timeout"
  | "erreur_api"
  | "json_invalide"
  | "schema_non_conforme"
  | "reponse_vide";

/**
 * Contexte minimal (conforme au schéma) conservé en cas d'échec d'extraction.
 * Statut `A_QUALIFIER` : aucune donnée détectée, aucune FK, traitement délégué
 * au lot de qualification (LOT 6, non développé ici).
 */
export function contexteEchecExtraction(
  motif: MotifEchecExtraction,
  options: { modele?: string | null; detail?: string | null; analyseLe?: string } = {},
): EmailContext {
  const detecteLe = options.analyseLe ?? new Date().toISOString();
  return {
    schema_version: EMAIL_CONTEXT_SCHEMA_VERSION,
    ambiguities: [
      {
        type: "confiance_insuffisante",
        description: `Extraction Gemini indisponible (${motif})${
          options.detail ? ` : ${options.detail.slice(0, 300)}` : ""
        }`,
        candidats: [],
        resolution_requise: true,
      },
    ],
    analyse: {
      statut: "A_QUALIFIER",
      confiance_globale: 0,
      modele: options.modele ?? null,
      analyse_le: detecteLe,
      validation_humaine_requise: true,
      validated_by: null,
      validated_at: null,
      modifications_apportees: [],
      provenance: { source: "gemini", champ: `echec:${motif}`, detecte_le: detecteLe },
    },
  };
}

/** Extrait un objet JSON d'une réponse texte éventuellement encadrée. */
export function extraireJsonTexte(contenu: string): unknown {
  const brut = contenu.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(brut);
  } catch {
    const debut = brut.indexOf("{");
    const fin = brut.lastIndexOf("}");
    if (debut === -1 || fin <= debut) return null;
    try {
      return JSON.parse(brut.slice(debut, fin + 1));
    } catch {
      return null;
    }
  }
}
