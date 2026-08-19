import { createFileRoute } from "@tanstack/react-router";

/**
 * Correctif rétroactif : messages Gmail étiquetés « Gestion Commerciale » ou
 * « Service Client » alors qu'ils proviennent d'un domaine de compagnie /
 * partenaire connu. Les mauvaises étiquettes sont retirées, « Service
 * Partenaire » appliquée, et les brouillons de réponse client générés par
 * erreur sont supprimés.
 *
 * En-tête attendu : `x-relance-token: <RELANCE_PIECES_TOKEN>` ou
 * `apikey: <clé publiable>`.
 */
export const Route = createFileRoute("/api/public/corriger-labels-partenaires")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["RELANCE_PIECES_TOKEN"];
        const apiKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const parToken = Boolean(token) && request.headers.get("x-relance-token") === token;
        const parApiKey = Boolean(apiKey) && request.headers.get("apikey") === apiKey;
        if (!parToken && !parApiKey) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1);
        const userId = (admins ?? [])[0]?.user_id;
        if (!userId) return Response.json({ error: "Aucun administrateur configuré." }, { status: 500 });

        try {
          const { corrigerLabelsPartenaires } = await import("@/lib/partenaires-emails.server");
          const resultat = await corrigerLabelsPartenaires(supabaseAdmin, userId);
          return Response.json({ ok: true, ...resultat });
        } catch (e) {
          const message = e instanceof Error ? e.message : "erreur inconnue";
          console.error("[corriger-labels-partenaires]", e);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
