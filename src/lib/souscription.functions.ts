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


/** Canal de souscription réellement disponible (API partenaire ou hors API). */
export const canalSouscriptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { canalSouscription } = await import("./souscription-canal");

    const { data: dossier, error } = await supabase
      .from("dossiers")
      .select("id")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");

    const [{ data: classement }, { data: devis }, { count: neoliane }, { count: simulassur }] =
      await Promise.all([
        supabase
          .from("dossier_devis_classements")
          .select("devis_retenu_id")
          .eq("dossier_id", data.dossier_id)
          .not("devis_retenu_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("dossier_devis")
          .select("id, source, compagnie_id, produit_id, cotisation_mensuelle")
          .eq("dossier_id", data.dossier_id)
          .is("archive_le", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("neoliane_parcours")
          .select("id", { count: "exact", head: true })
          .eq("dossier_id", data.dossier_id),
        supabase
          .from("simulassur_dossiers")
          .select("id", { count: "exact", head: true })
          .eq("dossier_id", data.dossier_id),
      ]);

    const liste = devis ?? [];
    const retenu = classement?.devis_retenu_id
      ? liste.find((d) => d.id === classement.devis_retenu_id) ?? null
      : null;
    const sources = retenu ? [retenu.source] : liste.map((d) => d.source);
    const parcoursPartenaire = (neoliane ?? 0) > 0 || (simulassur ?? 0) > 0;

    return {
      canal: canalSouscription({ sources, parcoursPartenaire }),
      parcours_partenaire: parcoursPartenaire,
      devis_retenu: retenu
        ? {
            id: retenu.id,
            source: retenu.source,
            compagnie_id: retenu.compagnie_id,
            produit_id: retenu.produit_id,
            cotisation_mensuelle: retenu.cotisation_mensuelle,
          }
        : null,
      nb_devis: liste.length,
    };
  });

const horsApiSchema = z.object({
  dossier_id: z.string().uuid(),
  numero_contrat: z.string().min(1).max(120),
  date_effet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prime_annuelle: z.number().positive().max(1_000_000).optional(),
  mode_transmission: z.enum(["intranet", "email", "courrier", "agence"]),
  commentaire: z.string().max(2000).optional(),
});

/**
 * Souscription hors API : l'adhésion a été réalisée directement auprès de la
 * compagnie (extranet, email, courrier, agence). Les garde-fous de complétude
 * s'appliquent sans dérogation, puis le contrat entre au portefeuille.
 */
export const souscrireHorsApiFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => horsApiSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dossier, error } = await supabase
      .from("dossiers")
      .select("id, statut")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { prerequisSouscription } = await import("./souscription-prerequis.server");
    const { messageBlocageSouscription } = await import("./souscription-prerequis");
    const prerequis = await prerequisSouscription(supabaseAdmin, data.dossier_id);
    if (!prerequis.autorise) throw new Error(messageBlocageSouscription(prerequis));

    const { labelModeHorsApi } = await import("./souscription-canal");
    const maintenant = new Date().toISOString();

    const { error: upErr } = await supabase
      .from("dossiers")
      .update({
        statut: "contrat_valide",
        souscription_envoyee_le: maintenant,
        souscription_retour_le: maintenant,
        souscription_relance_le: null,
        souscription_relances_nb: 0,
      })
      .eq("id", data.dossier_id);
    if (upErr) throw new Error(upErr.message);

    await supabase.from("dossier_etapes_historique").insert({
      dossier_id: data.dossier_id,
      ancienne_etape: dossier.statut,
      nouvelle_etape: "contrat_valide",
      commentaire: [
        `Souscription hors API — ${labelModeHorsApi(data.mode_transmission)}`,
        `contrat n° ${data.numero_contrat}`,
        `effet ${data.date_effet}`,
        data.commentaire ?? null,
      ]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 1000),
      par: userId,
    });

    const { creerContratDepuisDossier } = await import("./contrat-depuis-dossier.server");
    const contrat = await creerContratDepuisDossier(supabase, data.dossier_id, userId, {
      numero: data.numero_contrat,
      date_effet: data.date_effet,
    });

    // Prime saisie sur l'adhésion réelle : elle prime sur l'estimation du devis
    // lorsqu'un seul contrat est concerné (un seul assuré).
    if (data.prime_annuelle != null && contrat.contrats_ids.length === 1) {
      await supabase
        .from("contrats")
        .update({ prime_annuelle: data.prime_annuelle })
        .eq("id", contrat.contrats_ids[0]!);
    }

    return {
      ok: true,
      contrat_id: contrat.contrat_id,
      contrats_ids: contrat.contrats_ids,
      deja_existant: contrat.deja_existant,
      dda_a_regulariser: contrat.dda_a_regulariser,
    };
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

