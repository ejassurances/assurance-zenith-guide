/**
 * Lecture IA d'un devis déposé sur un dossier : les données lues sont
 * PROPOSÉES au conseiller (aucune écriture), avec un rapprochement au catalogue
 * du cabinet limité à la branche du dossier.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const entree = (input: unknown) =>
  z
    .object({
      dossier_id: z.string().uuid(),
      document_id: z.string().uuid(),
    })
    .parse(input);

export const lireDevisImporte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entree)
  .handler(async ({ data, context }) => {
    const { data: acces } = await context.supabase.rpc("can_access_dossier", {
      _dossier_id: data.dossier_id,
    });
    if (acces !== true) throw new Error("Accès au dossier refusé.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lireDevisDocument, rapprocherCatalogue } = await import("@/lib/devis-import.server");

    const lu = await lireDevisDocument(supabaseAdmin, data.document_id);

    // Rapprochement catalogue : compagnies actives et produits de la branche.
    const { data: dossier } = await supabaseAdmin
      .from("dossiers")
      .select("type_assurance")
      .eq("id", data.dossier_id)
      .maybeSingle();
    const branche = (dossier as { type_assurance: string | null } | null)?.type_assurance ?? null;

    const [{ data: compagnies }, { data: produits }] = await Promise.all([
      supabaseAdmin.from("compagnies").select("id, nom"),
      supabaseAdmin.from("produits").select("id, nom, compagnie_id, famille_id"),
    ]);

    let produitsBranche = (produits ?? []) as { id: string; nom: string; compagnie_id: string | null; famille_id: string | null }[];
    if (branche) {
      const { data: familles } = await supabaseAdmin
        .from("produit_familles")
        .select("id, branche")
        .eq("branche", branche);
      const ids = new Set(((familles ?? []) as { id: string }[]).map((f) => f.id));
      if (ids.size > 0) produitsBranche = produitsBranche.filter((p) => p.famille_id && ids.has(p.famille_id));
    }

    const compagnieId = rapprocherCatalogue(lu.compagnie, (compagnies ?? []) as { id: string; nom: string }[]);
    let produitId = rapprocherCatalogue(lu.produit, produitsBranche);
    // Le produit doit rester cohérent avec la compagnie rapprochée.
    if (produitId && compagnieId) {
      const p = produitsBranche.find((x) => x.id === produitId);
      if (p && p.compagnie_id && p.compagnie_id !== compagnieId) produitId = null;
    }

    return { ...lu, compagnie_id: compagnieId, produit_id: produitId };
  });
