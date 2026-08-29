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
 * Un délai fixe de 8 h après le DER s'applique : si le délai n'est pas écoulé
 * (ou hors horaires d'ouverture), l'envoi est différé et repris par le job
 * quotidien `/api/public/lettres-mission-envois`.
 * Ne lève pas d'erreur bloquante : le dossier reste créé même si l'envoi échoue.
 */
export const declencherLettreMissionAuto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => creerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dossier } = await supabase
      .from("dossiers")
      .select("client_email, client_id")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (!dossier?.client_email) {
      return { ok: false, raison: "Aucun email client : lettre de mission à envoyer manuellement." };
    }
    try {
      const { envoyerLettreMission, dateReferenceDer } = await import("./lettres-mission.server");
      const { etatDelaiLettreMission } = await import("./lettre-mission-delai");
      const derLe = await dateReferenceDer(supabase, dossier.client_id ?? null);
      const etat = etatDelaiLettreMission(derLe);
      if (!etat.autorise) {
        return { ok: false, differe: true, raison: etat.motif ?? "Envoi différé." };
      }
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

    // PDF signé : archivage + transmission au webhook (Drive 02_Conformite_DDA).
    // L'archivage s'exécute avec le client de service : le signataire n'a aucun
    // droit d'écriture sur le stockage ni sur la table documents, et un échec
    // laissait auparavant la lettre « signée » sans PDF (échec silencieux).
    let archive: { path: string; webhook: string } | null = null;
    let archiveErreur: string | null = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { archiverLettreMissionSignee } = await import("./lettre-mission-archive.server");
      const res = await archiverLettreMissionSignee(supabaseAdmin, data.lettre_id, userId);
      archive = { path: res.path, webhook: res.webhook };
    } catch (e) {
      archiveErreur = e instanceof Error ? e.message : "Erreur d'archivage";
      console.error("Archivage lettre de mission :", archiveErreur);
      // Trace persistante pour la reprise automatique nocturne.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("lettres_mission")
        .update({ archive_reponse: `échec archivage : ${archiveErreur}`.slice(0, 500) })
        .eq("id", data.lettre_id);
    }

    // ÉTUDE & TARIFICATION APRÈS SIGNATURE : la lettre de mission signée
    // autorise l'étude (épargne) ou la tarification (emprunteur). Le devoir de
    // conseil reste rédigé et validé par un humain (ACPR / DDA).
    let etude: { actions: string[]; erreurs: string[] } | null = null;
    if (lettre.dossier_id) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { lancerEtudeApresLettreMission } = await import("./etude-documents.server");
        const res = await lancerEtudeApresLettreMission(supabaseAdmin, lettre.dossier_id, userId);
        etude = { actions: res.actions, erreurs: res.erreurs };
      } catch (e) {
        console.error("Étude après lettre de mission :", e);
      }
    }

    return { ok: true, archive, archive_erreur: archiveErreur, etude };
  });
