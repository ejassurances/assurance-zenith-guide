import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP, getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const creerInput = z.object({ dossier_id: z.string().uuid() });

/** Envoi manuel de la lettre de mission depuis la fiche dossier. */
export const creerEtEnvoyerLettreMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => creerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { envoyerLettreMission } = await import("./lettres-mission.server");
    const origin = new URL(getRequest().url).origin;
    const res = await envoyerLettreMission(context.supabase, data.dossier_id, context.userId, origin);
    return { ok: true, id: res.id };
  });

/**
 * Déclenchement automatique après validation du recueil des besoins.
 * Ne lève pas d'erreur bloquante : le dossier reste créé même si l'envoi échoue.
 */
export const declencherLettreMissionAuto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => creerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dossier } = await supabase
      .from("dossiers")
      .select("client_email")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (!dossier?.client_email) {
      return { ok: false, raison: "Aucun email client : lettre de mission à envoyer manuellement." };
    }
    try {
      const { envoyerLettreMission } = await import("./lettres-mission.server");
      const origin = new URL(getRequest().url).origin;
      const res = await envoyerLettreMission(supabase, data.dossier_id, userId, origin);
      return { ok: true, id: res.id };
    } catch (e) {
      return { ok: false, raison: e instanceof Error ? e.message : "Erreur d'envoi" };
    }
  });

const signerInput = z.object({
  lettre_id: z.string().uuid(),
  signature_png: z.string().min(100).max(500_000),
});

export const signerLettreMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => signerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lettre, error } = await supabase
      .from("lettres_mission")
      .select("id, statut, dossier_id, client_id, clients:client_id(user_id)")
      .eq("id", data.lettre_id)
      .maybeSingle();
    if (error || !lettre) throw new Error("Lettre introuvable");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkedUser = (lettre as any).clients?.user_id;
    if (linkedUser !== userId) throw new Error("Non autorisé");
    if (lettre.statut === "signee") throw new Error("Lettre déjà signée");

    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? null;

    const { error: upErr } = await supabase
      .from("lettres_mission")
      .update({
        statut: "signee",
        signature_png: data.signature_png,
        signed_at: new Date().toISOString(),
        signed_ip: ip,
        signed_ua: ua,
      })
      .eq("id", data.lettre_id);
    if (upErr) throw new Error(upErr.message);

    // L'avancement du pipeline (dossier → « DDA validée », client → dda_statut
    // « validee ») et la ligne d'historique sont assurés par le trigger SQL
    // lettre_mission_avance_dossier : le client signataire n'a pas les droits
    // RLS pour modifier le dossier, l'update côté client échouait en silence.

    // PDF signé : archivage + transmission au webhook (Drive 02_Conformite_DDA)
    let archive: { path: string; webhook: string } | null = null;
    let archiveErreur: string | null = null;
    try {
      const { archiverLettreMissionSignee } = await import("./lettre-mission-archive.server");
      const res = await archiverLettreMissionSignee(supabase, data.lettre_id, userId);
      archive = { path: res.path, webhook: res.webhook };
    } catch (e) {
      archiveErreur = e instanceof Error ? e.message : "Erreur d'archivage";
      console.error("Archivage lettre de mission :", archiveErreur);
    }

    return { ok: true, archive, archive_erreur: archiveErreur };
  });
