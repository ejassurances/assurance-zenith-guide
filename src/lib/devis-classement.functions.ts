import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Classement IA des devis comparés d'un dossier (proposition, validation staff obligatoire). */
export const classerDevisDossierFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { classerDevisDossier } = await import("./devis-classement.server");
    const res = await classerDevisDossier(context.supabase, data.dossier_id, context.userId);
    return { ok: true, ...res };
  });

/** Le staff retient une offre : dossier mis à jour + devoir de conseil généré en brouillon. */
export const retenirDevisDossierFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ classement_id: z.string().uuid(), devis_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { retenirDevisDossier } = await import("./devis-classement.server");
    const res = await retenirDevisDossier(context.supabase, data.classement_id, data.devis_id, context.userId);
    return { ok: true, ...res };
  });
