import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP, getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "node:crypto";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { SITE } from "@/lib/site";

const creerInput = z.object({ dossier_id: z.string().uuid() });

export const creerEtEnvoyerLettreMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => creerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: dossier, error: dErr } = await supabase
      .from("dossiers")
      .select("*")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (dErr || !dossier) throw new Error("Dossier introuvable ou accès refusé");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = dossier as any;
    if (!d.client_email) throw new Error("Le dossier n'a pas d'email client — renseignez-le d'abord.");

    // Snapshot du contenu de la lettre : identité + recueil
    const contenu = {
      cabinet: {
        nom: SITE.name,
        shortName: SITE.shortName,
        siret: SITE.siret,
        orias: SITE.orias,
        adresse: SITE.adresse,
        telephone: SITE.telephone,
        email: SITE.email,
      },
      client: {
        nom: d.client_nom,
        email: d.client_email,
        telephone: d.client_phone,
      },
      dossier: {
        reference: d.reference,
        type_assurance: d.type_assurance,
      },
      recueil_besoins: d.recueil_besoins ?? {},
      genere_le: new Date().toISOString(),
    };

    const hash = createHash("sha256")
      .update(JSON.stringify(contenu))
      .digest("hex");

    // Une seule lettre "vivante" par dossier : on ré-utilise la brouillon/envoyée non signée
    const { data: existing } = await supabase
      .from("lettres_mission")
      .select("id, statut")
      .eq("dossier_id", data.dossier_id)
      .neq("statut", "annulee")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let lettreId: string;
    if (existing && existing.statut !== "signee") {
      const { error: upErr } = await supabase
        .from("lettres_mission")
        .update({
          contenu,
          document_hash: hash,
          type_assurance: d.type_assurance,
          client_id: d.client_id,
          email_destinataire: d.client_email,
          envoye_le: new Date().toISOString(),
          envoye_par: userId,
          statut: "envoyee",
        })
        .eq("id", existing.id);
      if (upErr) throw new Error(upErr.message);
      lettreId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("lettres_mission")
        .insert({
          dossier_id: data.dossier_id,
          client_id: d.client_id,
          type_assurance: d.type_assurance,
          contenu,
          document_hash: hash,
          statut: "envoyee",
          email_destinataire: d.client_email,
          envoye_le: new Date().toISOString(),
          envoye_par: userId,
          created_by: userId,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw new Error(insErr?.message ?? "Erreur création lettre");
      lettreId = inserted.id;
    }

    // Email au client
    const origin = new URL(getRequest().url).origin;
    const link = `${origin}/espace/signer-lettre-mission`;
    const result = await sendTemplateEmail("lettre-mission-envoi", d.client_email, {
      templateData: {
        clientName: d.client_nom,
        cabinetName: SITE.shortName,
        reference: d.reference,
        link,
      },
      replyTo: SITE.email,
    });
    if (!result.sent) throw new Error("Adresse en liste de suppression — envoi refusé");

    return { ok: true, id: lettreId };
  });

const signerInput = z.object({
  lettre_id: z.string().uuid(),
  signature_png: z.string().min(100).max(500_000),
});

export const signerLettreMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => signerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lettre, error } = await supabase
      .from("lettres_mission")
      .select("id, statut, client_id, clients:client_id(user_id)")
      .eq("id", data.lettre_id)
      .maybeSingle();
    if (error || !lettre) throw new Error("Lettre introuvable");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkedUser = (lettre as any).clients?.user_id;
    if (linkedUser !== userId) throw new Error("Non autorisé");
    if (lettre.statut === "signee") throw new Error("Lettre déjà signée");

    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? null;

    const { error: upErr } = await supabase
      .from("lettres_mission")
      .update({
        statut: "signee",
        signature_png: data.signature_png,
        signed_at: new Date().toISOString(),
        signed_ip: ip,
        signed_ua: ua,
      })
      .eq("id", data.lettre_id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true };
  });
