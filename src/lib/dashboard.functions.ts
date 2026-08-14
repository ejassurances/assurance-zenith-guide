import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { repartirTresorerie, type CommissionPrevision } from "@/lib/commission-previsions";

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
 * Retourne les commissions prévisionnelles de l'année civile en cours,
 * prorata temporis à partir de la table commission_previsions.
 */
export const getCommissionsEstimeesAnneeEnCours = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const { data } = await context.supabase
      .from("commission_previsions")
      .select(
        "id,dossier_id,contrat_id,branche,compagnie_id,montant_mensuel_estime,mois_restants_initial,date_estimation,montant_mensuel_reel,mois_restants_actuels,montant_previsionnel_total,statut",
      );

    const previsions = (data as unknown as CommissionPrevision[]) ?? [];
    const anneeEnCours = new Date().getFullYear();
    const lignes = repartirTresorerie(previsions);
    const ligneAnnee = lignes.find((l) => l.annee === anneeEnCours);
    return Math.round((ligneAnnee?.montant ?? 0) * 100) / 100;
  });
