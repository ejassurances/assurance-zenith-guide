import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deposerFichier,
  estDossierDrive,
  listerEnfantsDrive,
  urlFichierDrive,
} from "@/lib/google-drive.server";
import { DRIVE_DOSSIER_CG_ID, assurerDossierPartenaire } from "@/lib/documents-partenaires.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

/**
 * Remontée des CG déposées à la main dans le Drive officiel.
 * Arborescence attendue : [Dossier CG]/[Compagnie]/[Branche]/fichier.pdf
 * Le CRM ne conserve que le lien Drive (règle d'architecture n°2).
 */

function cle(valeur: string | null | undefined) {
  return (valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Type de document déduit du nom de fichier (les CG restent le cas par défaut). */
function typeDepuisNom(nom: string) {
  const n = cle(nom);
  if (/\bipid\b|information produit/.test(n)) return "ipid";
  if (/tableau|grille/.test(n)) return "tableau_garanties";
  if (/ccsf/.test(n)) return "ccsf";
  if (/fiche produit/.test(n)) return "fiche_produit";
  return "conditions_generales";
}

/** Variante d'assiette évoquée par le nom du fichier (CI / CRD), sinon null. */
function varianteDepuisNom(nom: string): "ci" | "crd" | null {
  const n = cle(nom);
  if (/\bcrd\b|capital restant/.test(n)) return "crd";
  if (/\bci\b|capital initial/.test(n)) return "ci";
  return null;
}

function varianteProduit(nom: string): "ci" | "crd" | null {
  return varianteDepuisNom(nom);
}

export type RapportSyncCg = {
  fichiers_vus: number;
  liens_crees: number;
  deja_lies: number;
  ignores: { fichier: string; chemin: string; raison: string }[];
  crees: { fichier: string; produit: string; type: string }[];
};

/**
 * Parcourt le Drive des CG et crée les entrées produit_documents manquantes.
 * Aucun fichier n'est copié : seul le lien Drive est enregistré.
 */
export async function synchroniserCgDepuisDrive(
  supabase: Client,
  userId: string | null,
): Promise<RapportSyncCg> {
  const rapport: RapportSyncCg = {
    fichiers_vus: 0,
    liens_crees: 0,
    deja_lies: 0,
    ignores: [],
    crees: [],
  };

  const [{ data: compagnies }, { data: familles }, { data: produits }, { data: docs }] =
    await Promise.all([
      supabase.from("compagnies").select("id, nom"),
      supabase.from("produit_familles").select("id, nom, code"),
      supabase.from("produits").select("id, nom, compagnie_id, famille_id, statut"),
      supabase.from("produit_documents").select("produit_id, drive_file_id"),
    ]);

  const parCompagnie = new Map<string, string>();
  for (const c of (compagnies ?? []) as any[]) parCompagnie.set(cle(c.nom), c.id);
  const parFamille = new Map<string, string>();
  for (const f of (familles ?? []) as any[]) {
    parFamille.set(cle(f.nom), f.id);
    parFamille.set(cle(f.code), f.id);
  }
  const listeProduits = ((produits ?? []) as any[]).filter((p) => p.statut !== "supprime");
  const dejaLies = new Set(
    ((docs ?? []) as any[])
      .filter((d) => d.drive_file_id)
      .map((d) => `${d.produit_id}:${d.drive_file_id}`),
  );

  const dossiersCompagnies = (await listerEnfantsDrive(DRIVE_DOSSIER_CG_ID)).filter((e) =>
    estDossierDrive(e.mimeType),
  );

  for (const dossierCompagnie of dossiersCompagnies) {
    const compagnieId = parCompagnie.get(cle(dossierCompagnie.name));
    const enfants = await listerEnfantsDrive(dossierCompagnie.id);
    const dossiersBranches = enfants.filter((e) => estDossierDrive(e.mimeType));

    for (const dossierBranche of dossiersBranches) {
      const chemin = `${dossierCompagnie.name}/${dossierBranche.name}`;
      const familleId = parFamille.get(cle(dossierBranche.name));
      const fichiers = (await listerEnfantsDrive(dossierBranche.id)).filter(
        (e) => !estDossierDrive(e.mimeType),
      );

      for (const fichier of fichiers) {
        rapport.fichiers_vus += 1;

        if (!compagnieId) {
          rapport.ignores.push({
            fichier: fichier.name,
            chemin,
            raison: `compagnie « ${dossierCompagnie.name} » absente du catalogue`,
          });
          continue;
        }
        if (!familleId) {
          rapport.ignores.push({
            fichier: fichier.name,
            chemin,
            raison: `branche « ${dossierBranche.name} » inconnue`,
          });
          continue;
        }

        let cibles = listeProduits.filter(
          (p) => p.compagnie_id === compagnieId && p.famille_id === familleId,
        );
        // Le catalogue emprunteur est scindé CI / CRD : on respecte la variante du fichier.
        const variante = varianteDepuisNom(fichier.name);
        if (variante) {
          const filtrees = cibles.filter((p) => varianteProduit(p.nom) === variante);
          if (filtrees.length > 0) cibles = filtrees;
        }

        if (cibles.length === 0) {
          rapport.ignores.push({
            fichier: fichier.name,
            chemin,
            raison: "aucune fiche produit correspondante dans le catalogue",
          });
          continue;
        }

        const type = typeDepuisNom(fichier.name);
        for (const produit of cibles) {
          if (dejaLies.has(`${produit.id}:${fichier.id}`)) {
            rapport.deja_lies += 1;
            continue;
          }
          const { error } = await supabase.from("produit_documents").insert({
            produit_id: produit.id,
            type,
            nom: fichier.name,
            mime_type: fichier.mimeType,
            interne: false,
            storage_path: null,
            drive_file_id: fichier.id,
            drive_url: urlFichierDrive(fichier.id),
            drive_chemin: chemin,
            uploaded_by: userId,
          });
          if (error) {
            rapport.ignores.push({ fichier: fichier.name, chemin, raison: error.message });
            continue;
          }
          dejaLies.add(`${produit.id}:${fichier.id}`);
          rapport.liens_crees += 1;
          rapport.crees.push({ fichier: fichier.name, produit: produit.nom, type });
        }
      }
    }
  }

  return rapport;
}

export type RapportDossiersCompagnies = {
  compagnies: number;
  dossiers_crees: number;
  dossiers_existants: number;
  details: { compagnie: string; chemin: string; cree: boolean; url: string }[];
};

/**
 * Crée dans le Drive des CG un dossier par compagnie du CRM (et un sous-dossier
 * par branche réellement présente au catalogue). Un dossier déjà existant est
 * réutilisé tel quel, jamais dupliqué.
 */
export async function creerDossiersCompagniesSurDrive(
  supabase: Client,
): Promise<RapportDossiersCompagnies> {
  const rapport: RapportDossiersCompagnies = {
    compagnies: 0,
    dossiers_crees: 0,
    dossiers_existants: 0,
    details: [],
  };

  const [{ data: compagnies }, { data: produits }, { data: familles }] = await Promise.all([
    supabase.from("compagnies").select("id, nom").order("nom"),
    supabase.from("produits").select("compagnie_id, famille_id, statut"),
    supabase.from("produit_familles").select("id, nom"),
  ]);

  const nomFamille = new Map<string, string>();
  for (const f of (familles ?? []) as any[]) nomFamille.set(f.id, f.nom);

  const branchesParCompagnie = new Map<string, Set<string>>();
  for (const p of (produits ?? []) as any[]) {
    if (!p.compagnie_id || !p.famille_id || p.statut === "supprime") continue;
    const nom = nomFamille.get(p.famille_id);
    if (!nom) continue;
    if (!branchesParCompagnie.has(p.compagnie_id)) branchesParCompagnie.set(p.compagnie_id, new Set());
    branchesParCompagnie.get(p.compagnie_id)!.add(nom);
  }

  const existants = new Map<string, string>();
  for (const e of await listerEnfantsDrive(DRIVE_DOSSIER_CG_ID)) {
    if (estDossierDrive(e.mimeType)) existants.set(cle(e.name), e.id);
  }

  for (const compagnie of (compagnies ?? []) as any[]) {
    rapport.compagnies += 1;
    const dejaLa = existants.get(cle(compagnie.nom));
    const branches = [...(branchesParCompagnie.get(compagnie.id) ?? new Set<string>())];

    if (branches.length === 0) {
      const dossier = await assurerDossierPartenaire(compagnie.nom, null);
      if (dejaLa) rapport.dossiers_existants += 1;
      else rapport.dossiers_crees += 1;
      rapport.details.push({
        compagnie: compagnie.nom,
        chemin: dossier.chemin,
        cree: !dejaLa,
        url: dossier.url,
      });
      continue;
    }

    for (const branche of branches) {
      const dossier = await assurerDossierPartenaire(compagnie.nom, branche);
      if (dejaLa) rapport.dossiers_existants += 1;
      else rapport.dossiers_crees += 1;
      rapport.details.push({
        compagnie: compagnie.nom,
        chemin: dossier.chemin,
        cree: !dejaLa,
        url: dossier.url,
      });
    }
  }

  return rapport;
}

export type RapportRemonteeDrive = {
  a_traiter: number;
  televerses: number;
  echecs: { document: string; raison: string }[];
  details: { document: string; chemin: string }[];
};

/**
 * Téléverse sur le Drive les CG encore stockées dans le CRM, rangées sous
 * [Compagnie]/[Branche], puis ne conserve en base que le lien Drive.
 */
export async function televerserDocumentsCrmVersDrive(
  supabase: Client,
): Promise<RapportRemonteeDrive> {
  const rapport: RapportRemonteeDrive = { a_traiter: 0, televerses: 0, echecs: [], details: [] };

  const { data, error } = await supabase
    .from("produit_documents")
    .select(
      "id, nom, type, mime_type, storage_path, drive_file_id, produit_id, produits!produit_documents_produit_id_fkey(nom, compagnies!produits_compagnie_id_fkey(nom), produit_familles!produits_famille_id_fkey(nom))",
    )
    .is("drive_file_id", null)
    .not("storage_path", "is", null);
  if (error) throw new Error(error.message);

  const lignes = (data ?? []) as any[];
  rapport.a_traiter = lignes.length;

  for (const doc of lignes) {
    const compagnie: string | null = doc.produits?.compagnies?.nom ?? null;
    const branche: string | null = doc.produits?.produit_familles?.nom ?? null;
    try {
      const { data: blob, error: dlErr } = await supabase.storage
        .from("produits-documents")
        .download(doc.storage_path as string);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "fichier introuvable dans le CRM");

      const dossier = await assurerDossierPartenaire(compagnie, branche);
      const depot = await deposerFichier({
        folderId: dossier.folder_id,
        nom: doc.nom as string,
        contenu: new Uint8Array(await blob.arrayBuffer()),
        mimeType: (doc.mime_type as string | null) ?? "application/pdf",
      });

      const { error: upErr } = await supabase
        .from("produit_documents")
        .update({
          drive_file_id: depot.id,
          drive_url: depot.webViewLink ?? urlFichierDrive(depot.id),
          drive_chemin: dossier.chemin,
          storage_path: null,
        })
        .eq("id", doc.id);
      if (upErr) throw new Error(upErr.message);

      // Le Drive devient la seule copie : le fichier CRM est supprimé.
      await supabase.storage.from("produits-documents").remove([doc.storage_path as string]);

      rapport.televerses += 1;
      rapport.details.push({ document: doc.nom as string, chemin: dossier.chemin });
    } catch (e) {
      rapport.echecs.push({
        document: (doc.nom as string) ?? doc.id,
        raison: e instanceof Error ? e.message : "téléversement impossible",
      });
    }
  }

  return rapport;
}
