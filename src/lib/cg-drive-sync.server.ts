import type { SupabaseClient } from "@supabase/supabase-js";
import { estDossierDrive, listerEnfantsDrive, urlFichierDrive } from "@/lib/google-drive.server";
import { DRIVE_DOSSIER_CG_ID } from "@/lib/documents-partenaires.server";

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
