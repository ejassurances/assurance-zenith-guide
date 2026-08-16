import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({ client_id: z.string().uuid() });

/**
 * Resynchronise les listes Brevo d'un seul client (déclencheur applicatif).
 * Best-effort : ne remonte jamais d'erreur bloquante à l'appelant.
 */
export const synchroniserContactBrevoClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { synchroniserContactBrevo } = await import("@/lib/brevo-listes.server");
    try {
      return await synchroniserContactBrevo(supabaseAdmin as never, data.client_id);
    } catch (e) {
      console.error("[brevo-contact] synchro échouée", e);
      return { ok: false, raison: e instanceof Error ? e.message : "erreur" };
    }
  });
