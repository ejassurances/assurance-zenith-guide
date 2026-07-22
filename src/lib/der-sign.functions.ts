import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP, getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "node:crypto";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { SITE } from "@/lib/site";

const inputSchema = z.object({
  envoi_id: z.string().uuid(),
  signature_png: z.string().min(100).max(500_000), // data:image/png;base64,...
});

export const signerDer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Récupérer l'envoi + vérifier le lien avec ce user (via clients.user_id, RLS applique)
    const { data: envoi, error: envErr } = await supabase
      .from("client_der_envois")
      .select("id, client_id, der_modele_id, statut, clients:client_id(user_id)")
      .eq("id", data.envoi_id)
      .maybeSingle();
    if (envErr || !envoi) throw new Error("DER introuvable");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkedUser = (envoi as any).clients?.user_id;
    if (linkedUser !== userId) throw new Error("Non autorisé");
    if (envoi.statut === "signe") throw new Error("DER déjà signé");

    // Snapshot document
    let documentUrl: string | null = null;
    let documentHash: string | null = null;
    if (envoi.der_modele_id) {
      const { data: mod } = await supabase
        .from("der_modele")
        .select("storage_path")
        .eq("id", envoi.der_modele_id)
        .maybeSingle();
      if (mod?.storage_path) {
        const { data: signed } = await supabase.storage
          .from("conformite-documents")
          .createSignedUrl(mod.storage_path, 60 * 60 * 24 * 365);
        documentUrl = signed?.signedUrl ?? null;
        documentHash = createHash("sha256").update(mod.storage_path).digest("hex");
      }
    }

    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? null;

    const { error: updErr } = await supabase
      .from("client_der_envois")
      .update({
        statut: "signe",
        signature_png: data.signature_png,
        signed_at: new Date().toISOString(),
        signed_ip: ip,
        signed_ua: ua,
        document_hash: documentHash,
        document_url_snapshot: documentUrl,
      })
      .eq("id", data.envoi_id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true };
  });

const envoyerDerInputSchema = z.object({ client_id: z.string().uuid(), email: z.string().email() });

export const envoyerDerEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => envoyerDerInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, nom, prenom")
      .eq("id", data.client_id)
      .maybeSingle();
    if (clientErr || !client) throw new Error("Client introuvable ou acces refuse");
    const { data: modele, error: modErr } = await supabase
      .from("der_modele")
      .select("id, storage_path")
      .eq("actif", true)
      .maybeSingle();
    if (modErr || !modele) throw new Error("Aucun DER actif - l'admin doit d'abord activer un modele.");
    const { data: signed, error: urlErr } = await supabase.storage
      .from("conformite-documents")
      .createSignedUrl(modele.storage_path, 60 * 60 * 24 * 7);
    if (urlErr || !signed?.signedUrl) throw new Error("Impossible de generer le lien du DER");
    const clientAny = client as any;
    const clientName = [clientAny.prenom, clientAny.nom].filter(Boolean).join(" ");
    const result = await sendTemplateEmail("der-envoi", data.email, {
      templateData: { clientName: clientName, cabinetName: SITE.shortName, link: signed.signedUrl },
      replyTo: SITE.email,
    });
    if (!result.sent) throw new Error("Adresse en liste de suppression - envoi refuse");
    const { data: existing } = await supabase
      .from("client_der_envois")
      .select("id, statut")
      .eq("client_id", data.client_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing || existing.statut === "signe") {
      await supabase.from("client_der_envois").insert({
        client_id: data.client_id,
        der_modele_id: modele.id,
        email_destinataire: data.email,
        statut: "envoye",
        envoye_le: new Date().toISOString(),
        envoye_par: userId,
      });
    } else {
      await supabase
        .from("client_der_envois")
        .update({
          statut: "envoye",
          envoye_le: new Date().toISOString(),
          envoye_par: userId,
          email_destinataire: data.email,
        })
        .eq("id", existing.id);
    }
    return { sent: true };
  });
