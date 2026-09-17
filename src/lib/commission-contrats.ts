/**
 * Commission prévisionnelle PAR CONTRAT D'ASSURÉ.
 *
 * Un dossier emprunteur porte un prêt unique, mais chaque personne assurée
 * donne lieu à son contrat auprès de la compagnie. La commission doit donc être
 * suivie contrat par contrat : un assuré peut être actif avant l'autre, avec sa
 * propre quotité et sa propre prime.
 *
 * Source UNIQUE du taux : le devis retenu (aucun second calcul).
 * Donnée strictement interne (dashboard + comptabilité).
 */
import { commissionDepuisDevis, type BaseCommission, type CommissionPrevue } from "@/lib/commission-devis";

export interface ContratAssure {
  id: string;
  quotite: number | null;
  /** Prime annuelle du contrat de cet assuré. */
  prime_annuelle: number | null;
  duree_mois: number | null;
}

export interface TauxRetenu {
  taux: number | null;
  base: BaseCommission;
}

export interface ContexteDossier {
  /** Économie réalisée sur l'ensemble du prêt (base « économie réalisée »). */
  economie: number | null;
  /** Échéances restantes du prêt, issues du recueil. */
  moisRestants: number | null;
}

export interface LignePrevisionContrat {
  contrat_id: string;
  prevu: CommissionPrevue;
}

/** Somme des quotités des assurés du prêt (base du prorata). */
export function totalQuotites(contrats: ContratAssure[]): number {
  return contrats.reduce((s, c) => s + (c.quotite != null ? Number(c.quotite) : 0), 0);
}

/**
 * Commission prévisionnelle de chaque contrat d'assuré d'un même prêt.
 * La prime du contrat de l'assuré est l'assiette ; l'économie du prêt est
 * répartie au prorata de la quotité de l'assuré.
 */
export function previsionsParContrat(
  contrats: ContratAssure[],
  taux: TauxRetenu | null,
  contexte: ContexteDossier,
): LignePrevisionContrat[] {
  if (!taux || taux.taux == null) return [];
  const total = totalQuotites(contrats);
  return contrats.map((c) => ({
    contrat_id: c.id,
    prevu: commissionDepuisDevis(
      { taux: taux.taux, base: taux.base },
      {
        cotisationMensuelle:
          c.prime_annuelle != null ? Math.round((Number(c.prime_annuelle) / 12) * 100) / 100 : null,
        economie: contexte.economie,
        moisRestants: contexte.moisRestants ?? c.duree_mois ?? null,
        quotitePct: c.quotite,
        totalQuotites: total > 0 ? total : null,
      },
    ),
  }));
}
