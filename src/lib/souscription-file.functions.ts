/**
 * D4 — Server functions de la file de souscription (lecture seule).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** File de souscription « prêts / bloqués / transmis » (lecture seule). */
export const fileSouscriptionFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limite: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fileSouscription } = await import("./souscription-file.server");
    return fileSouscription(supabaseAdmin, data.limite ?? 100);
  });
