/**
 * ANALYSE IA D'UN DOCUMENT DÉPOSÉ DANS LE RECUEIL DES BESOINS.
 *
 * Lorsqu'une offre de prêt ou un tableau d'amortissement est déposé depuis le
 * recueil, le document est classé puis extrait (chaîne documentaire existante)
 * et les données du prêt sont reportées dans le recueil des besoins afin que
 * les étapes suivantes soient déjà renseignées.
 *
 * Garde-fous : aucune valeur déjà saisie n'est écrasée, aucune donnée n'est
 * déduite, aucune étape réglementaire n'est franchie (ni lettre de mission ni
 * devoir de conseil : validation humaine).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const entree = (input: unknown) =>
  z
    .object({ dossier_id: z.string().uuid(), document_id: z.string().uuid() })
    .parse(input);

export const analyserDocumentRecueil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(entree)
  .handler(async ({ data, context }) => {
    const { data: acces } = await context.supabase.rpc("can_access_dossier", {
      _dossier_id: data.dossier_id,
    });
    if (acces !== true) throw new Error("Accès au dossier refusé.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { classifierDocument } = await import("@/lib/classification-documentaire.server");
    const { extraireDocument } = await import("@/lib/extraction-documentaire.server");
    const { prefillRecueilEmprunteur } = await import("@/lib/pret-prefill");

    await classifierDocument(supabaseAdmin, data.document_id);
    const extraction = await extraireDocument(supabaseAdmin, data.document_id);
    const donnees =
      (extraction as { donnees?: Record<string, unknown> | null }).donnees ?? null;

    const { data: dossierRow } = await supabaseAdmin
      .from("dossiers")
      .select("id, statut, type_assurance, recueil_besoins")
      .eq("id", data.dossier_id)
      .maybeSingle();
    const dossier = dossierRow as {
      statut: string;
      type_assurance: string | null;
      recueil_besoins: Record<string, unknown> | null;
    } | null;

    if (!dossier || dossier.type_assurance !== "emprunteur" || !donnees) {
      return {
        statut: extraction.statut,
        ajouts: [] as string[],
        manquants: [] as string[],
        recueil_json: dossier?.recueil_besoins ? JSON.stringify(dossier.recueil_besoins) : null,
      };
    }

    const { recueil, ajouts, manquants } = prefillRecueilEmprunteur(
      dossier.recueil_besoins,
      donnees,
    );

    if (ajouts.length > 0) {
      const { error } = await supabaseAdmin
        .from("dossiers")
        .update({ recueil_besoins: recueil as never })
        .eq("id", data.dossier_id);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("dossier_etapes_historique").insert({
        dossier_id: data.dossier_id,
        ancienne_etape: dossier.statut,
        nouvelle_etape: dossier.statut,
        commentaire:
          `Document analysé depuis le recueil : ${ajouts.join(", ")} reportés au recueil des besoins.`.slice(
            0,
            500,
          ),
        par: context.userId,
      } as never);
    }

    return { statut: extraction.statut, ajouts, manquants, recueil_json: JSON.stringify(recueil) };
  });
