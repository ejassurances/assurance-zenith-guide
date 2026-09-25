import type { SupabaseClient } from "@supabase/supabase-js";
import { assurerChemin, assurerDossier, deposerFichier, nomDrive, renommerDrive, urlDossierDrive, listerEnfantsDrive } from "@/lib/google-drive.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

/** Racines de l'arborescence documentaire du cabinet. */
export const DRIVE_PARENT_CLIENTS = "11n0qKaLzMdK95g7AKpjT46TwFC6_vS5P";
export const DRIVE_RACINE_CLIENTS = DRIVE_PARENT_CLIENTS;
export const DRIVE_REGISTRE_DDA = ["02_RESPONSABLE_CONFORMITE_ET_FINANCES", "01_Registre_DDA_et_ACPR"];

/** Les 6 sous-dossiers standard d'une fiche client. */
export const DRIVE_SOUS_DOSSIERS = [
  "01_KYC_et_Identite",
  "02_Recueil_et_Conformite",
  "03_Projets_et_Devis",
  "04_Contrats_Actifs",
  "05_Sinistres_et_Plaintes",
  "06_Echanges_et_Mails",
] as const;

export type DriveSousDossier = (typeof DRIVE_SOUS_DOSSIERS)[number];

function normaliser(valeur: string | null | undefined) {
  return (valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nomClientAttendu(client: { reference?: string | null; nom: string; prenom?: string | null }) {
  const reference = (client.reference ?? "").trim().toUpperCase();
  const prenom = normaliser(client.prenom);
  const nom = normaliser(client.nom).toUpperCase();
  return [reference, [prenom, nom].filter(Boolean).join(" ")].filter(Boolean).join(" - ");
}

/**
 * Nomenclature officielle des nouveaux dossiers clients Drive :
 * CL-AAAA-NNNN - Prenom NOM.
 * Les références historiques sont conservées telles quelles.
 */
export function nomDossierClient(client: {
  id: string;
  reference?: string | null;
  nom: string;
  prenom?: string | null;
  created_at?: string | null;
}) {
  return nomClientAttendu(client);
}

/**
 * Essaie de retrouver un dossier historique dans le parent Drive à partir du
 * nom/prénom avant de créer un nouveau dossier. Cela évite de dupliquer les
 * clients déjà présents dans Drive mais pas encore rattachés au CRM.
 */
async function retrouverDossierClientHistorique(
  nom: string,
  prenom?: string | null,
): Promise<string | null> {
  const enfants = await listerEnfantsDrive(DRIVE_PARENT_CLIENTS);
  const cibleNom = normaliser(nom).toLowerCase();
  const ciblePrenom = normaliser(prenom).toLowerCase();
  if (!cibleNom) return null;

  const correspondants = enfants.filter((element) => {
    if (element.mimeType !== "application/vnd.google-apps.folder") return false;
    const actuel = normaliser(element.name).toLowerCase();
    if (!actuel.includes(cibleNom)) return false;
    return !ciblePrenom || actuel.includes(ciblePrenom);
  });

  return correspondants.length === 1 ? correspondants[0].id : null;
}

/**
 * Crée (ou retrouve) l'arborescence Drive du client et mémorise
 * l'identifiant + le lien du dossier sur la fiche Supabase.
 */
export async function assurerArborescenceClient(
  supabase: Client,
  clientId: string,
): Promise<{ folder_id: string; folder_url: string }> {
  const { data: client, error } = await supabase
    .from("clients")
    .select("id, reference, nom, prenom, created_at, drive_folder_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !client) throw new Error(error?.message ?? "Client introuvable");

  let folderId: string | null = (client as any).drive_folder_id ?? null;
  const nomAttendu = nomDossierClient(client as any);

  if (!folderId) {
    // 1. Priorité à un dossier historique déjà présent dans le Drive.
    folderId = await retrouverDossierClientHistorique(client.nom, client.prenom);

    // 2. Sinon création dans le dossier parent officiel.
    if (!folderId) {
      folderId = await assurerDossier(nomAttendu, DRIVE_PARENT_CLIENTS);
    }
  } else {
    // Ne renomme jamais automatiquement un dossier historique déjà rattaché.
    // Le nouveau nommage s'applique uniquement aux dossiers créés selon la
    // nouvelle nomenclature et aux dossiers dont le nom correspond déjà à
    // l'ancienne nomenclature du CRM.
    const nomActuel = await nomDrive(folderId);
    const estNouvelleNomenclature = /^CL-\d{4}-\d{4} - .+$/i.test(nomActuel ?? "");
    if (estNouvelleNomenclature && nomActuel !== nomAttendu) {
      await renommerDrive(folderId, nomAttendu);
    }
  }

  for (const sous of DRIVE_SOUS_DOSSIERS) {
    await assurerDossier(sous, folderId);
  }

  const folderUrl = urlDossierDrive(folderId);
  await supabase
    .from("clients")
    .update({
      drive_folder_id: folderId,
      drive_folder_url: folderUrl,
      drive_sync_le: new Date().toISOString(),
    })
    .eq("id", clientId);

  return { folder_id: folderId, folder_url: folderUrl };
}

/** Idem, mais ne lève jamais : l'échec Drive ne doit pas bloquer le CRM. */
export async function assurerArborescenceClientSansEchec(supabase: Client, clientId: string) {
  try {
    return await assurerArborescenceClient(supabase, clientId);
  } catch (e) {
    console.error("[drive] arborescence client non créée", clientId, e);
    return null;
  }
}

/**
 * Archive un PDF (lettre de mission, devoir de conseil, DER…) dans le
 * sous-dossier Drive du client, avec copie au registre DDA / ACPR pour les
 * pièces réglementaires.
 */
export async function archiverPdfSurDrive(
  supabase: Client,
  params: {
    client_id: string;
    sous_dossier: DriveSousDossier;
    nom_fichier: string;
    pdf: Uint8Array;
    copie_registre_dda?: boolean;
  },
): Promise<{ ok: true; file_id: string; url: string | null; registre_file_id?: string } | { ok: false; error: string }> {
  try {
    const { folder_id } = await assurerArborescenceClient(supabase, params.client_id);
    const cible = await assurerDossier(params.sous_dossier, folder_id);
    const depot = await deposerFichier({
      folderId: cible,
      nom: params.nom_fichier,
      contenu: params.pdf,
    });

    let registreFileId: string | undefined;
    if (params.copie_registre_dda) {
      const registre = await assurerChemin(DRIVE_REGISTRE_DDA);
      const copie = await deposerFichier({
        folderId: registre,
        nom: params.nom_fichier,
        contenu: params.pdf,
      });
      registreFileId = copie.id;
    }

    return { ok: true, file_id: depot.id, url: depot.webViewLink, registre_file_id: registreFileId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Drive inconnue";
    console.error(`[drive] archivage ${params.nom_fichier} échoué`, message);
    return { ok: false, error: message };
  }
}
