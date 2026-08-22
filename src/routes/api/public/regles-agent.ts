import { createFileRoute } from "@tanstack/react-router";

/**
 * Initialise (ou vérifie) les documents Drive de règles des agents IA :
 * `06_Regles_Agent/Regles_De_Ton/Regles_De_Ton.txt` et
 * `06_Regles_Agent/Regles_Non_Couvertes/Journal_Regles_Non_Couvertes.txt`.
 * Idempotent : les documents existants ne sont jamais réécrits.
 *
 * En-tête attendu : `x-relance-token` ou `apikey`.
 */
export const Route = createFileRoute("/api/public/regles-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["RELANCE_PIECES_TOKEN"];
        const apiKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const parToken = Boolean(token) && request.headers.get("x-relance-token") === token;
        const parApiKey = Boolean(apiKey) && request.headers.get("apikey") === apiKey;
        if (!parToken && !parApiKey) return new Response("Unauthorized", { status: 401 });

        try {
          const { assurerDocumentsRegles, chargerReglesDeTon, invaliderCacheRegles } = await import(
            "@/lib/regles-agent.server"
          );
          invaliderCacheRegles();
          const ids = await assurerDocumentsRegles();
          const regles = await chargerReglesDeTon();
          return Response.json({ ok: true, ...ids, regles_de_ton: regles });
        } catch (e) {
          const message = e instanceof Error ? e.message : "erreur inconnue";
          console.error("[regles-agent] initialisation impossible", e);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
