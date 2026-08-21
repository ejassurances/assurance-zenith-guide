import { createFileRoute } from "@tanstack/react-router";

/** Route temporaire : lance l'extraction IA des garanties (proposition, jamais validée). */
export const Route = createFileRoute("/api/public/tmp-extract-garanties")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ids = (url.searchParams.get("docs") ?? "").split(",").filter(Boolean);
        const userId = url.searchParams.get("user");
        if (ids.length === 0 || !userId) return new Response("docs & user requis", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { analyserDocumentsProduit } = await import("@/lib/produit-garanties-extraction.server");
        try {
          const res = await analyserDocumentsProduit(supabaseAdmin, ids, userId);
          const couv: Record<string, number> = {};
          for (const v of Object.values(res.valeurs)) {
            couv[v.couverture] = (couv[v.couverture] ?? 0) + 1;
          }
          return Response.json({
            ok: true,
            proposition_id: res.proposition_id,
            modele: res.modele,
            porteur: res.porteur,
            couvertures: couv,
            avertissements: res.avertissements?.slice(0, 1200) ?? null,
          });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
