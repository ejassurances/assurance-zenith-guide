/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * File d'attente de l'agent relation client : réponses niveau 2 préparées en
 * brouillon, validées / éditées / envoyées manuellement par le cabinet.
 */

async function exigerStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("mandataire")) throw new Error("Accès réservé au cabinet.");
}

const SELECT =
  "id, client_id, contrat_id, gmail_message_id, email_sujet, categorie, intention, confiance, resume, destinataire, objet, corps, statut, motif, created_at, envoye_le, clients(nom, prenom, email)";

/** Réponses en attente de validation (toutes, ou celles d'un client). */
export const reponsesEnAttente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ client_id: z.string().uuid().optional().nullable() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    let requete = (context.supabase as any)
      .from("client_reponses_ia")
      .select(SELECT)
      .eq("statut", "brouillon")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.client_id) requete = requete.eq("client_id", data.client_id);
    const { data: rows, error } = await requete;
    if (error) throw new Error(error.message);
    return { reponses: (rows ?? []) as any[] };
  });

/** Édition du brouillon (objet et corps) avant envoi. */
export const modifierReponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        objet: z.string().trim().min(1).max(300),
        corps: z.string().trim().min(1).max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("client_reponses_ia")
      .update({ objet: data.objet, corps: data.corps })
      .eq("id", data.id)
      .eq("statut", "brouillon");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envoi manuel du brouillon validé par le cabinet. */
export const envoyerReponseValidee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { data: row, error } = await (context.supabase as any)
      .from("client_reponses_ia")
      .select("id, client_id, destinataire, objet, corps, statut, gmail_message_id, clients(nom, prenom, email)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const r = row as any;
    if (!r || r.statut !== "brouillon") throw new Error("Cette réponse n'est plus en brouillon.");
    const destinataire: string | null = r.destinataire ?? r.clients?.email ?? null;
    if (!destinataire) throw new Error("Aucune adresse email sur la fiche client.");

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const paragraphes = String(r.corps ?? "")
      .split(/\n{2,}/)
      .map((p: string) => p.trim())
      .filter(Boolean);
    await sendTemplateEmail("relation-client-reponse", destinataire, {
      templateData: {
        clientName: [r.clients?.prenom, r.clients?.nom].filter(Boolean).join(" "),
        titre: r.objet ?? "Votre demande",
        paragraphes,
      },
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("client_reponses_ia")
      .update({ statut: "envoye", envoye_le: new Date().toISOString(), envoye_par: context.userId })
      .eq("id", r.id);
    await (supabaseAdmin as any).from("activites").insert({
      client_id: r.client_id,
      type: "email",
      titre: "Réponse validée par le cabinet et envoyée au client",
      contenu: `Objet : ${r.objet ?? ""}\n\n${r.corps ?? ""}`,
      created_by: context.userId,
    });
    return { ok: true };
  });

/** Abandon du brouillon (traité autrement). */
export const abandonnerReponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { error } = await (context.supabase as any)
      .from("client_reponses_ia")
      .update({ statut: "abandonne" })
      .eq("id", data.id)
      .eq("statut", "brouillon");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
