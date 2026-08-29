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

const CHAMPS_PRET: { cle: string; source: string }[] = [
  { cle: "banque", source: "banque" },
  { cle: "capital", source: "montant_capital" },
  { cle: "duree_mois", source: "duree_mois" },
  { cle: "taux_pret", source: "taux_nominal" },
  { cle: "mensualite_pret", source: "mensualite" },
];

function vide(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

export function prefillRecueilEmprunteur(
  recueilExistant: Record<string, unknown> | null,
  extraction: Record<string, unknown> | null,
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

  // Mois restants : reportés depuis la durée du prêt uniquement si absents.
  if (vide(recueil["mois_restants"]) && !vide(recueil["duree_mois"])) {
    recueil["mois_restants"] = recueil["duree_mois"];
    ajouts.push("mois_restants");
  }

  const manquants = ["capital", "duree_mois"].filter((k) => vide(recueil[k]));
  // Les assurés (dates de naissance, quotités) restent une saisie humaine :
  // aucune donnée personnelle n'est déduite d'une offre de prêt.
  if (vide(recueil["assures"])) manquants.push("assures");

  return { recueil, ajouts, manquants };
}
