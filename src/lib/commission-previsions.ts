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

/** Contrat actif minimal nécessaire pour estimer une commission récurrente. */
export interface ContratPourPrevision {
  id: string;
  dossier_id: string | null;
  compagnie_id: string | null;
  is_emprunteur: boolean | null;
  statut: string | null;
  date_effet: string | null;
  duree_mois: number | null;
  prime_annuelle: number | null;
}

/** Commission déjà encaissée, utilisée pour déduire le rythme mensuel réel. */
export interface CommissionEncaissee {
  contrat_id: string | null;
  montant: number | null;
  date_versement: string | null;
  statut: string | null;
}

const STATUTS_CONTRAT_ACTIF = new Set(["actif", "contrat_actif"]);

function moisEcoules(dateEffet: string, aujourdhui: Date): number {
  const d = new Date(dateEffet);
  if (Number.isNaN(d.getTime())) return 0;
  const diff =
    (aujourdhui.getFullYear() - d.getFullYear()) * 12 + (aujourdhui.getMonth() - d.getMonth());
  return Math.max(0, diff);
}

/**
 * Prévisions déduites des contrats actifs qui n'ont pas encore de ligne dans
 * commission_previsions (contrats importés, ou validés avant la mise en place
 * du module). Le mensuel retenu est la moyenne des commissions réellement
 * encaissées sur le contrat ; à défaut, 5 % de la cotisation mensuelle.
 */
export function previsionsSynthetiques(
  contrats: ContratPourPrevision[],
  commissions: CommissionEncaissee[],
  previsionsExistantes: CommissionPrevision[],
  aujourdhui = new Date(),
): CommissionPrevision[] {
  const dejaCouverts = new Set(
    previsionsExistantes.map((p) => p.contrat_id).filter((id): id is string => Boolean(id)),
  );

  const parContrat = new Map<string, { total: number; mois: Set<string> }>();
  for (const c of commissions) {
    if (!c.contrat_id || c.statut !== "versee") continue;
    const cle = (c.date_versement ?? "").slice(0, 7);
    const agg = parContrat.get(c.contrat_id) ?? { total: 0, mois: new Set<string>() };
    agg.total += Number(c.montant ?? 0);
    if (cle) agg.mois.add(cle);
    parContrat.set(c.contrat_id, agg);
  }

  const out: CommissionPrevision[] = [];
  for (const ct of contrats) {
    if (dejaCouverts.has(ct.id)) continue;
    if (!STATUTS_CONTRAT_ACTIF.has(ct.statut ?? "")) continue;

    const hist = parContrat.get(ct.id);
    const mensuel =
      hist && hist.mois.size > 0
        ? hist.total / hist.mois.size
        : ct.prime_annuelle != null
          ? (Number(ct.prime_annuelle) / 12) * 0.05
          : null;
    if (mensuel == null || mensuel <= 0) continue;

    const duree = ct.duree_mois != null ? Number(ct.duree_mois) : null;
    const restants =
      duree != null && ct.date_effet
        ? Math.max(0, duree - moisEcoules(ct.date_effet, aujourdhui))
        : duree;
    if (restants == null || restants <= 0) continue;

    out.push({
      id: `synth-${ct.id}`,
      dossier_id: ct.dossier_id ?? "",
      contrat_id: ct.id,
      branche: ct.is_emprunteur ? "emprunteur" : null,
      compagnie_id: ct.compagnie_id,
      montant_mensuel_estime: Math.round(mensuel * 100) / 100,
      mois_restants_initial: restants,
      date_estimation: null,
      montant_mensuel_reel: null,
      mois_restants_actuels: restants,
      montant_previsionnel_total: totalPrevisionnel(mensuel, restants),
      statut: "estimee",
    });
  }
  return out;
}


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
