/**
 * D5 — Server functions du portefeuille de contrats (lecture seule).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Portefeuille de contrats classé par état de suivi (lecture seule). */
export const portefeuilleContratsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limite: z.number().int().min(1).max(300).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { portefeuilleContrats } = await import("./portefeuille-contrats.server");
    return portefeuilleContrats(supabaseAdmin, data.limite ?? 300);
  });
