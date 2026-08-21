import { createFileRoute } from "@tanstack/react-router";

/**
 * Route de rattrapage : analyse Gemini du recueil des besoins de tous les
 * dossiers dont le recueil est complété (statut « DDA validée ») et qui n'ont
 * pas encore d'analyse. Les dossiers analysés passent en « devis en cours ».
 *
 * Appelée par le planificateur avec l'en-tête `apikey` (clé publiable du
 * projet) ou `x-relance-token`.
 */
export const Route = createFileRoute("/api/public/analyse-recueil")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["RELANCE_PIECES_TOKEN"];
        const anon =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || null;
        const parToken = !!token && request.headers.get("x-relance-token") === token;
        const parApiKey = !!anon && request.headers.get("apikey") === anon;
        if (!parToken && !parApiKey) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { analyserRecueilDossier } = await import("@/lib/analyse-recueil.server");

        const { data: dossiers, error } = await supabaseAdmin
          .from("dossiers")
          .select("id, reference")
          .in("statut", ["dda_validee", "en_cours"])
          .is("analyse_ia", null)
          .not("recueil_besoins", "is", null)
          .limit(25);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const details: { dossier: string; ok: boolean; statut?: string; erreur?: string }[] = [];
        for (const d of dossiers ?? []) {
          try {
            const res = await analyserRecueilDossier(supabaseAdmin, d.id);
            details.push({ dossier: d.reference, ok: true, statut: res.statut });
          } catch (e) {
            details.push({
              dossier: d.reference,
              ok: false,
              erreur: e instanceof Error ? e.message : "erreur inconnue",
            });
          }
        }

        return Response.json({ ok: true, traites: details.length, details });
      },
    },
  },
});
