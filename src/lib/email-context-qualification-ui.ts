/**
 * CD-SI-001-B — LOT IHM QUALIFICATION — DESCRIPTEURS DE PRÉSENTATION.
 * Référence exclusive : docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.1.md
 *
 * Module PUR, sans I/O : il ne fait que décrire quels champs de proposition
 * d'identité sont exposables dans l'IHM (§2.1.5) et borner les valeurs
 * sélectionnables aux seuls référentiels réellement renvoyés par
 * `detailContexteEmail`.
 *
 * INTERDICTIONS APPLIQUÉES : aucune logique métier, aucune décision
 * d'autorisation (moteur pur seul juge), aucun chemin JSON libre, aucun champ
 * hors schéma 1.1.0, aucune FK, aucune écriture.
 */
import type { CorrectionContexte } from "./email-context-validation";
import type { CorrespondantRole, PersonRole } from "./email-context-types";

/** Sentinelle d'absence de valeur dans un `<select>` (aucune valeur libre). */
export const VALEUR_AUCUNE = "";

export const ROLES_CORRESPONDANT: readonly CorrespondantRole[] = [
  "client",
  "prospect",
  "compagnie",
  "partenaire",
  "interne",
  "inconnu",
] as const;

export const ROLES_PERSONNE: readonly PersonRole[] = [
  "souscripteur",
  "co_emprunteur",
  "conjoint",
  "enfant",
  "tiers",
  "inconnu",
] as const;

export type ObjetIhm = "correspondant" | "personne" | "dossier" | "contrat" | "produit" | "document";
export type GroupeReferentiel = "clients" | "compagnies" | "dossiers" | "contrats" | "produits" | "documents";

/**
 * Descripteur d'un champ d'identité exposable. `source` désigne soit un
 * référentiel d'identifiants, soit une énumération fermée du schéma 1.1.0.
 */
export type ChampIdentiteIhm =
  | { champ: string; libelle: string; source: "referentiel"; groupe: GroupeReferentiel }
  | { champ: string; libelle: string; source: "enum"; valeurs: readonly string[] };

/**
 * Union FERMÉE des champs d'identité exposés par objet, strictement alignée
 * sur `CorrectionContexte` et sur le validateur Zod du lot.
 */
export const CHAMPS_IDENTITE_IHM: Record<ObjetIhm, readonly ChampIdentiteIhm[]> = {
  correspondant: [
    { champ: "client_id", libelle: "Client", source: "referentiel", groupe: "clients" },
    { champ: "compagnie_id", libelle: "Compagnie", source: "referentiel", groupe: "compagnies" },
    { champ: "role_suppose", libelle: "Rôle supposé", source: "enum", valeurs: ROLES_CORRESPONDANT },
  ],
  personne: [
    { champ: "client_id_propose", libelle: "Client proposé", source: "referentiel", groupe: "clients" },
    { champ: "role", libelle: "Rôle", source: "enum", valeurs: ROLES_PERSONNE },
  ],
  dossier: [
    { champ: "dossier_id_propose", libelle: "Dossier proposé", source: "referentiel", groupe: "dossiers" },
  ],
  contrat: [
    { champ: "contrat_id_propose", libelle: "Contrat proposé", source: "referentiel", groupe: "contrats" },
  ],
  produit: [
    { champ: "produit_id_propose", libelle: "Produit proposé", source: "referentiel", groupe: "produits" },
  ],
  document: [
    { champ: "document_id_propose", libelle: "Document proposé", source: "referentiel", groupe: "documents" },
  ],
};

export type OptionIdentite = { valeur: string; libelle: string };
export type Referentiels = Partial<Record<GroupeReferentiel, readonly { id: string; libelle: string }[]>>;

/**
 * Options sélectionnables pour un champ donné : « aucun » plus les seules
 * valeurs bornées (référentiel réellement exposé, ou énumération fermée).
 * Aucune saisie libre n'est possible.
 */
export function optionsIdentite(descripteur: ChampIdentiteIhm, referentiels: Referentiels): OptionIdentite[] {
  const aucune: OptionIdentite = { valeur: VALEUR_AUCUNE, libelle: "— aucun —" };
  if (descripteur.source === "enum") {
    return [aucune, ...descripteur.valeurs.map((v) => ({ valeur: v, libelle: v }))];
  }
  const liste = referentiels[descripteur.groupe] ?? [];
  const vus = new Set<string>();
  const options: OptionIdentite[] = [aucune];
  for (const item of liste) {
    if (!item?.id || vus.has(item.id)) continue;
    vus.add(item.id);
    options.push({ valeur: item.id, libelle: item.libelle || item.id });
  }
  return options;
}

/**
 * Construit une correction d'identité à partir d'une valeur choisie dans un
 * `<select>`. Retourne `null` si la valeur n'appartient pas aux options
 * bornées : l'IHM ne peut donc pas émettre de cible ni de valeur non prévue.
 */
export function construireCorrectionIdentite(input: {
  objet: ObjetIhm;
  index: number | null;
  champ: string;
  valeurBrute: string;
  referentiels: Referentiels;
}): CorrectionContexte | null {
  const descripteurs = CHAMPS_IDENTITE_IHM[input.objet];
  const descripteur = descripteurs?.find((d) => d.champ === input.champ);
  if (!descripteur) return null;

  if (input.objet === "correspondant") {
    if (input.index !== null) return null;
  } else if (!Number.isInteger(input.index) || (input.index ?? -1) < 0) {
    return null;
  }

  const autorisees = optionsIdentite(descripteur, input.referentiels).map((o) => o.valeur);
  if (!autorisees.includes(input.valeurBrute)) return null;

  const valeur = input.valeurBrute === VALEUR_AUCUNE ? null : input.valeurBrute;
  const cible =
    input.objet === "correspondant"
      ? { objet: "correspondant" as const }
      : { objet: input.objet, index: input.index as number };

  return { cible, champ: input.champ, valeur } as CorrectionContexte;
}

/** Libellé lisible d'une correction, pour l'affichage du panier de corrections. */
export function libelleCorrectionIhm(
  correction: CorrectionContexte,
  referentiels: Referentiels,
): string {
  const objet = correction.cible.objet as ObjetIhm;
  const index = "index" in correction.cible ? `[${correction.cible.index}]` : "";
  const descripteur = CHAMPS_IDENTITE_IHM[objet]?.find((d) => d.champ === correction.champ);
  const brute = correction.valeur;
  let affichee = brute === null ? "aucun" : String(brute);
  if (descripteur && descripteur.source === "referentiel" && typeof brute === "string") {
    affichee = (referentiels[descripteur.groupe] ?? []).find((x) => x.id === brute)?.libelle ?? brute;
  }
  return `${objet}${index} · ${descripteur?.libelle ?? correction.champ} → ${affichee}`;
}
