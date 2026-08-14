/**
 * Traitement automatique des demandes de modification du client — NIVEAU 1.
 *
 * Périmètre strictement borné (aucune décision hors de ce cadre) :
 *  - retenir un autre devis DÉJÀ présent dans dossier_devis pour ce dossier ;
 *  - réduire les frais de courtage du dossier de 15 % MAXIMUM.
 *
 * Tout le reste reste en niveau 2 : la recommandation est affichée au staff,
 * aucune action automatique. Après un traitement niveau 1, le devoir de conseil
 * est régénéré en BROUILLON : la revalidation humaine reste obligatoire avant
 * tout nouvel envoi au client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { totalPrevisionnel, reductionValide } from "@/lib/commission-previsions";

export const REDUCTION_COURTAGE_MAX_PCT = 15;

export type AnalyseNiveau1 = {
  id: string;
  dossier_id: string;
  motif_client: string | null;
  synthese: string | null;
  suggestion_contre_proposition: string | null;
  devis_alternatif_id: string | null;
  reduction_courtage_pct: number | null;
  niveau_justification: string | null;
};

/** Devis du dossier transmis à l'IA pour qualifier la demande. */
export async function devisDuDossier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
) {
  const { data } = await supabase
    .from("dossier_devis")
    .select("id, compagnie_id, produit_id, formule_id, cotisation_mensuelle, garanties_resume, source")
    .eq("dossier_id", dossierId);
  return (data ?? []) as {
    id: string;
    compagnie_id: string | null;
    produit_id: string | null;
    formule_id: string | null;
    cotisation_mensuelle: number | null;
    garanties_resume: string | null;
    source: string | null;
  }[];
}

async function journaliserActivite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
  contenu: string,
) {
  const { data } = await supabase.from("dossiers").select("client_id").eq("id", dossierId).maybeSingle();
  const clientId = (data as { client_id: string | null } | null)?.client_id ?? null;
  if (!clientId) return;
  await supabase.from("activites").insert({
    client_id: clientId,
    type: "systeme",
    titre: "Modification client traitée automatiquement (niveau 1)",
    contenu: contenu.slice(0, 4000),
  } as never);
}

/** Ajout d'une entrée dans recueil_besoins.historique_modifications du dossier. */
async function historiserModification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
  entree: Record<string, unknown>,
) {
  const { data } = await supabase
    .from("dossiers")
    .select("recueil_besoins")
    .eq("id", dossierId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recueil = ((data as any)?.recueil_besoins ?? {}) as Record<string, any>;

  const histo = Array.isArray(recueil["historique_modifications"])
    ? (recueil["historique_modifications"] as unknown[])
    : [];
  histo.push({ ...entree, le: new Date().toISOString() });
  await supabase
    .from("dossiers")
    .update({ recueil_besoins: { ...recueil, historique_modifications: histo } } as never)
    .eq("id", dossierId);
}

/** Renseigne la réduction de courtage sur la prévision de commission du dossier. */
async function appliquerReduction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
  pct: number,
) {
  const { data } = await supabase
    .from("commission_previsions")
    .select("id, montant_mensuel_estime, montant_mensuel_reel, mois_restants_actuels, mois_restants_initial")
    .eq("dossier_id", dossierId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = data as any;
  if (!p) return false;
  const brut = p.montant_mensuel_reel ?? p.montant_mensuel_estime;
  const mois = p.mois_restants_actuels ?? p.mois_restants_initial;
  const net = brut == null ? null : Number(brut) * (1 - pct / 100);
  await supabase
    .from("commission_previsions")
    .update({
      reduction_courtage_pct: pct,
      montant_previsionnel_total: totalPrevisionnel(net, mois ?? null),
    } as never)
    .eq("id", p.id);
  return true;
}

/**
 * Exécute une demande de modification qualifiée « niveau 1 » par l'IA.
 * Retourne le détail des actions réellement appliquées, ou null si la demande
 * ne rentre finalement pas dans le périmètre (elle reste alors en niveau 2).
 */
export async function executerModificationNiveau1(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  analyse: AnalyseNiveau1,
  userId: string | null,
) {
  const actions: string[] = [];
  const pct = reductionValide(analyse.reduction_courtage_pct);

  // Vérification du périmètre : le devis doit appartenir au dossier.
  let devisId: string | null = null;
  let devisCompagnieId: string | null = null;
  let devisProduitId: string | null = null;
  if (analyse.devis_alternatif_id) {
    const { data } = await supabase
      .from("dossier_devis")
      .select("id, dossier_id, compagnie_id, produit_id, garanties_resume, cotisation_mensuelle")
      .eq("id", analyse.devis_alternatif_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    if (!d || d.dossier_id !== analyse.dossier_id || !d.compagnie_id || !d.produit_id) return null;
    devisId = d.id as string;
    devisCompagnieId = d.compagnie_id as string;
    devisProduitId = d.produit_id as string;
  }

  if (!devisId && pct <= 0) return null;
  if (Number(analyse.reduction_courtage_pct ?? 0) > REDUCTION_COURTAGE_MAX_PCT) return null;

  await historiserModification(supabase, analyse.dossier_id, {
    source: "agent_commercial_niveau_1",
    demande_client: analyse.motif_client ?? null,
    analyse_ia: analyse.synthese ?? null,
    justification: analyse.niveau_justification ?? analyse.suggestion_contre_proposition ?? null,
    devis_retenu_id: devisId,
    reduction_courtage_pct: pct > 0 ? pct : null,
  });

  let devoirId: string | null = null;

  if (devisId) {
    const { data: cls } = await supabase
      .from("dossier_devis_classements")
      .select("id")
      .eq("dossier_id", analyse.dossier_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const classementId = (cls as { id: string } | null)?.id ?? null;
    const { retenirDevisDossier } = await import("./devis-classement.server");
    if (classementId) {
      const res = await retenirDevisDossier(
        supabase,
        classementId,
        devisId,
        userId ?? "00000000-0000-0000-0000-000000000000",
        { auto: true },
      );
      devoirId = res.devoir_id ?? null;
    }
    actions.push("devis alternatif retenu");
  }

  if (pct > 0) {
    const ok = await appliquerReduction(supabase, analyse.dossier_id, pct);
    if (ok) actions.push(`réduction des frais de courtage de ${pct} %`);
  }

  if (!devoirId) {
    // Régénération du devoir de conseil en BROUILLON (jamais validé automatiquement).
    const { genererDevoirConseilAuto } = await import("./devoir-conseil.server");
    const res = await genererDevoirConseilAuto(
      supabase,
      analyse.dossier_id,
      userId ?? "00000000-0000-0000-0000-000000000000",
      { sansEnvoi: true },
    );
    devoirId = (res as { id: string }).id;
  }
  actions.push("devoir de conseil régénéré en brouillon (revalidation staff requise)");

  const detail = [
    `Demande du client : ${analyse.motif_client ?? "non précisée"}`,
    `Analyse IA : ${analyse.synthese ?? "—"}`,
    `Justification niveau 1 : ${analyse.niveau_justification ?? "—"}`,
    `Actions : ${actions.join(" ; ")}`,
  ].join("\n");

  await journaliserActivite(supabase, analyse.dossier_id, detail);

  await supabase
    .from("devoir_conseil_refus_analyses")
    .update({
      statut: "suivie",
      execution_auto_le: new Date().toISOString(),
      execution_auto_detail: detail.slice(0, 4000),
      traite_le: new Date().toISOString(),
    } as never)
    .eq("id", analyse.id);

  return { devoir_id: devoirId, actions, detail };
}
