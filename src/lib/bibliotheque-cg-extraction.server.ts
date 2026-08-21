import type { SupabaseClient } from "@supabase/supabase-js";
import { grillePourFamille } from "@/lib/garanties-grille";
import { BUCKET_CG_CLIENTS, familleCodePourBranche } from "@/lib/bibliotheque-cg";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

const TAILLE_MAX = 12 * 1024 * 1024;

/**
 * Analyse IA d'un CG apporté par un client : même module que pour les CG
 * partenaires. Le résultat est écrit en BROUILLON (`valeurs_proposees`) et n'est
 * jamais considéré comme validé : un humain doit relire poste par poste.
 */
export async function analyserCgBibliotheque(supabase: Client, entreeId: string) {
  const { data, error } = await supabase
    .from("bibliotheque_cg_clients")
    .select("id, compagnie_nom, branche, storage_path, nom_fichier, mime_type")
    .eq("id", entreeId)
    .maybeSingle();
  if (error || !data) throw new Error("Entrée de bibliothèque introuvable ou accès refusé");
  const e = data as {
    id: string;
    compagnie_nom: string;
    branche: string;
    storage_path: string;
    nom_fichier: string | null;
    mime_type: string | null;
  };

  const familleCode = familleCodePourBranche(e.branche);
  const grille = grillePourFamille(familleCode);
  if (!grille) {
    throw new Error("Aucune grille de garanties standardisée n'existe pour cette branche : analyse impossible.");
  }

  const { data: blob, error: dErr } = await supabase.storage
    .from(BUCKET_CG_CLIENTS)
    .download(e.storage_path);
  if (dErr || !blob) throw new Error("Document introuvable dans le stockage.");
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error("Document vide.");
  if (buffer.byteLength > TAILLE_MAX) {
    throw new Error("Document trop volumineux pour l'analyse automatique (12 Mo maximum).");
  }

  const { analyserFichiersContrat } = await import("@/lib/produit-garanties-extraction.server");
  const { modele, valeurs, avertissements, porteur } = await analyserFichiersContrat(
    grille,
    [
      {
        nom: e.nom_fichier || "conditions-generales.pdf",
        mime: e.mime_type || "application/pdf",
        base64: buffer.toString("base64"),
        type: "conditions_generales",
      },
    ],
    `Contrat actuel du client — ${e.compagnie_nom}`,
  );

  const remarques = [
    "Contrat apporté par le client : extraction automatique NON validée, relecture humaine obligatoire.",
    porteur.nom ? `Assureur porteur proposé par l'IA : ${porteur.nom}` : null,
    avertissements || null,
  ]
    .filter(Boolean)
    .join("\n");

  const { error: uErr } = await supabase
    .from("bibliotheque_cg_clients")
    .update({
      famille_code: grille.familleCode,
      grille_version: grille.version,
      valeurs_proposees: valeurs,
      modele_ia: modele,
      avertissements: remarques,
      statut: "brouillon",
      valide: false,
    })
    .eq("id", e.id);
  if (uErr) throw new Error(uErr.message);

  return {
    entree_id: e.id,
    famille_code: grille.familleCode,
    grille_version: grille.version,
    valeurs,
    avertissements: remarques,
    modele,
  };
}
