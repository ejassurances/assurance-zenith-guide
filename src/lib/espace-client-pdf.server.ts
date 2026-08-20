import type { SupabaseClient } from "@supabase/supabase-js";
import { genererPdfLettreMission } from "@/lib/lettre-mission-pdf.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = "dossier-documents";

/**
 * URL signée du PDF de la lettre de mission. Si le PDF n'a pas encore été
 * archivé (lettre non signée par exemple), il est généré à la volée puis
 * archivé afin que le client puisse l'ouvrir et l'imprimer.
 */
export async function urlPdfLettreMission(
  supabase: SupabaseClient<any, any, any>,
  lettreId: string,
): Promise<{ url: string; fileName: string } | null> {
  const { data: lettre } = await supabase
    .from("lettres_mission")
    .select(
      "id, dossier_id, client_id, type_assurance, contenu, signature_png, signed_at, signed_ip, document_hash, pdf_storage_path",
    )
    .eq("id", lettreId)
    .maybeSingle();
  if (!lettre) return null;
  const l = lettre as any;

  const reference: string = l.contenu?.dossier?.reference ?? l.dossier_id;
  const fileName = `lettre-mission-${reference}.pdf`;
  let path: string | null = l.pdf_storage_path ?? null;

  if (path) {
    const { data: existe } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (existe?.signedUrl) return { url: existe.signedUrl, fileName };
  }

  const pdf = await genererPdfLettreMission({
    contenu: l.contenu ?? {},
    type_assurance: l.type_assurance,
    signature_png: l.signature_png,
    signed_at: l.signed_at,
    signed_ip: l.signed_ip,
    document_hash: l.document_hash,
  });

  path = `${l.client_id ?? "sans-client"}/dda/${lettreId}-${fileName}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([pdf as unknown as BlobPart], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) throw new Error(`Génération PDF : ${upErr.message}`);

  await supabase.from("lettres_mission").update({ pdf_storage_path: path }).eq("id", lettreId);

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  return signed?.signedUrl ? { url: signed.signedUrl, fileName } : null;
}
