import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions UGIP Assurances (WS Tarification Emprunteur).
 * Les secrets restent côté serveur : rien n'atteint le navigateur.
 */

async function assertStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.some((r) => r === "admin" || r === "mandataire")) {
    throw new Error("Accès réservé au cabinet");
  }
  return roles;
}

/** État de configuration des secrets UGIP (aucune valeur de secret renvoyée). */
export const ugipStatut = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { ugipConfigStatus } = await import("./ugip/config");
    const { ugipProduitsStandards } = await import("./ugip/referentiels");
    return {
      ...ugipConfigStatus(),
      produits: ugipProduitsStandards().map((p) => ({ id: p.id, nom: p.nom, base: p.base })),
    };
  });

/** Tarifie un dossier emprunteur auprès d'UGIP et crée les devis comparés. */
export const ugipTariferDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dossier_id: z.string().uuid(),
        date_effet: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        produit_ids: z.array(z.string().max(4)).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { tariferDossierUgip } = await import("./ugip/tarification.server");
    const res = await tariferDossierUgip(
      context.supabase,
      {
        dossierId: data.dossier_id,
        dateEffet: data.date_effet,
        produitIds: data.produit_ids,
      },
      context.userId,
    );
    return { ok: true as const, ...res };
  });
