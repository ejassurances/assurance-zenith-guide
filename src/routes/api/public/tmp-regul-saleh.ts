import { createFileRoute } from "@tanstack/react-router";

/**
 * Route temporaire de régularisation du dossier Naguy SALEH : extraction IA des
 * grilles de garanties des deux variantes Cardif Libertés (CI / CRD) puis
 * génération du devoir de conseil de chaque dossier (validé, sans envoi).
 */
const ADMIN = "f6d18a82-4f54-46b0-8785-6db7d8c90313";
const CIBLES = [
  { dossierId: "ad805ebb-417e-4cdd-86b6-23ba142073e8", produitId: "4eb01d51-5da2-4da9-9cd1-e449deecef47" },
  { dossierId: "3a520416-b6d3-4d99-892c-60aadc2d8492", produitId: "7ac73033-ad4e-42dd-93b4-a97d11e1fd9a" },
];

export const Route = createFileRoute("/api/public/tmp-regul-saleh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon =
          process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || null;
        if (!anon || request.headers.get("apikey") !== anon) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { analyserDocumentsProduit } = await import("@/lib/produit-garanties-extraction.server");
        const { genererDevoirConseilAuto } = await import("@/lib/devoir-conseil.server");

        const out: Record<string, unknown>[] = [];
        for (const cible of CIBLES) {
          const etape: Record<string, unknown> = { ...cible };
          const { data: docs } = await supabaseAdmin
            .from("produit_documents")
            .select("id, type")
            .eq("produit_id", cible.produitId);
          const ids = ((docs ?? []) as { id: string }[]).map((d) => d.id);
          try {
            etape["extraction"] = ids.length
              ? await analyserDocumentsProduit(supabaseAdmin, ids, ADMIN)
              : "aucun document";
          } catch (e) {
            etape["extraction_erreur"] = e instanceof Error ? e.message : "erreur";
          }
          try {
            etape["devoir_conseil"] = await genererDevoirConseilAuto(supabaseAdmin, cible.dossierId, ADMIN, {
              sansEnvoi: true,
            });
          } catch (e) {
            etape["devoir_conseil_erreur"] = e instanceof Error ? e.message : "erreur";
          }
          out.push(etape);
        }
        return Response.json({ ok: true, resultats: out });
      },
    },
  },
});
