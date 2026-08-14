/**
 * Commissions prévisionnelles par dossier (flux grossiste).
 *
 * Estimation à la validation du devoir de conseil, puis actualisation à
 * réception d'un bordereau (trigger SQL sur la table commissions).
 */
import { calculerCommission, type RegleCommission } from "@/lib/commissions-bareme";

export interface CommissionPrevision {
  id: string;
  dossier_id: string;
  contrat_id: string | null;
  branche: string | null;
  compagnie_id: string | null;
  montant_mensuel_estime: number | null;
  mois_restants_initial: number | null;
  date_estimation: string | null;
  montant_mensuel_reel: number | null;
  mois_restants_actuels: number | null;
  montant_previsionnel_total: number | null;
  statut: string;
}

/** Montant mensuel estimé : règle du barème appliquée à la cotisation mensuelle. */
export function montantMensuelEstime(
  regle: RegleCommission,
  cotisationMensuelle: number | null,
): number | null {
  if (regle.type === "fixe") return Number(regle.montant_fixe ?? 0);
  if (cotisationMensuelle == null) return null;
  return calculerCommission({ ...regle, base_calcul: "prime" }, { prime: cotisationMensuelle });
}

/** Total prévisionnel : mensuel × mois restants (null si les mois sont inconnus). */
export function totalPrevisionnel(mensuel: number | null, moisRestants: number | null): number | null {
  if (mensuel == null || moisRestants == null) return null;
  return Math.round(mensuel * moisRestants * 100) / 100;
}

/** Mois restants saisis dans le recueil des besoins (branche emprunteur). */
export function moisRestantsRecueil(
  branche: string | null,
  recueil: Record<string, unknown> | null | undefined,
): number | null {
  if (branche !== "emprunteur" || !recueil) return null;
  const v = recueil["mois_restants"];
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export type LignePrevisionnelAnnee = { annee: number; montant: number };

/**
 * Répartition du prévisionnel sur les années à venir : chaque dossier verse son
 * montant mensuel (réel si connu, sinon estimé) jusqu'à épuisement de ses mois
 * restants, à compter du mois courant.
 */
export function repartirTresorerie(
  previsions: CommissionPrevision[],
  aujourdhui = new Date(),
): LignePrevisionnelAnnee[] {
  const parAnnee = new Map<number, number>();
  const anneeDebut = aujourdhui.getFullYear();
  const moisDebut = aujourdhui.getMonth(); // 0-11

  for (const p of previsions) {
    const mensuel = p.montant_mensuel_reel ?? p.montant_mensuel_estime;
    const mois = p.mois_restants_actuels ?? p.mois_restants_initial;
    if (mensuel == null || mois == null || mois <= 0) continue;
    for (let i = 0; i < mois; i++) {
      const annee = anneeDebut + Math.floor((moisDebut + i) / 12);
      parAnnee.set(annee, (parAnnee.get(annee) ?? 0) + Number(mensuel));
    }
  }

  return [...parAnnee.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([annee, montant]) => ({ annee, montant: Math.round(montant * 100) / 100 }));
}
