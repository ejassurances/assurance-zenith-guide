import type { SupabaseClient } from "@supabase/supabase-js";
import { genererPdfDevoirConseil } from "@/lib/devoir-conseil-pdf.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = "dossier-documents";

/**
 * Génère le PDF du devoir de conseil, l'archive dans le stockage et le
 * rattache au dossier (onglet Projet) lorsque le client a répondu.
 */
export async function archiverDevoirConseil(
  supabase: SupabaseClient<any, any, any>,
  devoirId: string,
  uploaderId: string | null,
) {
  const { data: devoir, error } = await supabase
    .from("devoirs_conseil")
    .select(
      "id, dossier_id, client_id, type_assurance, statut, contenu, recommandation, motifs, mises_en_garde, signature_png, signed_at, signed_ip, hash, refus_motif, refuse_le",
    )
    .eq("id", devoirId)
    .maybeSingle();
  if (error || !devoir) throw new Error(error?.message ?? "Devoir de conseil introuvable");

  const d = devoir as any;
  const pdf = await genererPdfDevoirConseil({
    contenu: d.contenu ?? {},
    type_assurance: d.type_assurance,
    statut: d.statut,
    recommandation: d.recommandation,
    motifs: d.motifs,
    mises_en_garde: d.mises_en_garde,
    signature_png: d.signature_png,
    signed_at: d.signed_at,
    signed_ip: d.signed_ip,
    hash: d.hash,
    refus_motif: d.refus_motif,
    refuse_le: d.refuse_le,
  });

  const reference: string = d.contenu?.dossier?.reference ?? d.dossier_id;
  const fileName = `devoir-conseil-${reference}${d.statut === "signe" ? "-signe" : ""}.pdf`;
  const path = `${d.client_id ?? "sans-client"}/dda/${devoirId}-${fileName}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([pdf as unknown as BlobPart], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) throw new Error(`Archivage PDF : ${upErr.message}`);

  await supabase.from("devoirs_conseil").update({ pdf_path: path }).eq("id", devoirId);

  // Classement direct sur Google Drive (dossier client + registre DDA/ACPR).
  if (d.client_id) {
    const { archiverPdfSurDrive } = await import("@/lib/drive-arborescence.server");
    await archiverPdfSurDrive(supabase, {
      client_id: d.client_id,
      sous_dossier: "02_Recueil_et_Conformite",
      nom_fichier: fileName,
      pdf,
      copie_registre_dda: true,
    });
  }

  // Le document définitif (réponse du client) est rattaché au dossier.
  if ((d.statut === "signe" || d.statut === "refuse") && uploaderId) {
    const { data: deja } = await supabase
      .from("documents")
      .select("id")
      .eq("storage_path", path)
      .maybeSingle();
    if (!deja) {
      await supabase.from("documents").insert({
        dossier_id: d.dossier_id,
        client_id: d.client_id,
        uploader_id: uploaderId,
        storage_path: path,
        file_name: fileName,
        file_size: pdf.byteLength,
        mime_type: "application/pdf",
        categorie: "dda",
      });
    }
  }

  return { path, size: pdf.byteLength };
}

/** URL signée du PDF (génère le document au besoin). */
export async function urlPdfDevoirConseil(
  supabase: SupabaseClient<any, any, any>,
  devoirId: string,
  uploaderId: string | null,
) {
  const { path } = await archiverDevoirConseil(supabase, devoirId, uploaderId);
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
