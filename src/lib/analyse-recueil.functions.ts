import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const input = z.object({ dossier_id: z.string().uuid() });

/** Analyse Gemini du recueil des besoins, lancée depuis la fiche dossier. */
export const analyserRecueil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { analyserRecueilDossier } = await import("./analyse-recueil.server");
    const res = await analyserRecueilDossier(context.supabase, data.dossier_id);
    return { ok: true as const, ...res };
  });

/**
 * Déclenchement automatique après complétion du recueil / signature de la
 * lettre de mission : ne bloque jamais le parcours si Gemini est indisponible.
 */
export const analyserRecueilAuto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const { analyserRecueilDossier } = await import("./analyse-recueil.server");
      const res = await analyserRecueilDossier(context.supabase, data.dossier_id);
      return { ok: true as const, statut: res.statut };
    } catch (e) {
      return {
        ok: false as const,
        raison: e instanceof Error ? e.message : "Analyse indisponible",
      };
    }
  });
