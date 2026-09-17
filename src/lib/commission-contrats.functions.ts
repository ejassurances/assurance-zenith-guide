/**
 * Recalcul de la commission prévisionnelle par contrat d'assuré.
 * Réservé au personnel du cabinet (donnée interne).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const recalculerPrevisionsAssuresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as { userId: string; supabase: never };
    void userId;
    const { data: roles } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: { role: string }[] | null }> };
      };
    })
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const staff = (roles ?? []).some((r) => r.role === "admin" || r.role === "mandataire");
    if (!staff) throw new Error("Action réservée au cabinet");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recalculerPrevisionsParAssure } = await import("./commission-contrats.server");
    return recalculerPrevisionsParAssure(supabaseAdmin, data.dossier_id);
  });
