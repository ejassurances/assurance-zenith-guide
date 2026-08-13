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

/** Produit à tarif fixe : devis créé depuis la formule + options, puis devoir de conseil en brouillon (sans IA). */
export const creerDevisTarifFixeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dossier_id: z.string().uuid(),
        formule_id: z.string().uuid(),
        option_ids: z.array(z.string().uuid()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { creerDevisTarifFixe } = await import("./devis-classement.server");
    const res = await creerDevisTarifFixe(
      context.supabase,
      { dossierId: data.dossier_id, formuleId: data.formule_id, optionIds: data.option_ids },
      context.userId,
    );
    return { ok: true, ...res };
  });
