/**
 * ASSURANCE EMPRUNTEUR INITIALE (contrat groupe de la banque) — fonctions PURES.
 *
 * Objectif : chiffrer, à partir de l'offre de prêt, ce que coûte l'assurance
 * actuellement en place, puis le coût réellement évitable, c'est-à-dire celui
 * courant ENTRE LE MOIS PRÉVU DE LA SUBSTITUTION ET LA FIN DU CRÉDIT.
 *
 * Règles métier :
 *  - un coût total explicitement écrit dans l'offre ou le tableau prime sur
 *    toute extrapolation ;
 *  - une première cotisation ne peut être considérée constante que si elle est
 *    cohérente avec ce coût total ;
 *  - le coût restant s'apprécie sur les mois restants à la date d'effet prévue
 *    de la substitution (cf. `situationPret`) ;
 *  - aucune valeur n'est écrite : ces fonctions calculent uniquement.
 */

export interface AssuranceInitialeEntree {
  /** Capital emprunté (base du contrat groupe bancaire). */
  capital?: number | null;
  /** Taux d'assurance annuel de la banque, en % (ex. 0.36). */
  tauxAssurancePct?: number | null;
  /** Cotisation d'assurance mensuelle lue sur l'offre de prêt (€ / mois). */
  cotisationMensuelle?: number | null;
  /** Coût total explicitement écrit dans le document bancaire. */
  coutTotalDocument?: number | null;
  /** Durée totale du prêt, en mois. */
  dureeMois?: number | null;
  /** Mois restants à la date d'effet prévue de la substitution. */
  moisRestants?: number | null;
  /** Quotité assurée totale, en % (100 par défaut). */
  quotitePct?: number | null;
}

export interface AssuranceInitiale {
  /** Cotisation mensuelle retenue (€ / mois), quotité appliquée. */
  mensuel: number | null;
  /** Origine du chiffrage retenu. */
  origine: "document" | "offre" | "taux" | "inconnue";
  /** Coût total de l'assurance bancaire sur toute la durée du prêt. */
  coutTotal: number | null;
  /** Coût de l'assurance bancaire du mois de substitution à la fin du crédit. */
  coutRestant: number | null;
  moisRestants: number | null;
}

function nb(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

export function assuranceInitiale(e: AssuranceInitialeEntree): AssuranceInitiale {
  const capital = nb(e.capital);
  const taux = nb(e.tauxAssurancePct);
  const duree = nb(e.dureeMois);
  const restants = e.moisRestants === null || e.moisRestants === undefined ? null : Math.max(0, Math.round(Number(e.moisRestants)));
  const quotite = (nb(e.quotitePct) ?? 100) / 100;

  const lue = nb(e.cotisationMensuelle);
  const totalDocument = nb(e.coutTotalDocument);
  let mensuel: number | null = null;
  let origine: AssuranceInitiale["origine"] = "inconnue";
  if (lue !== null) {
    mensuel = lue;
    origine = "offre";
  } else if (capital !== null && taux !== null) {
    mensuel = ((capital * taux) / 100 / 12) * quotite;
    origine = "taux";
  }

  const coutCalcule = mensuel !== null && duree !== null ? arrondi(mensuel * duree) : null;
  const cotisationConstante =
    totalDocument === null || coutCalcule === null
      ? true
      : Math.abs(coutCalcule - totalDocument) <= Math.max(1, totalDocument * 0.01);

  return {
    mensuel: mensuel === null ? null : arrondi(mensuel),
    origine: totalDocument !== null ? "document" : origine,
    coutTotal: totalDocument ?? coutCalcule,
    // Si le document prouve que la cotisation varie, la première échéance ne
    // doit jamais être multipliée par les mois restants. Sans échéancier
    // détaillé exploitable, mieux vaut ne rien afficher qu'un montant faux.
    coutRestant:
      mensuel !== null && restants !== null && cotisationConstante ? arrondi(mensuel * restants) : null,
    moisRestants: restants,
  };
}

/**
 * Lecture directe depuis le recueil des besoins emprunteur.
 * `moisRestants` provient du calcul d'amortissement (date d'effet prévue).
 */
export function assuranceInitialeDepuisRecueil(
  recueil: Record<string, unknown> | null | undefined,
  moisRestants: number | null,
): AssuranceInitiale {
  const r = recueil ?? {};
  return assuranceInitiale({
    capital: nb(r["capital"]),
    tauxAssurancePct: nb(r["taux_assurance_banque"]),
    cotisationMensuelle: nb(r["assurance_banque_mensuelle"]),
    coutTotalDocument: nb(r["assurance_banque_cout_total"]),
    dureeMois: nb(r["duree_mois"]),
    moisRestants: moisRestants ?? nb(r["mois_restants"]),
  });
}

export interface EconomieDevis {
  /** Coût de l'assurance bancaire restant à courir. */
  coutInitial: number;
  /** Coût total du devis courtier sur la même période. */
  coutDevis: number;
  /** Économie brute (peut être négative : le devis coûte plus cher). */
  economie: number;
  /** Économie en % du coût initial restant. */
  pourcentage: number;
}

/**
 * Économie réalisée par un devis, comparée au coût restant de l'assurance
 * bancaire. Retourne null si l'un des deux montants manque : rien n'est déduit.
 */
export function economieDevis(coutInitialRestant: number | null, coutTotalDevis: number | null): EconomieDevis | null {
  const initial = nb(coutInitialRestant);
  const devis = coutTotalDevis === null || coutTotalDevis === undefined ? null : Number(coutTotalDevis);
  if (initial === null || devis === null || !Number.isFinite(devis) || devis < 0) return null;
  const economie = arrondi(initial - devis);
  return {
    coutInitial: arrondi(initial),
    coutDevis: arrondi(devis),
    economie,
    pourcentage: Math.round((economie / initial) * 1000) / 10,
  };
}
