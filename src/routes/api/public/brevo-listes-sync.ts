import { createFileRoute } from "@tanstack/react-router";

/**
 * Création / vérification des listes de contacts Brevo (une par branche, plus
 * « Clients actifs », « Prospects », « Prescripteurs ») et synchronisation des
 * contacts depuis le CRM. À appeler 1×/jour avec l'en-tête `apikey`.
 */
export const Route = createFileRoute("/api/public/brevo-listes-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["RELANCE_PIECES_TOKEN"];
        const apiKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || null;
        const parToken = Boolean(token) && request.headers.get("x-relance-token") === token;
        const parApiKey = Boolean(apiKey) && request.headers.get("apikey") === apiKey;
        if (!parToken && !parApiKey) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { synchroniserListesBrevo } = await import("@/lib/brevo-listes.server");
        try {
          const res = await synchroniserListesBrevo(supabaseAdmin as never);
          return Response.json({ ok: true, ...res });
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
