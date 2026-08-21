import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const clientSchema = z.object({ client_id: z.string().uuid() });

/**
 * Assure l'existence de l'arborescence Drive du client (01_CLIENTS/CLI-…)
 * et renvoie le lien d'ouverture directe du dossier.
 */
export const ouvrirDossierDriveClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => clientSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assurerArborescenceClient } = await import("@/lib/drive-arborescence.server");
    const res = await assurerArborescenceClient(context.supabase as never, data.client_id);
    return res;
  });
