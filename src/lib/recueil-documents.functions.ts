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
    .object({
      dossier_id: z.string().uuid(),
      /**
       * Document précis à analyser. Absent : tous les documents de prêt déjà
       * déposés sur le dossier sont (re)analysés.
       */
      document_id: z.string().uuid().optional(),
    })
    .parse(input);

/** Motifs de reconnaissance d'un document de prêt (même règle que l'UI). */
const MOTIF_PRET =
  /(offre[-_ ]?de[-_ ]?pret|offre[-_ ]?pret|amortissement|amort|echeancier|échéancier|pret[-_ ]?immo)/i;

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

    // Documents à analyser : celui déposé, sinon tous les documents de prêt.
    let ids: string[] = [];
    if (data.document_id) {
      ids = [data.document_id];
    } else {
      const { data: rows } = await supabaseAdmin
        .from("documents")
        .select("id, file_name, type_document, categorie")
        .eq("dossier_id", data.dossier_id)
        .order("created_at", { ascending: false });
      ids = ((rows ?? []) as { id: string; file_name: string | null; type_document: string | null; categorie: string | null }[])
        .filter(
          (d) =>
            MOTIF_PRET.test(d.type_document ?? "") ||
            MOTIF_PRET.test(d.categorie ?? "") ||
            MOTIF_PRET.test(d.file_name ?? ""),
        )
        .map((d) => d.id);
    }

    // Chaque document est isolé : un échec n'interrompt pas les suivants.
    let statut = "indisponible";
    const donneesCumul: Record<string, unknown> = {};
    for (const id of ids) {
      try {
        await classifierDocument(supabaseAdmin, id);
        const extraction = await extraireDocument(supabaseAdmin, id);
        statut = extraction.statut;
        const donnees =
          (extraction as { donnees?: Record<string, unknown> | null }).donnees ?? null;
        if (!donnees) continue;
        for (const [cle, valeur] of Object.entries(donnees)) {
          if (cle.startsWith("_")) continue;
          if (valeur === null || valeur === undefined || valeur === "") continue;
          if (donneesCumul[cle] === undefined) donneesCumul[cle] = valeur;
        }
      } catch {
        // Document illisible ou analyse indisponible : saisie manuelle.
      }
    }

    const { data: dossierRow } = await supabaseAdmin
      .from("dossiers")
      .select("id, statut, type_assurance, recueil_besoins, created_at")
      .eq("id", data.dossier_id)
      .maybeSingle();
    const dossier = dossierRow as {
      statut: string;
      type_assurance: string | null;
      recueil_besoins: Record<string, unknown> | null;
      created_at: string | null;
    } | null;

    if (!dossier || dossier.type_assurance !== "emprunteur" || Object.keys(donneesCumul).length === 0) {
      return {
        statut,
        ajouts: [] as string[],
        manquants: [] as string[],
        recueil_json: dossier?.recueil_besoins ? JSON.stringify(dossier.recueil_besoins) : null,
      };
    }

    const { recueil, ajouts, manquants } = prefillRecueilEmprunteur(
      dossier.recueil_besoins,
      donneesCumul,
      { dossier_cree_le: dossier.created_at },
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

    return { statut, ajouts, manquants, recueil_json: JSON.stringify(recueil) };
  });

