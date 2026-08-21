import type { SupabaseClient } from "@supabase/supabase-js";
import { genererPdfLettreMission } from "@/lib/lettre-mission-pdf.server";
import { buildClientPayload, postToCrmWebhook } from "@/lib/crm-webhook.server";
import type { CrmWebhookDocument } from "@/lib/crm-webhook.config";

/** Dossier Drive de classement des DDA (géré par le script Apps Script). */
export const DRIVE_FOLDER_DDA = "02_Conformite_DDA";
const BUCKET = "dossier-documents";

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Génère le PDF signé de la lettre de mission, l'archive dans le stockage,
 * le rattache au dossier et le transmet au webhook CRM pour dépôt sur Drive.
 */
export async function archiverLettreMissionSignee(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  lettreId: string,
  uploaderId: string,
) {
  const { data: lettre, error } = await supabase
    .from("lettres_mission")
    .select(
      "id, dossier_id, client_id, type_assurance, contenu, signature_png, signed_at, signed_ip, document_hash",
    )
    .eq("id", lettreId)
    .maybeSingle();
  if (error || !lettre) throw new Error(error?.message ?? "Lettre introuvable");

  const pdf = await genererPdfLettreMission({
    contenu: lettre.contenu ?? {},
    type_assurance: lettre.type_assurance,
    signature_png: lettre.signature_png,
    signed_at: lettre.signed_at,
    signed_ip: lettre.signed_ip,
    document_hash: lettre.document_hash,
  });

  const reference: string = lettre.contenu?.dossier?.reference ?? lettre.dossier_id;
  const fileName = `lettre-mission-${reference}.pdf`;
  const path = `${lettre.client_id ?? "sans-client"}/dda/${lettreId}-${fileName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([pdf as unknown as BlobPart], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) throw new Error(`Archivage PDF : ${upErr.message}`);

  await supabase.from("lettres_mission").update({ pdf_storage_path: path }).eq("id", lettreId);

  // Rattachement du document au dossier (onglet Projet) — idempotent : la
  // reprise d'archivage ne doit pas créer de doublon.
  const { data: dejaRattache } = await supabase
    .from("documents")
    .select("id")
    .eq("storage_path", path)
    .maybeSingle();
  if (!dejaRattache) {
    await supabase.from("documents").insert({
      dossier_id: lettre.dossier_id,
      client_id: lettre.client_id,
      uploader_id: uploaderId,
      storage_path: path,
      file_name: fileName,
      file_size: pdf.byteLength,
      mime_type: "application/pdf",
      categorie: "dda",
    });
  }

  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);

  const { data: dossier } = await supabase
    .from("dossiers")
    .select("id, reference, type_assurance, statut")
    .eq("id", lettre.dossier_id)
    .maybeSingle();

  const document: CrmWebhookDocument = {
    drive_folder: DRIVE_FOLDER_DDA,
    type: "lettre_mission_signee",
    nom_fichier: fileName,
    mime_type: "application/pdf",
    contenu_base64: toBase64(pdf),
    url_signee: signed?.signedUrl ?? null,
    signe_le: lettre.signed_at,
    empreinte_sha256: lettre.document_hash,
  };

  // Classement direct sur Google Drive (dossier client + registre DDA/ACPR).
  if (lettre.client_id) {
    const { archiverPdfSurDrive } = await import("@/lib/drive-arborescence.server");
    await archiverPdfSurDrive(supabase, {
      client_id: lettre.client_id,
      sous_dossier: "02_Recueil_et_Conformite",
      nom_fichier: fileName,
      pdf,
      copie_registre_dda: true,
    });
  }

  let reponse = "webhook non appelé (client non rattaché)";
  if (lettre.client_id) {
    const payload = await buildClientPayload(supabase, lettre.client_id, "lettre_mission.signee");
    const res = await postToCrmWebhook({
      ...payload,
      dossier: dossier ?? undefined,
      document,
    });
    reponse = `${res.status} ${res.response}`;
  }

  await supabase
    .from("lettres_mission")
    .update({ archive_envoye_le: new Date().toISOString(), archive_reponse: reponse.slice(0, 500) })
    .eq("id", lettreId);

  return { path, pdf_size: pdf.byteLength, webhook: reponse };
}
