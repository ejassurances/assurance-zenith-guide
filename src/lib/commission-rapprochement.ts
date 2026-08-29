/**
 * Rapprochement « commissions attendues vs commissions reçues ».
 *
 * Logique pure (aucun accès base) : on compare, pour un mois donné, le
 * prévisionnel de chaque contrat (table `commission_previsions`) avec ce qui a
 * réellement été enregistré (table `commissions`, hors annulées).
 *
 * Aucune écriture, aucune décision automatique : l'objectif est de faire
 * remonter à l'humain les commissions manquantes ou d'un montant inattendu.
 */

import { periodiciteDe, reductionValide, type Periodicite } from "@/lib/commission-previsions";

export type EcartCategorie = "manquante" | "sous_percue" | "sur_percue" | "conforme";

export interface PrevisionRapprochement {
  contrat_id: string;
  branche: string | null;
  montant_mensuel_estime: number | null;
  montant_mensuel_reel: number | null;
  periodicite: string | null;
  reduction_courtage_pct: number | null;
  statut: string;
}

export interface CommissionRecue {
  contrat_id: string | null;
  montant: number | null;
  statut: string;
  date_versement: string | null;
}

export interface ContratRapprochement {
  id: string;
  numero: string | null;
  assureur: string | null;
  produit: string | null;
  statut: string | null;
  date_effet: string | null;
  client_nom?: string | null;
}

export interface LigneRapprochement {
  contrat_id: string;
  libelle: string;
  assureur: string | null;
  attendu: number;
  recu: number;
  ecart: number;
  categorie: EcartCategorie;
  periodicite: Periodicite;
}

/** Tolérance d'arrondi : en dessous, l'écart est considéré comme conforme. */
export const TOLERANCE_EUROS = 1;

/** Mois au format AAAA-MM. */
export function moisDe(date: string | null | undefined): string | null {
  if (!date || date.length < 7) return null;
  return date.slice(0, 7);
}

/** Montant mensuel attendu d'une prévision (réel s'il existe, sinon estimé). */
export function montantAttenduMensuel(p: PrevisionRapprochement): number {
  const base = Number(p.montant_mensuel_reel ?? p.montant_mensuel_estime ?? 0);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const reduction = reductionValide(p.reduction_courtage_pct);
  return Math.round(base * (1 - reduction / 100) * 100) / 100;
}

/**
 * Une commission annuelle n'est attendue que sur le mois anniversaire de la
 * date d'effet du contrat ; une mensuelle est attendue chaque mois.
 */
export function attendueCeMois(
  p: PrevisionRapprochement,
  contrat: ContratRapprochement | undefined,
  mois: string,
): boolean {
  if (periodiciteDe(p.periodicite) !== "annuelle") return true;
  const effet = contrat?.date_effet;
  if (!effet || effet.length < 7) return false;
  return effet.slice(5, 7) === mois.slice(5, 7);
}

function categoriser(attendu: number, recu: number): EcartCategorie {
  if (recu <= 0 && attendu > 0) return "manquante";
  const ecart = recu - attendu;
  if (Math.abs(ecart) <= TOLERANCE_EUROS) return "conforme";
  return ecart < 0 ? "sous_percue" : "sur_percue";
}

/**
 * Construit le rapprochement d'un mois (AAAA-MM). Les prévisions sans contrat
 * rattaché sont ignorées : sans contrat, aucune comparaison fiable n'est
 * possible.
 */
export function rapprocherMois(params: {
  mois: string;
  previsions: PrevisionRapprochement[];
  commissions: CommissionRecue[];
  contrats: ContratRapprochement[];
}): LigneRapprochement[] {
  const { mois, previsions, commissions, contrats } = params;
  const parContrat = new Map(contrats.map((c) => [c.id, c]));

  const recuParContrat = new Map<string, number>();
  for (const c of commissions) {
    if (!c.contrat_id || c.statut === "annulee") continue;
    if (moisDe(c.date_versement) !== mois) continue;
    recuParContrat.set(c.contrat_id, (recuParContrat.get(c.contrat_id) ?? 0) + Number(c.montant ?? 0));
  }

  const lignes: LigneRapprochement[] = [];
  const vus = new Set<string>();

  for (const p of previsions) {
    if (!p.contrat_id || vus.has(p.contrat_id)) continue;
    vus.add(p.contrat_id);
    const contrat = parContrat.get(p.contrat_id);
    const attendu = attendueCeMois(p, contrat, mois) ? montantAttenduMensuel(p) : 0;
    const recu = Math.round((recuParContrat.get(p.contrat_id) ?? 0) * 100) / 100;
    if (attendu <= 0 && recu <= 0) continue;
    lignes.push({
      contrat_id: p.contrat_id,
      libelle: [contrat?.client_nom, contrat?.numero ?? contrat?.produit ?? p.branche].filter(Boolean).join(" — ") || p.contrat_id,
      assureur: contrat?.assureur ?? null,
      attendu,
      recu,
      ecart: Math.round((recu - attendu) * 100) / 100,
      categorie: categoriser(attendu, recu),
      periodicite: periodiciteDe(p.periodicite),
    });
  }

  // Commissions reçues sur un contrat sans prévisionnel : à vérifier aussi.
  for (const [contratId, recu] of recuParContrat) {
    if (vus.has(contratId)) continue;
    const contrat = parContrat.get(contratId);
    lignes.push({
      contrat_id: contratId,
      libelle: [contrat?.client_nom, contrat?.numero ?? contrat?.produit].filter(Boolean).join(" — ") || contratId,
      assureur: contrat?.assureur ?? null,
      attendu: 0,
      recu: Math.round(recu * 100) / 100,
      ecart: Math.round(recu * 100) / 100,
      categorie: "sur_percue",
      periodicite: "mensuelle",
    });
  }

  const ordre: Record<EcartCategorie, number> = { manquante: 0, sous_percue: 1, sur_percue: 2, conforme: 3 };
  return lignes.sort((a, b) => ordre[a.categorie] - ordre[b.categorie] || Math.abs(b.ecart) - Math.abs(a.ecart));
}

/** Totaux d'un rapprochement, pour l'affichage en tête de tableau. */
export function totauxRapprochement(lignes: LigneRapprochement[]) {
  const somme = (f: (l: LigneRapprochement) => number) => Math.round(lignes.reduce((s, l) => s + f(l), 0) * 100) / 100;
  return {
    attendu: somme((l) => l.attendu),
    recu: somme((l) => l.recu),
    manquant: somme((l) => (l.categorie === "manquante" || l.categorie === "sous_percue" ? l.attendu - l.recu : 0)),
    nbManquantes: lignes.filter((l) => l.categorie === "manquante").length,
    nbEcarts: lignes.filter((l) => l.categorie === "sous_percue" || l.categorie === "sur_percue").length,
  };
}
