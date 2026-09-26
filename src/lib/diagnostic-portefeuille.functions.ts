/**
 * Server function du diagnostic portefeuille (lecture seule).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const diagnosticPortefeuilleFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { diagnosticPortefeuille } = await import("./diagnostic-portefeuille.server");
    return diagnosticPortefeuille(supabaseAdmin);
  });
