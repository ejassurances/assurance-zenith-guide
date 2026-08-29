import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions des études (emprunteur & épargne).
 * Réservées au personnel du cabinet ; aucune production de devoir de conseil.
 */

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.some((r) => r === "admin" || r === "mandataire")) {
    throw new Error("Accès réservé au cabinet");
  }
}

/** Exploite un document déposé manuellement (analyse IA puis étude / recueil). */
export const traiterDocumentDepose = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actions: string[] = [];
    try {
      const { classifierDocument } = await import("./classification-documentaire.server");
      const c = await classifierDocument(supabaseAdmin, data.document_id);
      actions.push(`classification : ${c.statut}`);
    } catch (e) {
      actions.push(`classification indisponible : ${e instanceof Error ? e.message : "erreur"}`);
    }
    try {
      const { extraireDocument } = await import("./extraction-documentaire.server");
      const x = await extraireDocument(supabaseAdmin, data.document_id);
      actions.push(`extraction : ${x.statut}`);
    } catch (e) {
      actions.push(`extraction indisponible : ${e instanceof Error ? e.message : "erreur"}`);
    }
    const { exploiterDocumentEtude } = await import("./etude-documents.server");
    const res = await exploiterDocumentEtude(supabaseAdmin, data.document_id, context.userId);
    return { ok: true as const, actions: [...actions, ...res.actions], erreurs: res.erreurs };
  });

/** Relance la production de l'étude épargne d'un dossier. */
export const lancerEtudeEpargne = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { produireEtudeEpargne } = await import("./etude-epargne.server");
    return await produireEtudeEpargne(supabaseAdmin, {
      dossierId: data.dossier_id,
      userId: context.userId,
    });
  });

/** Dernière étude épargne enregistrée pour un dossier. */
export const derniereEtudeEpargne = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: etude } = await context.supabase
      .from("etudes_epargne")
      .select(
        "id, statut, motif_indisponibilite, profil_risque, contrat_actuel, offre_cabinet, hypotheses, comparatif, created_at",
      )
      .eq("dossier_id", data.dossier_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { etude: etude ?? null };
  });
