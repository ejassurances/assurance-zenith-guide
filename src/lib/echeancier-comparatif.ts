/**
 * ÉCHÉANCIER COMPARATIF EMPRUNTEUR (fonctions PURES).
 *
 * Produit, échéance par échéance et à partir du mois prévu de la substitution :
 *  - la mensualité du prêt (hors assurance), sa part d'intérêts et sa part de
 *    capital amorti ;
 *  - la cotisation de l'assurance de la banque (contrat groupe, constante car
 *    calculée sur le capital initial) ;
 *  - la cotisation de la nouvelle assurance (constante en CI, dégressive en CRD) ;
 *  - le prélèvement total actuel (banque + assurance de la banque) et le
 *    prélèvement total avec notre assurance ;
 *  - le différentiel : négatif = notre assurance est moins chère.
 *
 * Règles : aucune valeur n'est déduite. Si le capital, la durée, la date de la
 * première échéance ou l'une des deux cotisations manque, l'échéancier n'est pas
 * produit (tableau vide) — jamais d'estimation inventée.
 */

import { capitalRestantDu, mensualitePret, situationPret } from "./pret-amortissement";

export interface LigneEcheancier {
  /** Rang de l'échéance dans le prêt (1 = première échéance du prêt). */
  rang: number;
  /** Date d'échéance au format AAAA-MM-JJ. */
  date: string;
  /** Mensualité du prêt hors assurance. */
  echeance: number;
  interets: number;
  capital: number;
  /** Cotisation de l'assurance en place (contrat groupe de la banque). */
  assurance_initiale: number;
  /** Cotisation de la nouvelle assurance proposée. */
  assurance_nouvelle: number;
  /** Prélèvement total actuel : échéance + assurance de la banque. */
  total_actuel: number;
  /** Prélèvement total avec notre assurance. */
  total_nouveau: number;
  /** total_nouveau - total_actuel : négatif = économie pour le client. */
  differentiel: number;
}

export interface EcheancierComparatif {
  lignes: LigneEcheancier[];
  /** Assiette de la nouvelle cotisation : CI = constante, CRD = dégressive. */
  type_cotisation: "CI" | "CRD" | null;
  date_effet: string | null;
  total_assurance_initiale: number;
  total_assurance_nouvelle: number;
  /** Négatif = économie totale sur la période restante. */
  total_differentiel: number;
  /** Économie sur les seules cotisations d'assurance, sur toute la durée résiduelle
   *  du prêt à compter de la substitution. Positif = économie réelle pour le client ;
   *  négatif = la nouvelle assurance coûte in fine plus cher (cas honnêtement signalé,
   *  jamais masqué). = -total_differentiel. */
  economie_brute: number;
  /** Somme des frais ponctuels (courtage + dossier + adhésion) — déduits une seule
   *  fois, jamais étalés sur la durée : ce sont des frais uniques, pas mensuels. */
  frais_totaux: number;
  /** economie_brute - frais_totaux. */
  economie_nette: number;
}

export interface EcheancierEntree {
  capital?: number | null;
  taux_pret?: number | null;
  duree_mois?: number | null;
  date_premiere_echeance?: string | null;
  /** Date d'effet communiquée par la compagnie, sinon création du dossier + 3 mois. */
  date_effet?: string | null;
  dossier_cree_le?: string | null;
  /** Cotisation mensuelle de l'assurance de la banque (offre de prêt). */
  assurance_initiale_mensuelle?: number | null;
  /** Cotisation mensuelle de la nouvelle assurance (moyenne si CRD). */
  assurance_nouvelle_mensuelle?: number | null;
  type_cotisation?: "CI" | "CRD" | null;
  /** Frais ponctuels du nouveau contrat, déduits de l'économie brute pour obtenir la nette. */
  frais_courtage?: number | null;
  frais_dossier?: number | null;
  frais_adhesion?: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function nb(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ajouterMois(date: string, mois: number): string {
  const d = new Date(date);
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + mois, d.getUTCDate()));
  return r.toISOString().slice(0, 10);
}

export type LigneVueEcheancier =
  | { type: "mois"; ligne: LigneEcheancier }
  | {
      type: "annee";
      annee: number;
      nb_mois: number;
      interets: number;
      capital: number;
      assurance_initiale: number;
      assurance_nouvelle: number;
      total_actuel: number;
      total_nouveau: number;
      differentiel: number;
    };

/**
 * Vue d'affichage de l'échéancier comparatif : les `detailMois` premières
 * échéances restent mois par mois, puis chaque année civile suivante est
 * agrégée en une seule ligne (sommes des montants mensuels). Ne modifie
 * aucune valeur calculée — pure mise en forme pour l'affichage.
 */
export function regrouperEcheancierParAnnee(
  lignes: LigneEcheancier[],
  detailMois = 12,
): LigneVueEcheancier[] {
  const vue: LigneVueEcheancier[] = [];
  const detail = lignes.slice(0, detailMois);
  const reste = lignes.slice(detailMois);

  for (const ligne of detail) vue.push({ type: "mois", ligne });

  const parAnnee = new Map<number, LigneEcheancier[]>();
  for (const ligne of reste) {
    const annee = Number(ligne.date.slice(0, 4));
    const groupe = parAnnee.get(annee) ?? [];
    groupe.push(ligne);
    parAnnee.set(annee, groupe);
  }

  for (const [annee, groupe] of [...parAnnee.entries()].sort((a, b) => a[0] - b[0])) {
    const somme = (f: (l: LigneEcheancier) => number) => r2(groupe.reduce((acc, l) => acc + f(l), 0));
    vue.push({
      type: "annee",
      annee,
      nb_mois: groupe.length,
      interets: somme((l) => l.interets),
      capital: somme((l) => l.capital),
      assurance_initiale: somme((l) => l.assurance_initiale),
      assurance_nouvelle: somme((l) => l.assurance_nouvelle),
      total_actuel: somme((l) => l.total_actuel),
      total_nouveau: somme((l) => l.total_nouveau),
      differentiel: somme((l) => l.differentiel),
    });
  }

  return vue;
}

const VIDE: EcheancierComparatif = {
  lignes: [],
  type_cotisation: null,
  date_effet: null,
  total_assurance_initiale: 0,
  total_assurance_nouvelle: 0,
  total_differentiel: 0,
  economie_brute: 0,
  frais_totaux: 0,
  economie_nette: 0,
};

/**
 * Échéancier comparatif du mois de substitution jusqu'à la fin du crédit.
 * En CRD, la cotisation de chaque mois est proportionnelle au capital restant dû,
 * calibrée pour que la moyenne corresponde à la cotisation moyenne du devis.
 */
export function echeancierComparatif(e: EcheancierEntree): EcheancierComparatif {
  const capital = nb(e.capital);
  const duree = nb(e.duree_mois);
  const premiere = e.date_premiere_echeance ? String(e.date_premiere_echeance).slice(0, 10) : null;
  const assInit = nb(e.assurance_initiale_mensuelle);
  const assNouv = nb(e.assurance_nouvelle_mensuelle);
  if (capital === null || duree === null || !premiere || assInit === null || assNouv === null) return VIDE;

  const taux = Number.isFinite(Number(e.taux_pret)) ? Number(e.taux_pret) : 0;
  const situation = situationPret({
    capital,
    taux_pret: taux,
    duree_mois: duree,
    date_premiere_echeance: premiere,
    date_effet: e.date_effet ?? null,
    dossier_cree_le: e.dossier_cree_le ?? null,
  });
  const ecoules = situation.mois_ecoules ?? 0;
  const mensualite = mensualitePret(capital, taux, duree);
  if (mensualite === null || ecoules >= duree) return { ...VIDE, date_effet: situation.date_effet };

  const i = taux / 100 / 12;
  const crd = (k: number) => capitalRestantDu(capital, taux, duree, k) ?? 0;

  // Calibrage CRD : moyenne des capitaux restants dus sur la période restante.
  const restants = duree - ecoules;
  let sommeCrd = 0;
  for (let k = ecoules; k < duree; k++) sommeCrd += crd(k);
  const crdMoyen = restants > 0 ? sommeCrd / restants : 0;
  const degressive = e.type_cotisation === "CRD" && crdMoyen > 0;

  const lignes: LigneEcheancier[] = [];
  for (let k = ecoules; k < duree; k++) {
    const restant = crd(k);
    const interets = restant * i;
    const amorti = Math.min(restant, mensualite - interets);
    const nouvelle = degressive ? assNouv * (restant / crdMoyen) : assNouv;
    const totalActuel = mensualite + assInit;
    const totalNouveau = mensualite + nouvelle;
    lignes.push({
      rang: k + 1,
      date: ajouterMois(premiere, k),
      echeance: r2(mensualite),
      interets: r2(interets),
      capital: r2(amorti),
      assurance_initiale: r2(assInit),
      assurance_nouvelle: r2(nouvelle),
      total_actuel: r2(totalActuel),
      total_nouveau: r2(totalNouveau),
      differentiel: r2(totalNouveau - totalActuel),
    });
  }

  const somme = (f: (l: LigneEcheancier) => number) => r2(lignes.reduce((s, l) => s + f(l), 0));
  const totalDifferentiel = somme((l) => l.differentiel);
  const fraisTotaux = r2(
    (nb(e.frais_courtage) ?? 0) + (nb(e.frais_dossier) ?? 0) + (nb(e.frais_adhesion) ?? 0),
  );
  const economieBrute = r2(-totalDifferentiel);
  return {
    lignes,
    type_cotisation: e.type_cotisation ?? null,
    date_effet: situation.date_effet,
    total_assurance_initiale: somme((l) => l.assurance_initiale),
    total_assurance_nouvelle: somme((l) => l.assurance_nouvelle),
    total_differentiel: totalDifferentiel,
    economie_brute: economieBrute,
    frais_totaux: fraisTotaux,
    economie_nette: r2(economieBrute - fraisTotaux),
  };
}

/** Échéancier lu directement depuis le recueil des besoins du dossier. */
export function echeancierDepuisRecueil(
  recueil: Record<string, unknown> | null | undefined,
  nouvelle: { mensuelle: number | null; type_cotisation: "CI" | "CRD" | null },
  dossierCreeLe?: string | null,
  frais?: { courtage?: number | null; dossier?: number | null; adhesion?: number | null },
): EcheancierComparatif {
  const r = recueil ?? {};
  const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : null);
  // La cotisation lue sur l'offre de prêt prime ; à défaut, calcul par le taux
  // d'assurance de la banque appliqué au capital initial (contrat groupe).
  const capital = nb(r["capital"]);
  const tauxAss = nb(r["taux_assurance_banque"]);
  const assInit =
    nb(r["assurance_banque_mensuelle"]) ?? (capital !== null && tauxAss !== null ? (capital * tauxAss) / 100 / 12 : null);
  return echeancierComparatif({
    capital,
    taux_pret: Number(r["taux_pret"]),
    duree_mois: nb(r["duree_mois"]),
    date_premiere_echeance: s("date_premiere_echeance"),
    date_effet: s("date_effet"),
    dossier_cree_le: dossierCreeLe ?? null,
    assurance_initiale_mensuelle: assInit,
    assurance_nouvelle_mensuelle: nouvelle.mensuelle,
    type_cotisation: nouvelle.type_cotisation,
    frais_courtage: frais?.courtage ?? null,
    frais_dossier: frais?.dossier ?? null,
    frais_adhesion: frais?.adhesion ?? null,
  });
}
