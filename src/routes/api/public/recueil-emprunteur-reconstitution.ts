import { createFileRoute } from "@tanstack/react-router";

/**
 * Reconstitution du recueil des dossiers emprunteur DÉJÀ EN COURS au format
 * actuel (un dossier = un prêt, avec le détail de chaque assuré du prêt).
 * Aucune valeur saisie n'est écrasée.
 *
 * Corps optionnel : { "dossier_id": "..." } pour un dossier ciblé.
 */
export const Route = createFileRoute("/api/public/recueil-emprunteur-reconstitution")({
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
        const { reconstituerRecueilEmprunteur, reconstituerRecueilsEmprunteurEnCours } = await import(
          "@/lib/recueil-emprunteur-normalisation.server"
        );

        let cible: string | null = null;
        try {
          const corps = (await request.json()) as { dossier_id?: unknown };
          if (typeof corps?.dossier_id === "string") cible = corps.dossier_id;
        } catch {
          // corps vide : traitement du lot
        }

        try {
          if (cible) {
            const res = await reconstituerRecueilEmprunteur(supabaseAdmin, cible);
            return Response.json({ ok: true, traites: 1, modifies: res.modifie ? 1 : 0, details: [res] });
          }
          return Response.json(await reconstituerRecueilsEmprunteurEnCours(supabaseAdmin));
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "erreur inconnue" },
            { status: 500 },
          );
        }
      },
    },
  },
});
