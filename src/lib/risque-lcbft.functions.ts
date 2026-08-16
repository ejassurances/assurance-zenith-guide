import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function exigerAdmin(supabase: unknown, userId: string) {
  const { data: roles } = await (supabase as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const hasAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!hasAdmin) throw new Error("Accès réservé aux administrateurs.");
}

/** Liste les clients actifs n'ayant aucune ligne dans client_risque_lcbft. */
export const listerClientsRisqueNonEvalues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigerAdmin(context.supabase, context.userId);

    const { data: clients } = await context.supabase
      .from("clients")
      .select("id")
      .eq("statut", "actif")
      .order("nom", { ascending: true });

    const ids = (clients ?? []).map((c) => c.id);
    if (ids.length === 0) return { client_ids: [] };

    const { data: risques } = await context.supabase
      .from("client_risque_lcbft")
      .select("client_id")
      .in("client_id", ids);

    const evalues = new Set((risques ?? []).map((r) => r.client_id));
    return { client_ids: ids.filter((id) => !evalues.has(id)) };
  });

/** Évalue le risque LCB-FT d'un client donné (crée la ligne et la tâche si besoin). */
export const evaluerRisqueLcbftClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ client_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerAdmin(context.supabase, context.userId);

    const { evaluerRisqueLcbft } = await import("./risque-lcbft.server");
    const result = await evaluerRisqueLcbft(context.supabase, data.client_id);

    return {
      client_id: data.client_id,
      niveau_vigilance: result?.niveau_vigilance ?? null,
      score_risque: result?.score_risque ?? null,
    };
  });
