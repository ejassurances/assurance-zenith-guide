/**
 * D8 — Pilotage & reporting : agrégation pure de la vision direction.
 *
 * Aucun accès base : les données sont fournies par les lectures existantes
 * (file OAV D4, portefeuille D5, synthèse commissions D6, délais D7) afin que
 * les chiffres affichés soient strictement les mêmes que sur les pages métier.
 */
import type { EtatFile, LigneFileSouscription } from "@/lib/souscription-file";
import type { AgregatsPortefeuille } from "@/lib/portefeuille-contrats";
import type { Gravite } from "@/lib/delais-pilotage";
import type { SyntheseAnnee } from "@/lib/commission-previsions";

export interface BlocProduction {
  /** Dossiers encore dans la file de souscription. */
  enFile: number;
  prets: number;
  bloques: number;
  transmis: number;
  /** Part des dossiers de la file prêts à transmettre (0-100). */
  tauxPrets: number;
}

export interface BlocPortefeuille {
  contrats: number;
  primeAnnuelle: number;
  echeancesProches: number;
  suivisDus: number;
  suivisNonPlanifies: number;
  aJour: number;
  /** Prime annuelle moyenne par contrat. */
  primeMoyenne: number;
}

export interface BlocFinance {
  annee: number;
  encaisse: number;
  previsionnelRestant: number;
  totalAttendu: number;
  /** Part déjà encaissée du total attendu (0-100). */
  tauxRealisation: number;
}

export interface BlocConformite {
  critique: number;
  alerte: number;
  vigilance: number;
  total: number;
}

export interface VisionDirection {
  production: BlocProduction;
  portefeuille: BlocPortefeuille;
  finance: BlocFinance;
  conformite: BlocConformite;
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Compteurs de production issus de la file OAV. */
export function blocProduction(lignes: LigneFileSouscription[]): BlocProduction {
  const par: Record<EtatFile, number> = { pret: 0, bloque: 0, transmis: 0 };
  for (const l of lignes) par[l.etat] += 1;
  return {
    enFile: lignes.length,
    prets: par.pret,
    bloques: par.bloque,
    transmis: par.transmis,
    tauxPrets: pct(par.pret, lignes.length),
  };
}

/** Compteurs de portefeuille issus des agrégats contrats. */
export function blocPortefeuille(a: AgregatsPortefeuille | null): BlocPortefeuille {
  if (!a) {
    return {
      contrats: 0,
      primeAnnuelle: 0,
      echeancesProches: 0,
      suivisDus: 0,
      suivisNonPlanifies: 0,
      aJour: 0,
      primeMoyenne: 0,
    };
  }
  return {
    contrats: a.total,
    primeAnnuelle: arrondi(a.prime_annuelle_totale),
    echeancesProches: a.par_etat.echeance_proche,
    suivisDus: a.par_etat.suivi_du,
    suivisNonPlanifies: a.par_etat.suivi_non_planifie,
    aJour: a.par_etat.a_jour,
    primeMoyenne: a.total > 0 ? arrondi(a.prime_annuelle_totale / a.total) : 0,
  };
}

/** Bloc finance dérivé de la synthèse annuelle des commissions. */
export function blocFinance(s: SyntheseAnnee | null, annee = new Date().getFullYear()): BlocFinance {
  if (!s) {
    return { annee, encaisse: 0, previsionnelRestant: 0, totalAttendu: 0, tauxRealisation: 0 };
  }
  return {
    annee: s.annee,
    encaisse: arrondi(s.encaisse),
    previsionnelRestant: arrondi(s.previsionnelRestant),
    totalAttendu: arrondi(s.totalAttendu),
    tauxRealisation: pct(s.encaisse, s.totalAttendu),
  };
}

/** Bloc conformité/délais dérivé des compteurs de gravité. */
export function blocConformite(compteurs: Record<Gravite, number> | null): BlocConformite {
  const c = compteurs ?? { critique: 0, alerte: 0, vigilance: 0 };
  return {
    critique: c.critique,
    alerte: c.alerte,
    vigilance: c.vigilance,
    total: c.critique + c.alerte + c.vigilance,
  };
}

/** Vision direction consolidée. */
export function visionDirection(entree: {
  file: LigneFileSouscription[];
  portefeuille: AgregatsPortefeuille | null;
  synthese: SyntheseAnnee | null;
  delais: Record<Gravite, number> | null;
}): VisionDirection {
  return {
    production: blocProduction(entree.file),
    portefeuille: blocPortefeuille(entree.portefeuille),
    finance: blocFinance(entree.synthese),
    conformite: blocConformite(entree.delais),
  };
}
