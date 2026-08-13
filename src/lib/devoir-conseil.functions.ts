import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const saisieSchema = z.object({
  dossier_id: z.string().uuid(),
  recommandation: z.string().min(10).max(5000),
  motifs: z.string().min(10).max(5000),
  mises_en_garde: z.string().max(5000).optional(),
  compagnie: z.string().max(200).optional(),
  produit: z.string().max(200).optional(),
  cotisation_mensuelle: z.number().nullable().optional(),
  economie_estimee: z.number().nullable().optional(),
  garanties: z.string().max(5000).optional(),
  exigences_client: z.string().max(5000).optional(),
});

/** Génération native + envoi du devoir de conseil au client. */
export const envoyerDevoirConseilFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saisieSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { envoyerDevoirConseil } = await import("./devoir-conseil.server");
    const { dossier_id, ...saisie } = data;
    const res = await envoyerDevoirConseil(context.supabase, dossier_id, context.userId, saisie);
    return { ok: true, ...res };
  });

const signerSchema = z.object({
  devoir_id: z.string().uuid(),
  signature_png: z.string().min(100).max(500_000),
});

export const signerDevoirConseil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => signerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: devoir, error } = await supabase
      .from("devoirs_conseil")
      .select("id, statut, dossier_id, client_id, clients:client_id(user_id)")
      .eq("id", data.devoir_id)
      .maybeSingle();
    if (error || !devoir) throw new Error("Devoir de conseil introuvable");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((devoir as any).clients?.user_id !== userId) throw new Error("Non autorisé");
    if (devoir.statut === "signe") throw new Error("Document déjà signé");

    const { error: upErr } = await supabase
      .from("devoirs_conseil")
      .update({
        statut: "signe",
        signature_png: data.signature_png,
        signed_at: new Date().toISOString(),
        signed_ip: getRequestIP({ xForwardedFor: true }) ?? null,
        signed_ua: getRequestHeader("user-agent") ?? null,
      })
      .eq("id", data.devoir_id);
    if (upErr) throw new Error(upErr.message);

    await supabase.from("dossiers").update({ statut: "devoir_conseil_signe" }).eq("id", devoir.dossier_id);
    await supabase.from("dossier_etapes_historique").insert({
      dossier_id: devoir.dossier_id,
      nouvelle_etape: "devoir_conseil_signe",
      commentaire: "Devoir de conseil accepté et signé par le client",
      par: userId,
    });

    return { ok: true };
  });

const refuserSchema = z.object({
  devoir_id: z.string().uuid(),
  motif: z.string().min(3).max(2000),
});

export const refuserDevoirConseil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => refuserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: devoir, error } = await supabase
      .from("devoirs_conseil")
      .select("id, statut, dossier_id, clients:client_id(user_id)")
      .eq("id", data.devoir_id)
      .maybeSingle();
    if (error || !devoir) throw new Error("Devoir de conseil introuvable");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((devoir as any).clients?.user_id !== userId) throw new Error("Non autorisé");
    if (devoir.statut === "signe") throw new Error("Document déjà signé");

    const { error: upErr } = await supabase
      .from("devoirs_conseil")
      .update({
        statut: "refuse",
        refus_motif: data.motif,
        refuse_le: new Date().toISOString(),
        signed_ip: getRequestIP({ xForwardedFor: true }) ?? null,
        signed_ua: getRequestHeader("user-agent") ?? null,
      })
      .eq("id", data.devoir_id);
    if (upErr) throw new Error(upErr.message);

    await supabase.from("dossiers").update({ statut: "devoir_conseil_refuse" }).eq("id", devoir.dossier_id);
    await supabase.from("dossier_etapes_historique").insert({
      dossier_id: devoir.dossier_id,
      nouvelle_etape: "devoir_conseil_refuse",
      commentaire: `Refus du client : ${data.motif}`,
      par: userId,
    });

    return { ok: true };
  });

const etapeSchema = z.object({
  dossier_id: z.string().uuid(),
  etape: z.enum([
    "nouveau",
    "en_cours",
    "lettre_mission_envoyee",
    "dda_validee",
    "devis_en_cours",
    "devoir_conseil_envoye",
    "devoir_conseil_signe",
    "devoir_conseil_refuse",
    "souscription_envoyee",
    "contrat_valide",
    "contrat_actif",
    "cloture",
    "perdu",
  ]),
  commentaire: z.string().max(1000).optional(),
});

/** Changement d'étape du pipeline par le staff, avec traçabilité ACPR. */
export const changerEtapeDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => etapeSchema.parse(input))
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
      .update({ statut: data.etape })
      .eq("id", data.dossier_id);
    if (upErr) throw new Error(upErr.message);

    await supabase.from("dossier_etapes_historique").insert({
      dossier_id: data.dossier_id,
      ancienne_etape: dossier.statut,
      nouvelle_etape: data.etape,
      commentaire: data.commentaire ?? null,
      par: userId,
    });

    return { ok: true };
  });
