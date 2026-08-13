import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function exigerAdmin(supabase: { from: (t: string) => any }, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.includes("admin")) throw new Error("Accès réservé à l'administrateur.");
}

const contenuSchema = z.object({
  version: z.string().max(40),
  genere_le: z.string().max(40),
  cabinet: z.object({
    nom: z.string().max(160),
    orias: z.string().max(40),
    siret: z.string().max(40),
    adresse: z.string().max(200),
    telephone: z.string().max(40),
    email: z.string().max(160),
  }),
  mentions: z.record(z.string(), z.string().max(4000)),
  partenaires: z
    .array(z.object({ compagnie: z.string().max(160), produits: z.array(z.string().max(200)) }))
    .max(200),
});

/** Génère un nouveau brouillon de DER depuis l'état actuel des partenaires actifs. */
export const regenererBrouillonDer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { regenererBrouillonDerModele } = await import("@/lib/der-modele.server");
    return regenererBrouillonDerModele(supabaseAdmin, context.userId);
  });

/** Enregistre une édition légère du brouillon et régénère son PDF. */
export const enregistrerBrouillonDer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), contenu: contenuSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enregistrerBrouillonDerModele } = await import("@/lib/der-modele.server");
    return enregistrerBrouillonDerModele(supabaseAdmin, {
      id: data.id,
      contenu: data.contenu as never,
      userId: context.userId,
    });
  });

/** Validation humaine obligatoire : active le brouillon et archive l'ancienne version. */
export const validerEtActiverDer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { validerEtActiverDerModele } = await import("@/lib/der-modele.server");
    return validerEtActiverDerModele(supabaseAdmin, { id: data.id, userId: context.userId });
  });
