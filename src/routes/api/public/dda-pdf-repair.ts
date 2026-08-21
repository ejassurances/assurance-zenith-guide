import { createFileRoute } from "@tanstack/react-router";

/** Reprise ponctuelle des PDF DDA manquants (protégée par la clé publiable). */
export const Route = createFileRoute("/api/public/dda-pdf-repair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || null;
        if (!anon || request.headers.get("apikey") !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { reparerPdfDdaManquants } = await import("@/lib/dda-pdf-repair.server");
        try {
          return Response.json(await reparerPdfDdaManquants());
        } catch (e) {
          return Response.json({ error: e instanceof Error ? e.message : "erreur" }, { status: 500 });
        }
      },
    },
  },
});
