/**
 * LOT 2D — accès applicatif au moteur de complétude documentaire.
 * Les contrôles d'accès existants s'appliquent : la fonction `can_access_dossier`
 * est évaluée avec le client authentifié (RLS) avant tout calcul.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const entree = (input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input);

async function exigerAccesDossier(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  dossierId: string,
) {
  const { data } = await supabase.rpc("can_access_dossier", { _dossier_id: dossierId });
  if (data !== true) throw new Error("Accès au dossier refusé.");
}

/** Lecture de la complétude d'un dossier (aucune écriture). */
export const completudeDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entree)
  .handler(async ({ data, context }) => {
    await exigerAccesDossier(context.supabase as never, data.dossier_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { calculerCompletudeDossier } = await import("@/lib/completude-documentaire.server");
    return await calculerCompletudeDossier(supabaseAdmin, data.dossier_id);
  });

/** Recalcul + journalisation (idempotent) après validation d'une pièce. */
export const recalculerCompletudeDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entree)
  .handler(async ({ data, context }) => {
    await exigerAccesDossier(context.supabase as never, data.dossier_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recalculerCompletude } = await import("@/lib/completude-documentaire.server");
    const { resultat, journalise } = await recalculerCompletude(supabaseAdmin, data.dossier_id, {
      userId: context.userId,
    });
    return { resultat, journalise };
  });
