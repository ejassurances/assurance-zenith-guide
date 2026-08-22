import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assurerChemin,
  deposerFichier,
  telechargerFichier,
  urlDossierDrive,
  urlFichierDrive,
} from "@/lib/google-drive.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

/**
 * Règle d'architecture n°2 — les CGV, IPID et notices compagnies ne sont jamais
 * stockées dans le CRM : le fichier vit sur le Drive du cabinet, sous
 * 04_PARTENAIRES_ET_COMPAGNIES/[Compagnie]/[Branche], et le CRM n'en conserve
 * que le lien de consultation.
 */
export const DRIVE_RACINE_PARTENAIRES = "04_PARTENAIRES_ET_COMPAGNIES";

/**
 * Dossier Drive officiel des conditions générales / notices compagnies :
 * https://drive.google.com/drive/folders/1zyEYAYUve-sQRCXqlYpCDoUgaZxisDMS
 * Les documents y sont rangés par Compagnie puis par Branche.
 */
export const DRIVE_DOSSIER_CG_ID = "1zyEYAYUve-sQRCXqlYpCDoUgaZxisDMS";

function segment(valeur: string | null | undefined, defaut: string) {
  const nettoye = (valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return nettoye || defaut;
}

/** Chemin Drive normalisé d'une branche d'une compagnie. */
export function cheminDrivePartenaire(compagnie: string | null, branche: string | null) {
  return [segment(compagnie, "Compagnie_inconnue"), segment(branche, "Divers")];
}

/** Crée (ou retrouve) le dossier Drive d'une branche de compagnie, sous le dossier CG officiel. */
export async function assurerDossierPartenaire(compagnie: string | null, branche: string | null) {
  const chemin = cheminDrivePartenaire(compagnie, branche);
  const folderId = await assurerChemin(chemin, DRIVE_DOSSIER_CG_ID);
  return { folder_id: folderId, chemin: chemin.join("/"), url: urlDossierDrive(folderId) };
}

/**
 * Dépose un document produit (CG, IPID, tableau de garanties…) sur le Drive du
 * cabinet et enregistre uniquement son lien dans le CRM.
 */
export async function deposerDocumentProduitSurDrive(
  supabase: Client,
  params: {
    produit_id: string;
    type: string;
    nom: string;
    version?: string | null;
    mime_type?: string | null;
    taille_bytes?: number | null;
    interne?: boolean;
    contenu: Uint8Array;
    uploaded_by?: string | null;
  },
) {
  const { data: produit, error } = await supabase
    .from("produits")
    .select("id, nom, compagnies!produits_compagnie_id_fkey(nom), produit_familles!produits_famille_id_fkey(nom)")
    .eq("id", params.produit_id)
    .maybeSingle();
  if (error || !produit) throw new Error(error?.message ?? "Produit introuvable ou accès refusé");

  const p = produit as any;
  const compagnie: string | null = p.compagnies?.nom ?? null;
  const branche: string | null = p.produit_familles?.nom ?? null;

  const dossier = await assurerDossierPartenaire(compagnie, branche);
  const depot = await deposerFichier({
    folderId: dossier.folder_id,
    nom: params.nom,
    contenu: params.contenu,
    mimeType: params.mime_type ?? "application/pdf",
  });

  const { data: ligne, error: insErr } = await supabase
    .from("produit_documents")
    .insert({
      produit_id: params.produit_id,
      type: params.type,
      nom: params.nom,
      version: params.version ?? null,
      mime_type: params.mime_type ?? null,
      taille_bytes: params.taille_bytes ?? params.contenu.byteLength,
      interne: params.interne ?? false,
      storage_path: null,
      drive_file_id: depot.id,
      drive_url: depot.webViewLink ?? urlFichierDrive(depot.id),
      drive_chemin: dossier.chemin,
      uploaded_by: params.uploaded_by ?? null,
    })
    .select("id, drive_url, drive_chemin")
    .maybeSingle();
  if (insErr) throw new Error(insErr.message);

  return {
    id: (ligne as any)?.id as string,
    drive_url: (ligne as any)?.drive_url as string,
    drive_chemin: dossier.chemin,
  };
}

/** Extrait l'identifiant Drive d'une URL de partage (/file/d/<id>/… ou ?id=<id>). */
export function idFichierDepuisUrlDrive(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/(?:file|d)\/(?:d\/)?([A-Za-z0-9_-]{10,})/) ?? url.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m?.[1] ?? null;
}

/**
 * Contenu binaire d'un document produit, quelle que soit sa source :
 * Drive (nouveau standard) ou stockage CRM historique.
 */
export async function contenuDocumentProduit(
  supabase: Client,
  doc: {
    nom?: string | null;
    storage_path?: string | null;
    drive_file_id?: string | null;
    drive_url?: string | null;
  },
): Promise<Buffer> {
  // Le Drive est la source officielle : on accepte aussi une simple URL de partage
  // (documents rattachés à la main), d'où l'on déduit l'identifiant du fichier.
  const fileId = doc.drive_file_id ?? idFichierDepuisUrlDrive(doc.drive_url);
  if (fileId) {
    const bytes = await telechargerFichier(fileId);
    return Buffer.from(bytes);
  }
  if (!doc.storage_path) {
    throw new Error(`Aucun fichier rattaché : ${doc.nom ?? "document"}`);
  }
  const { data: blob, error } = await supabase.storage.from("produits-documents").download(doc.storage_path);
  if (error || !blob) throw new Error(`Téléchargement impossible : ${doc.nom ?? "document"}`);
  return Buffer.from(await blob.arrayBuffer());
}
