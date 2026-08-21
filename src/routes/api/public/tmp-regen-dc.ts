import { createFileRoute } from "@tanstack/react-router";

/** Route temporaire de régularisation : régénère un devoir de conseil sans envoi. */
export const Route = createFileRoute("/api/public/tmp-regen-dc")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const dossierId = url.searchParams.get("dossier");
        const userId = url.searchParams.get("user");
        if (!dossierId || !userId) return new Response("dossier & user requis", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { genererDevoirConseilAuto } = await import("@/lib/devoir-conseil.server");
        try {
          const res = await genererDevoirConseilAuto(supabaseAdmin, dossierId, userId, {
            sansEnvoi: true,
          });
          return Response.json({ ok: true, res });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
