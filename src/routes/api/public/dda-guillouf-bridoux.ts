import { createFileRoute } from "@tanstack/react-router";

/**
 * Régularisation DDA ponctuelle : génération et envoi du devoir de conseil des
 * dossiers emprunteur GUILLOUF / BRIDOUX (contrat CARDIF déjà en place).
 */
const DOSSIERS = ["3992eafd-eff8-480e-84da-e495259a078b", "81cfe711-1ad0-4d5d-972f-7a536e0762b5"];
const ADMIN = "f6d18a82-4f54-46b0-8785-6db7d8c90313";

export const Route = createFileRoute("/api/public/dda-guillouf-bridoux")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || null;
        if (!anon || request.headers.get("apikey") !== anon) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { genererDevoirConseilAuto } = await import("@/lib/devoir-conseil.server");
        const resultats: Record<string, unknown>[] = [];
        for (const id of DOSSIERS) {
          try {
            const r = await genererDevoirConseilAuto(supabaseAdmin, id, ADMIN);
            resultats.push({ dossier: id, ...r });
          } catch (e) {
            resultats.push({ dossier: id, erreur: e instanceof Error ? e.message : "erreur" });
          }
        }
        return Response.json({ ok: true, resultats });
      },
    },
  },
});
