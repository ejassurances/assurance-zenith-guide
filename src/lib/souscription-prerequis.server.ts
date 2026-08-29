/**
 * D4 — Collecte des prérequis de transmission compagnie (lecture seule).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  evaluerPrerequisSouscription,
  type ResultatPrerequis,
} from "@/lib/souscription-prerequis";
import { calculerCompletudeDossier } from "@/lib/completude-documentaire.server";

type Admin = SupabaseClient<Database>;

/** Charge et évalue les prérequis d'un dossier. Aucune écriture. */
export async function prerequisSouscription(
  admin: Admin,
  dossierId: string,
): Promise<ResultatPrerequis> {
  const [{ data: dossier }, { data: devis }, { data: dc }, completude] = await Promise.all([
    admin.from("dossiers").select("id, recueil_besoins").eq("id", dossierId).maybeSingle(),
    admin.from("dossier_devis").select("id").eq("dossier_id", dossierId).is("archive_le", null),
    admin
      .from("devoirs_conseil")
      .select("id, signed_at, refuse_le, statut, created_at")
      .eq("dossier_id", dossierId)
      .is("archive_le", null)
      .order("created_at", { ascending: false }),
    calculerCompletudeDossier(admin, dossierId),
  ]);

  if (!dossier) throw new Error("Dossier introuvable");

  const dernier = (dc ?? [])[0] ?? null;
  const signe = (dc ?? []).find((d) => d.signed_at)?.signed_at ?? null;

  return evaluerPrerequisSouscription({
    recueil_besoins: dossier.recueil_besoins,
    devis_actifs: (devis ?? []).length,
    devoir_conseil_signe_le: signe,
    devoir_conseil_refuse: Boolean(dernier && !signe && dernier.refuse_le),
    pieces_manquantes: completude.manquantes.map((p) => p.libelle),
    pieces_a_qualifier: completude.a_qualifier.map((p) => p.libelle),
  });
}
