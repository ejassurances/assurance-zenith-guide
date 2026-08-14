import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Déclenché après le dépôt d'une pièce d'identité (espace client ou CRM) :
 * lecture IA, complétion de la date de naissance et relance du contrôle
 * LCB-FT resté « en attente d'informations ». Sans effet dans les autres cas.
 */
export const traiterPieceIdentite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ kyc_document_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Accès : le document doit être visible par l'appelant (RLS staff ou client propriétaire).
    const { data: visible } = await context.supabase
      .from("client_kyc_documents")
      .select("id")
      .eq("id", data.kyc_document_id)
      .maybeSingle();
    if (!visible) throw new Error("Accès refusé");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { traiterPieceIdentiteEtRelancerLcb } = await import("./cni-extraction.server");
    return traiterPieceIdentiteEtRelancerLcb(supabaseAdmin, data.kyc_document_id);
  });
