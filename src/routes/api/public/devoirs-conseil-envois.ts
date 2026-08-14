import { createFileRoute } from "@tanstack/react-router";

/**
 * Job d'envoi automatique des devoirs de conseil VALIDÉS par le cabinet dont le
 * délai de réflexion (6 h après la signature de la lettre de mission) est
 * écoulé, pendant les horaires d'ouverture. Un devoir de conseil non validé
 * n'est jamais envoyé. Appelé toutes les 15 minutes par le planificateur avec
 * l'en-tête `apikey` (clé publiable du projet) ou `x-relance-token`.
 */
export const Route = createFileRoute("/api/public/devoirs-conseil-envois")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || null;
        const token = process.env["RELANCE_PIECES_TOKEN"];
        const ok =
          (!!anon && request.headers.get("apikey") === anon) ||
          (!!token && request.headers.get("x-relance-token") === token);
        if (!ok) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { envoyerDevoirsConseilValidesDus } = await import("@/lib/devoir-conseil.server");
        try {
          const res = await envoyerDevoirsConseilValidesDus(supabaseAdmin);
          return Response.json({ ok: true, ...res });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
