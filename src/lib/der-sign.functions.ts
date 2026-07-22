import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "node:crypto";

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
