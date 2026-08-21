import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* Registres réglementaires : gel des avoirs, registre RGPD, registre DORA, export FEC. */

const gelSchema = z.object({
  client_id: z.string().uuid(),
  resultat: z.enum(["aucune_correspondance", "correspondance_a_analyser", "correspondance_confirmee"]),
  observations: z.string().max(2000).optional(),
});

export const enregistrerControleGelAvoirs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => gelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { enregistrerGelAvoirs } = await import("./conformite-registres.server");
    return enregistrerGelAvoirs(context.supabase as never, {
      ...data,
      observations: data.observations ?? null,
      user_id: context.userId,
    });
  });

export const exporterRegistreRgpdPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { exporterRegistreRgpd } = await import("./conformite-registres.server");
    return exporterRegistreRgpd(context.supabase as never, context.userId);
  });

export const exporterRegistreDoraPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { exporterRegistreDora } = await import("./conformite-registres.server");
    return exporterRegistreDora(context.supabase as never, context.userId);
  });

const fecSchema = z.object({
  date_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const exporterFec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fecSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { genererFec } = await import("./conformite-registres.server");
    return genererFec(context.supabase as never, data, context.userId);
  });
