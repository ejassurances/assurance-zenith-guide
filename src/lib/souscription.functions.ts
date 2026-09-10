import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const envoiSchema = z.object({
  dossier_id: z.string().uuid(),
  email: z.string().email().max(200).optional(),
  commentaire: z.string().max(2000).optional(),
  mode: z.enum(["api", "intranet"]).default("api"),
});

/** Prérequis de transmission compagnie (lecture seule). */
export const prerequisSouscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: dossier, error } = await context.supabase
      .from("dossiers")
      .select("id")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { prerequisSouscription } = await import("./souscription-prerequis.server");
    return prerequisSouscription(supabaseAdmin, data.dossier_id);
  });

/** Envoi du dossier de souscription à la compagnie (staff). */
export const envoyerSouscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => envoiSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Contrôle d'accès applicatif : le dossier doit être visible sous RLS.
    const { data: dossier, error } = await context.supabase
      .from("dossiers")
      .select("id")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { envoyerSouscriptionCompagnie } = await import("./souscription.server");
    return envoyerSouscriptionCompagnie(supabaseAdmin, data.dossier_id, context.userId, {
      email: data.email ?? null,
      commentaire: data.commentaire ?? null,
      mode: data.mode,
    });
  });


const retourSchema = z.object({
  dossier_id: z.string().uuid(),
  numero_contrat: z.string().max(120).optional(),
  commentaire: z.string().max(2000).optional(),
});

/** Enregistrement du retour de la compagnie : stoppe les relances automatiques. */
export const enregistrerRetourCompagnie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => retourSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dossier, error } = await supabase
      .from("dossiers")
      .select("id, statut")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");

    const { error: upErr } = await supabase
      .from("dossiers")
      .update({ statut: "contrat_valide", souscription_retour_le: new Date().toISOString() })
      .eq("id", data.dossier_id);
    if (upErr) throw new Error(upErr.message);

    await supabase.from("dossier_etapes_historique").insert({
      dossier_id: data.dossier_id,
      ancienne_etape: dossier.statut,
      nouvelle_etape: "contrat_valide",
      commentaire: [
        "Retour compagnie enregistré",
        data.numero_contrat ? `contrat n° ${data.numero_contrat}` : null,
        data.commentaire ?? null,
      ]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 1000),
      par: userId,
    });

    // Le contrat est confirmé : entrée immédiate au portefeuille.
    const { creerContratDepuisDossier } = await import("./contrat-depuis-dossier.server");
    const contrat = await creerContratDepuisDossier(supabase, data.dossier_id, userId, {
      numero: data.numero_contrat ?? null,
    });

    return {
      ok: true,
      contrat_id: contrat.contrat_id,
      // Un contrat par assuré du prêt : la référence assureur, le statut et la
      // commission prévisionnelle se suivent contrat par contrat.
      contrats_ids: contrat.contrats_ids,
      dda_a_regulariser: contrat.dda_a_regulariser,
    };
  });

/**
 * Création (ou reprise) des contrats individuels par assuré pour un dossier
 * emprunteur, déclenchée depuis l'étape « Analyse et décision ». Idempotent :
 * si les contrats existent déjà, ils sont simplement renvoyés.
 */
export const creerContratsAssuresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dossier, error } = await supabase
      .from("dossiers")
      .select("id")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");
    const { creerContratDepuisDossier } = await import("./contrat-depuis-dossier.server");
    const res = await creerContratDepuisDossier(supabase, data.dossier_id, userId);
    return {
      ok: true,
      contrats_ids: res.contrats_ids,
      deja_existant: res.deja_existant,
      dda_a_regulariser: res.dda_a_regulariser,
    };
  });

