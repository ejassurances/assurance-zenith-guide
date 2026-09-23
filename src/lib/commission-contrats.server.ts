import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { previsionsParContrat, type ContratAssure, type TauxRetenu } from "@/lib/commission-contrats";
import { moisRestantsRecueil } from "@/lib/commission-previsions";
import { tauxEnFraction, type BaseCommission } from "@/lib/commission-devis";

type Client = SupabaseClient<Database>;

/** Taux du devis retenu au classement, sinon du dernier devis saisi du dossier. */
export async function tauxDevisRetenu(client: Client, dossierId: string): Promise<TauxRetenu | null> {
  const { data: classement } = await client
    .from("dossier_devis_classements")
    .select("devis_retenu_id")
    .eq("dossier_id", dossierId)
    .not("devis_retenu_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let devis: { taux_commission: number | null; commission_base: string | null } | null = null;
  if (classement?.devis_retenu_id) {
    const { data } = await client
      .from("dossier_devis")
      .select("taux_commission, commission_base")
      .eq("id", classement.devis_retenu_id)
      .maybeSingle();
    devis = data ?? null;
  }
  if (!devis || devis.taux_commission == null) {
    const { data } = await client
      .from("dossier_devis")
      .select("taux_commission, commission_base")
      .eq("dossier_id", dossierId)
      .not("taux_commission", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    devis = data ?? devis;
  }
  if (!devis || devis.taux_commission == null) return null;
  const base: BaseCommission = devis.commission_base === "economie_realisee" ? "economie_realisee" : "prime";
  return { taux: Number(devis.taux_commission), base };
}

export interface ResultatRecalculPrevisions {
  contrats: number;
  previsions_enregistrees: number;
  prevision_dossier_reprise: boolean;
  motif?: string;
}

/**
 * Recalcule et enregistre la commission prévisionnelle de CHAQUE contrat
 * d'assuré du dossier. Idempotent : ré-exécutable, met à jour la ligne
 * existante du contrat plutôt que d'en créer une seconde.
 *
 * Une éventuelle prévision enregistrée au niveau du dossier est supprimée dès
 * que les contrats individuels en portent une, pour éviter le double comptage.
 */
export async function recalculerPrevisionsParAssure(
  client: Client,
  dossierId: string,
): Promise<ResultatRecalculPrevisions> {
  const { data: dossier, error } = await client
    .from("dossiers")
    .select("id, type_assurance, compagnie_id, recueil_besoins, economie_estimee")
    .eq("id", dossierId)
    .maybeSingle();
  if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");

  const { data: contratsRows } = await client
    .from("contrats")
    .select("id, quotite, prime_annuelle, duree_mois")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });
  const contrats = (contratsRows ?? []) as ContratAssure[];
  if (contrats.length === 0) {
    return { contrats: 0, previsions_enregistrees: 0, prevision_dossier_reprise: false, motif: "aucun contrat individuel" };
  }

  const taux = await tauxDevisRetenu(client, dossierId);
  if (!taux) {
    return {
      contrats: contrats.length,
      previsions_enregistrees: 0,
      prevision_dossier_reprise: false,
      motif: "aucun taux de commission saisi sur un devis",
    };
  }

  const lignes = previsionsParContrat(contrats, taux, {
    economie: dossier.economie_estimee != null ? Number(dossier.economie_estimee) : null,
    moisRestants: moisRestantsRecueil(
      dossier.type_assurance ?? null,
      dossier.recueil_besoins as Record<string, unknown> | null,
    ),
  });

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const fraction = tauxEnFraction(taux.taux);
  let enregistrees = 0;

  for (const ligne of lignes) {
    if (ligne.prevu.mensuel == null) continue;
    const { data: existante } = await client
      .from("commission_previsions")
      .select("id, confirme_le, reduction_courtage_pct")
      .eq("contrat_id", ligne.contrat_id)
      .maybeSingle();
    // Un montant confirmé à la main (devoir de conseil) reste la référence :
    // le recalcul ne l'écrase jamais.
    if (existante && (existante as { confirme_le?: string | null }).confirme_le) continue;
    // Une réduction de courtage négociée est conservée et réappliquée.
    const reduction = Number((existante as { reduction_courtage_pct?: number | null } | null)?.reduction_courtage_pct ?? 0);
    const facteur = reduction > 0 && reduction < 100 ? 1 - reduction / 100 : 1;
    const arrondi = (n: number) => Math.round(n * 100) / 100;
    const valeurs = {
      dossier_id: dossierId,
      contrat_id: ligne.contrat_id,
      branche: dossier.type_assurance ?? null,
      compagnie_id: dossier.compagnie_id ?? null,
      montant_mensuel_estime: arrondi(ligne.prevu.mensuel * facteur),
      mois_restants_initial: ligne.prevu.mois,
      montant_previsionnel_total: ligne.prevu.total == null ? null : arrondi(ligne.prevu.total * facteur),
      date_estimation: aujourdhui,
      periodicite: "mensuelle",
      statut: "estime",
    };
    const { error: e } = existante
      ? await client.from("commission_previsions").update(valeurs as never).eq("id", existante.id)
      : await client.from("commission_previsions").insert(valeurs as never);
    if (e) throw new Error(e.message);
    // Le taux du devis reste la source unique, également porté par la fiche contrat.
    await client.from("contrats").update({ commission_cabinet_taux: fraction }).eq("id", ligne.contrat_id);
    enregistrees += 1;
  }

  let reprise = false;
  if (enregistrees > 0) {
    const { data: niveauDossier } = await client
      .from("commission_previsions")
      .select("id")
      .eq("dossier_id", dossierId)
      .is("contrat_id", null);
    for (const row of niveauDossier ?? []) {
      await client.from("commission_previsions").delete().eq("id", row.id);
      reprise = true;
    }
  }

  return { contrats: contrats.length, previsions_enregistrees: enregistrees, prevision_dossier_reprise: reprise };
}
