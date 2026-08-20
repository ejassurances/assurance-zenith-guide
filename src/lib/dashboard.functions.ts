import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  syntheseAnnee,
  previsionsSynthetiques,
  COLONNES_PREVISION,
  type SyntheseAnnee,
  type CommissionPrevision,
  type ContratPourPrevision,
  type CommissionEncaissee,
} from "@/lib/commission-previsions";


export type CaRealSummary = {
  anneeEnCours: number;
  anneePrecedente: number;
  evolutionPct: number | null;
  debutAnneeEnCours: string;
  finPeriodeN1: string;
};

/**
 * Retourne le CA réel (commissions versées) de l'année en cours,
 * le CA sur la période comparable N-1, et l'évolution en %.
 */
export const getCaRealEtN1 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CaRealSummary> => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startCurrent = `${currentYear}-01-01`;
    const endCurrent = now.toISOString().split("T")[0];

    const previousYear = currentYear - 1;
    const startPrevious = `${previousYear}-01-01`;
    const endPrevious = `${previousYear}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const [{ data: currentRows }, { data: previousRows }] = await Promise.all([
      context.supabase
        .from("commissions")
        .select("montant")
        .eq("statut", "versee")
        .gte("date_versement", startCurrent)
        .lte("date_versement", endCurrent),
      context.supabase
        .from("commissions")
        .select("montant")
        .eq("statut", "versee")
        .gte("date_versement", startPrevious)
        .lte("date_versement", endPrevious),
    ]);

    const sum = (rows: { montant: number | null }[] | null) =>
      (rows ?? []).reduce((acc, r) => acc + Number(r.montant ?? 0), 0);

    const anneeEnCours = sum(currentRows);
    const anneePrecedente = sum(previousRows);
    const evolutionPct = anneePrecedente > 0
      ? Number(((anneeEnCours - anneePrecedente) / anneePrecedente * 100).toFixed(1))
      : null;

    return {
      anneeEnCours,
      anneePrecedente,
      evolutionPct,
      debutAnneeEnCours: startCurrent,
      finPeriodeN1: endPrevious,
    };
  });

/**
 * Synthèse comptable de l'année civile en cours : commissions réellement
 * encaissées, prévisionnel restant à encaisser, et total attendu. Source
 * unique utilisée par le tableau de bord, la page Commissions et l'agent
 * comptabilité, afin que tous les écrans affichent les mêmes montants.
 */
export const getSyntheseAnneeCommissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyntheseAnnee> => {
    const [{ data }, { data: contrats }, { data: commissions }] = await Promise.all([
      context.supabase.from("commission_previsions").select(COLONNES_PREVISION),
      context.supabase
        .from("contrats")
        .select("id,dossier_id,compagnie_id,is_emprunteur,statut,date_effet,duree_mois,prime_annuelle,fractionnement"),
      context.supabase.from("commissions").select("contrat_id,montant,date_versement,statut"),
    ]);

    const previsions = (data as unknown as CommissionPrevision[]) ?? [];
    const encaissees = (commissions as unknown as CommissionEncaissee[]) ?? [];
    const toutes = [
      ...previsions,
      ...previsionsSynthetiques(
        (contrats as unknown as ContratPourPrevision[]) ?? [],
        encaissees,
        previsions,
      ),
    ];
    return syntheseAnnee(toutes, encaissees);
  });
