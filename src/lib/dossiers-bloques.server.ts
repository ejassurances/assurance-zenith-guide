/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Surveillance quotidienne des dossiers bloqués : un dossier actif dont le
 * statut n'a pas évolué depuis plus de 5 jours ouvrés déclenche une tâche
 * admin unique (aucun doublon si une tâche du même dossier est encore
 * ouverte). Les incohérences déjà rencontrées sont vérifiées explicitement :
 * lettre de mission « signée » sans PDF archivé, devoir de conseil bloqué
 * faute de grille validée.
 */

const JOURS_OUVRES_SEUIL = 5;

/** Statuts hors surveillance (dossier terminé ou abandonné). */
const STATUTS_INACTIFS = ["contrat_actif", "cloture", "perdu"];

/** Nombre de jours ouvrés (lundi-vendredi) entre deux instants. */
export function joursOuvresEcoules(depuis: Date, jusqua: Date = new Date()): number {
  if (jusqua <= depuis) return 0;
  let n = 0;
  const cur = new Date(Date.UTC(depuis.getUTCFullYear(), depuis.getUTCMonth(), depuis.getUTCDate()));
  const fin = new Date(Date.UTC(jusqua.getUTCFullYear(), jusqua.getUTCMonth(), jusqua.getUTCDate()));
  while (cur < fin) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const j = cur.getUTCDay();
    if (j !== 0 && j !== 6) n += 1;
  }
  return n;
}

/** Date du dernier changement de statut d'un dossier. */
async function dernierChangementStatut(
  admin: SupabaseClient<any, any, any>,
  dossier: any,
): Promise<Date> {
  const { data } = await admin
    .from("dossier_etapes_historique")
    .select("created_at, nouvelle_etape")
    .eq("dossier_id", dossier.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const hist = data as { created_at: string } | null;
  return new Date(hist?.created_at ?? dossier.updated_at ?? dossier.created_at);
}

/** Incohérences documentaires connues pour un dossier au statut avancé. */
async function incoherences(admin: SupabaseClient<any, any, any>, dossier: any): Promise<string[]> {
  const out: string[] = [];

  const { data: lettre } = await admin
    .from("lettres_mission")
    .select("statut, pdf_storage_path, archive_envoye_le, archive_reponse")
    .eq("dossier_id", dossier.id)
    .neq("statut", "annulee")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lm = lettre as any;
  if (lm?.statut === "signee" && (!lm.pdf_storage_path || !lm.archive_envoye_le)) {
    out.push(
      `Incohérence : lettre de mission marquée « signée » mais PDF archivé manquant${
        lm.archive_reponse ? ` (${String(lm.archive_reponse).slice(0, 200)})` : ""
      }.`,
    );
  }

  const { data: devoir } = await admin
    .from("devoirs_conseil")
    .select("statut, pdf_path, envoye_le")
    .eq("dossier_id", dossier.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const dc = devoir as any;
  if (dc && ["signe", "refuse"].includes(dc.statut) && !dc.pdf_path) {
    out.push("Incohérence : devoir de conseil clôturé sans PDF archivé.");
  }

  if (dossier.statut === "dda_validee" || dossier.statut === "devis_en_cours") {
    if (!dc) {
      const { count } = await admin
        .from("produit_garanties")
        .select("id", { count: "exact", head: true })
        .eq("produit_id", dossier.produit_id ?? "00000000-0000-0000-0000-000000000000")
        .eq("statut", "valide");

      if (!dossier.produit_id || !count) {
        out.push(
          "Incohérence : devoir de conseil impossible — aucune grille de garanties validée pour le produit du dossier.",
        );
      }
    }
  }

  return out;
}

export async function surveillerDossiersBloques(
  admin: SupabaseClient<any, any, any>,
  limite = 200,
): Promise<{ examines: number; signales: number; deja_signales: number }> {
  const { creerTacheAdmin } = await import("./agent-taches.server");
  const { etapeLabel } = await import("./pipeline-dossier");
  const { appUrl } = await import("./app-url");

  const { data, error } = await admin
    .from("dossiers")
    .select("id, reference, client_nom, client_id, statut, produit_id, created_at, updated_at")
    .not("statut", "in", `(${STATUTS_INACTIFS.join(",")})`)
    .order("updated_at", { ascending: true })
    .limit(limite);
  if (error) throw new Error(error.message);

  const maintenant = new Date();
  let signales = 0;
  let dejaSignales = 0;

  for (const d of ((data ?? []) as any[])) {
    const depuis = await dernierChangementStatut(admin, d);
    if (joursOuvresEcoules(depuis, maintenant) <= JOURS_OUVRES_SEUIL) continue;

    // Pas de doublon : une tâche du même dossier encore ouverte suffit.
    const titre = `Dossier bloqué depuis ${JOURS_OUVRES_SEUIL} jours — ${d.client_nom} — étape ${etapeLabel(d.statut)}`;
    const { data: existante } = await admin
      .from("taches")
      .select("id")
      .eq("titre", titre)
      .in("statut", ["a_faire", "en_cours"])
      .limit(1)
      .maybeSingle();
    if (existante) {
      dejaSignales += 1;
      continue;
    }

    const anomalies = await incoherences(admin, d);
    const lignes = [
      `Dossier ${d.reference} (${d.client_nom}) — statut inchangé depuis le ${depuis.toLocaleDateString("fr-FR")}.`,
      `Étape actuelle : ${etapeLabel(d.statut)}.`,
      `Lien direct : ${appUrl(`/espace/dossiers/${d.id}`)}`,
      ...anomalies,
    ];

    await creerTacheAdmin(admin, {
      titre,
      description: lignes.join("\n"),
      client_id: d.client_id ?? null,
      priorite: anomalies.length ? "urgente" : "haute",
    });
    signales += 1;
  }

  return { examines: (data ?? []).length, signales, deja_signales: dejaSignales };
}
