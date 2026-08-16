import { createFileRoute } from "@tanstack/react-router";

/**
 * Tri automatique de la boîte Gmail du cabinet : rattachement des messages
 * (client / compagnie) puis exécution des agents IA (veille, finance,
 * commercial, relation client) avec étiquetage dans l'arborescence Gmail
 * existante du cabinet.
 *
 * Planifié toutes les 20 minutes en heures ouvrées ; le bouton « Scanner la
 * boîte » de l'onglet Emails reste disponible en complément.
 *
 * En-tête attendu : `x-relance-token: <RELANCE_PIECES_TOKEN>` ou
 * `apikey: <clé publiable>`.
 */
export const Route = createFileRoute("/api/public/scan-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["RELANCE_PIECES_TOKEN"];
        const apiKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const parToken = Boolean(token) && request.headers.get("x-relance-token") === token;
        const parApiKey = Boolean(apiKey) && request.headers.get("apikey") === apiKey;
        if (!parToken && !parApiKey) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Les écritures du CRM sont tracées au nom d'un administrateur.
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1);
        const userId = (admins ?? [])[0]?.user_id;
        if (!userId) return Response.json({ error: "Aucun administrateur configuré." }, { status: 500 });

        try {
          const { listerBoitePrincipale } = await import("@/lib/gmail.server");
          const { rattacherLot, executerAgents } = await import("@/lib/emails-agents.server");

          const { messages } = await listerBoitePrincipale({ maxResults: 25 });
          const ids = messages.map((m) => m.id);
          const rattachement = await rattacherLot(supabaseAdmin, { messages, userId });
          const agents = await executerAgents(supabaseAdmin, { messages, ids, userId });

          return Response.json({ ok: true, messages: messages.length, ...rattachement, ...agents });
        } catch (e) {
          const message = e instanceof Error ? e.message : "erreur inconnue";
          console.error("[scan-emails] échec du tri automatique", e);
          const { creerTacheAdmin } = await import("@/lib/agent-taches.server");
          await creerTacheAdmin(supabaseAdmin as never, {
            titre: "Tri automatique des emails en échec",
            description: [
              `Erreur : ${message}`,
              "",
              "Vérifier la connexion Gmail et les étiquettes du cabinet, puis relancer depuis l'onglet Emails.",
            ].join("\n"),
            priorite: "haute",
            created_by: userId,
          });
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
