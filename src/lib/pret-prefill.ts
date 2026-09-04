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
  const { situationPret } = require("./pret-amortissement") as typeof import("./pret-amortissement");
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
