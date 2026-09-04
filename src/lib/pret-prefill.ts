/**
 * PRÉ-REMPLISSAGE DU RECUEIL EMPRUNTEUR depuis l'extraction documentaire
 * d'une offre de prêt / d'un tableau d'amortissement (fonction PURE).
 *
 * Règles :
 *  - une valeur déjà saisie par un humain n'est JAMAIS écrasée ;
 *  - aucune donnée n'est déduite : seuls les champs réellement extraits sont
 *    reportés ;
 *  - le pré-remplissage ne vaut pas validation du recueil : la DDA reste
 *    validée par un humain (ou par le circuit existant de la lettre de mission).
 */

import { situationPret } from "./pret-amortissement";

export interface PrefillEmprunteurResultat {
  recueil: Record<string, unknown>;
  /** Clés réellement ajoutées par le pré-remplissage. */
  ajouts: string[];
  /** Champs du prêt encore manquants après pré-remplissage. */
  manquants: string[];
}

/**
 * Champs du recueil pouvant être pré-remplis. La liste est volontairement
 * limitée aux clés autorisées par le recueil emprunteur (liste blanche stricte
 * côté base) : aucune clé hors schéma n'est écrite.
 */
const CHAMPS_PRET: { cle: string; source: string }[] = [
  { cle: "banque", source: "banque" },
  { cle: "capital", source: "montant_capital" },
  { cle: "duree_mois", source: "duree_mois" },
  { cle: "taux_pret", source: "taux_nominal" },
  { cle: "date_premiere_echeance", source: "date_premiere_echeance" },
  // Assurance emprunteur actuellement portée par la banque : base du calcul du
  // coût initial et de l'économie réalisée par la substitution.
  { cle: "taux_assurance_banque", source: "taux_assurance" },
  { cle: "assurance_banque_mensuelle", source: "cotisation_assurance_mensuelle" },
];


function vide(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export function prefillRecueilEmprunteur(
  recueilExistant: Record<string, unknown> | null,
  extraction: Record<string, unknown> | null,
  options?: {
    /** Date de création du dossier : base du délai de 3 mois de substitution. */
    dossier_cree_le?: string | null;
  },
): PrefillEmprunteurResultat {
  const recueil: Record<string, unknown> = { ...(recueilExistant ?? {}) };
  const ajouts: string[] = [];

  for (const champ of CHAMPS_PRET) {
    const valeur = extraction?.[champ.source];
    if (vide(valeur)) continue;
    if (!vide(recueil[champ.cle])) continue;
    recueil[champ.cle] = valeur;
    ajouts.push(champ.cle);
  }

  // Capital restant dû et mois restants : calculés par amortissement à la date
  // d'effet prévue de la substitution (date communiquée par la compagnie, sinon
  // création du dossier + 3 mois). Une saisie humaine n'est jamais écrasée.
  const situation = situationPret({
    capital: Number(recueil["capital"]) || null,
    taux_pret: Number(recueil["taux_pret"]) || null,
    duree_mois: Number(recueil["duree_mois"]) || null,
    date_premiere_echeance: typeof recueil["date_premiere_echeance"] === "string" ? (recueil["date_premiere_echeance"] as string) : null,
    date_effet: typeof recueil["date_effet"] === "string" ? (recueil["date_effet"] as string) : null,
    dossier_cree_le: options?.dossier_cree_le ?? null,
  });

  if (vide(recueil["date_effet"]) && situation.date_effet) {
    recueil["date_effet"] = situation.date_effet;
    ajouts.push("date_effet");
  }
  if (vide(recueil["mois_restants"])) {
    const valeur = situation.mois_restants ?? (vide(recueil["duree_mois"]) ? null : recueil["duree_mois"]);
    if (!vide(valeur)) {
      recueil["mois_restants"] = valeur;
      ajouts.push("mois_restants");
    }
  }
  if (vide(recueil["capital_restant_du"]) && situation.capital_restant_du !== null) {
    recueil["capital_restant_du"] = situation.capital_restant_du;
    ajouts.push("capital_restant_du");
  }


  const manquants = ["capital", "duree_mois"].filter((k) => vide(recueil[k]));
  // Les assurés (dates de naissance, quotités) restent une saisie humaine :
  // aucune donnée personnelle n'est déduite d'une offre de prêt.
  if (vide(recueil["assures"])) manquants.push("assures");

  return { recueil, ajouts, manquants };
}

/** Identité comparable : sans accents, sans ponctuation, en minuscules. */
function jetons(...parties: (string | null | undefined)[]): string[] {
  return parties
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

export interface EmprunteurLu {
  nom?: string | null;
  prenom?: string | null;
  date_naissance?: string | null;
  quotite_pct?: number | null;
  csp?: string | null;
  fumeur?: boolean | null;
}

/**
 * Complète les personnes assurées du recueil avec ce que l'offre de prêt
 * indique RÉELLEMENT (quotité, date de naissance, profession, statut fumeur).
 * Une valeur déjà renseignée n'est jamais remplacée, et rien n'est déduit :
 * une quotité absente du document reste vide.
 */
export function completerAssuresDepuisOffre(
  recueil: Record<string, unknown>,
  emprunteurs: EmprunteurLu[],
): { recueil: Record<string, unknown>; ajouts: string[] } {
  const assures = Array.isArray(recueil["assures"])
    ? (recueil["assures"] as Record<string, unknown>[]).map((a) => ({ ...a }))
    : [];
  if (assures.length === 0 || emprunteurs.length === 0) return { recueil, ajouts: [] };

  const ajouts: string[] = [];
  assures.forEach((a, i) => {
    const cibles = jetons(a["nom"] as string, a["prenom"] as string);
    let lu =
      emprunteurs.find((e) => {
        const src = jetons(e.nom, e.prenom);
        return src.some((t) => cibles.includes(t));
      }) ?? null;
    // Une seule personne de part et d'autre : rapprochement direct.
    if (!lu && assures.length === 1 && emprunteurs.length === 1) lu = emprunteurs[0]!;
    if (!lu) return;

    const poser = (cle: string, valeur: unknown) => {
      if (vide(valeur)) return;
      if (!vide(a[cle])) return;
      a[cle] = valeur;
      ajouts.push(`assures[${i}].${cle}`);
    };
    poser("quotite_pct", typeof lu.quotite_pct === "number" ? lu.quotite_pct : null);
    poser("date_naissance", lu.date_naissance);
    poser("csp", lu.csp);
    if (lu.fumeur === true && a["fumeur"] !== true) {
      a["fumeur"] = true;
      ajouts.push(`assures[${i}].fumeur`);
    }
  });

  if (ajouts.length === 0) return { recueil, ajouts: [] };
  return { recueil: { ...recueil, assures }, ajouts };
}
