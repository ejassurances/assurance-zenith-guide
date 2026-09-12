/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Brouillons de réponse préparés par l'agent sur les cas AMBIGUS.
 * Statut `brouillon` : le job d'envoi ne les prend jamais (il ne lit que
 * `en_attente`). Ils ne partent qu'après validation humaine ici.
 */

async function exigerStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("mandataire")) {
    throw new Error("Accès réservé au cabinet.");
  }
}

export interface BrouillonReponse {
  id: string;
  destinataire: string;
  titre: string;
  paragraphes: string[];
  canal: string;
  motif: string;
  sujet_recu: string | null;
  gmail_message_id: string | null;
  created_at: string | null;
}

export const listerBrouillonsReponse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrouillonReponse[]> => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("emails_planifies")
      .select("id, destinataire, donnees, contexte, created_at")
      .eq("statut", "brouillon")
      .like("lot", "reponse-autonome-%")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      destinataire: (r.destinataire as string) ?? "",
      titre: (r.donnees?.titre as string) ?? "Réponse",
      paragraphes: Array.isArray(r.donnees?.paragraphes) ? (r.donnees.paragraphes as string[]) : [],
      canal: (r.contexte?.canal as string) ?? "client",
      motif: (r.contexte?.besoin_motif as string) ?? "Cas ambigu",
      sujet_recu: (r.contexte?.sujet_recu as string) ?? null,
      gmail_message_id: (r.contexte?.gmail_message_id as string) ?? null,
      created_at: (r.created_at as string) ?? null,
    }));
  });

/** Validation humaine : le brouillon rejoint la file d'envoi. */
export const validerBrouillonReponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { prochaineSortieAutorisee } = await import("@/lib/heures-ouverture");
    const { error } = await (supabaseAdmin as any)
      .from("emails_planifies")
      .update({
        statut: "en_attente",
        envoyer_le: prochaineSortieAutorisee(new Date()).toISOString(),
      })
      .eq("id", data.id)
      .eq("statut", "brouillon");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Abandon : aucun envoi, le brouillon est archivé annulé. */
export const rejeterBrouillonReponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("emails_planifies")
      .update({ statut: "annule", erreur: "Brouillon écarté par le cabinet" })
      .eq("id", data.id)
      .eq("statut", "brouillon");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
