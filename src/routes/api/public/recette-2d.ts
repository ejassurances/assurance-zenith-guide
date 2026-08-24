import { createFileRoute } from "@tanstack/react-router";

/** Route temporaire de recette du Lot 2D — supprimée après la recette. */
export const Route = createFileRoute("/api/public/recette-2d")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const dossierId = url.searchParams.get("dossier_id") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { calculerCompletudeDossier, recalculerCompletude } = await import(
          "@/lib/completude-documentaire.server"
        );
        const a = await recalculerCompletude(supabaseAdmin, dossierId);
        const b = await recalculerCompletude(supabaseAdmin, dossierId);
        const c = await calculerCompletudeDossier(supabaseAdmin, dossierId);
        return Response.json({
          etat: c.etat,
          journalise_1: a.journalise,
          journalise_2: b.journalise,
          manquantes: c.manquantes.map((p) => p.code),
          a_qualifier: c.a_qualifier.map((p) => ({ code: p.code, motif: p.motif })),
          satisfaites: c.satisfaites.map((p) => p.code),
          optionnelles: c.optionnelles_non_recues.map((p) => p.code),
          doublons: c.doublons,
          prochaine_action: c.prochaine_action,
        });
      },
    },
  },
});
