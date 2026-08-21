import { createFileRoute } from "@tanstack/react-router";

/** Route temporaire d'administration : ré-extraction des garanties après scission CI/CRD. */
export const Route = createFileRoute("/api/public/tmp-extract-garanties")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("cle") !== "scission-ci-crd-2026") {
          return new Response("forbidden", { status: 403 });
        }
        const produits = (url.searchParams.get("produits") ?? "").split(",").filter(Boolean);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { analyserDocumentsProduit } = await import("@/lib/produit-garanties-extraction.server");

        const out: unknown[] = [];
        for (const produitId of produits) {
          try {
            const { data: docs } = await supabaseAdmin
              .from("produit_documents")
              .select("id, type, nom")
              .eq("produit_id", produitId);
            const priorite = ["conditions_generales", "ipid", "tableau_garanties", "ccsf", "fiche_produit"];
            const choisis = (docs ?? [])
              .filter((d) => priorite.includes(d.type as string))
              .sort((a, b) => priorite.indexOf(a.type as string) - priorite.indexOf(b.type as string))
              .slice(0, 4);
            const res = await analyserDocumentsProduit(
              supabaseAdmin,
              choisis.map((d) => d.id as string),
              "00000000-0000-0000-0000-000000000000",
            );
            out.push({
              produitId,
              documents: choisis.map((d) => d.nom),
              proposition_id: res.proposition_id,
              porteur: res.porteur,
              avertissements: res.avertissements,
            });
          } catch (e) {
            out.push({ produitId, erreur: e instanceof Error ? e.message : String(e) });
          }
        }
        return Response.json(out);
      },
    },
  },
});
