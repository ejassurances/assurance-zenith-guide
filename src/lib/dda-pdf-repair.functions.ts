import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Régénération / réparation des PDF DDA (lettres de mission et devoirs de
 * conseil) dont l'archivage a échoué silencieusement après signature.
 * Réservé aux administrateurs. Exécuté avec le client de service afin de
 * n'être jamais limité par les droits du signataire.
 */
export const reparerPdfDda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!admin) throw new Error("Réservé aux administrateurs");

    const { reparerPdfDdaManquants } = await import("./dda-pdf-repair.server");
    return await reparerPdfDdaManquants();
  });
