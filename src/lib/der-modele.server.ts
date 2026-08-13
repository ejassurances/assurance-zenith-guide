import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  construireContenuDer,
  prochaineVersion,
  type DerContenu,
  type DerPartenaire,
} from "@/lib/der-modele";
import { genererPdfDer } from "@/lib/der-pdf.server";

type Client = SupabaseClient<Database>;

const BUCKET = "conformite-documents";

/** Compagnies actives et leurs produits actifs. */
export async function chargerPartenairesActifs(supabase: Client): Promise<DerPartenaire[]> {
  const { data: compagnies } = await supabase
    .from("compagnies")
    .select("id, nom")
    .eq("statut", "actif")
    .order("nom");
  const ids = (compagnies ?? []).map((c) => c.id);
  const { data: produits } = ids.length
    ? await supabase
        .from("produits")
        .select("nom, compagnie_id")
        .eq("statut", "actif")
        .in("compagnie_id", ids)
        .order("nom")
    : { data: [] as { nom: string; compagnie_id: string }[] };

  return (compagnies ?? []).map((c) => ({
    compagnie: c.nom,
    produits: (produits ?? []).filter((p) => p.compagnie_id === c.id).map((p) => p.nom),
  }));
}

/** Génère (ou régénère) le brouillon du DER à partir de l'état actuel de la base. */
export async function regenererBrouillonDerModele(
  supabase: Client,
  userId: string | null,
): Promise<{ id: string; version: string; contenu: DerContenu }> {
  const partenaires = await chargerPartenairesActifs(supabase);

  const { data: versions } = await supabase.from("der_modele").select("version");
  const version = prochaineVersion((versions ?? []).map((v) => v.version));
  const contenu = construireContenuDer({ version, partenaires });

  const pdf = await genererPdfDer(contenu);
  const path = `der-modele/${Date.now()}_v${version}.pdf`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw new Error(`Enregistrement du PDF impossible : ${upErr.message}`);

  // Un seul brouillon en attente à la fois : on remplace le précédent.
  const { data: brouillons } = await supabase
    .from("der_modele")
    .select("id, storage_path")
    .eq("statut", "brouillon");
  for (const b of brouillons ?? []) {
    if (b.storage_path) await supabase.storage.from(BUCKET).remove([b.storage_path]);
    await supabase.from("der_modele").delete().eq("id", b.id);
  }

  const { data: cree, error } = await supabase
    .from("der_modele")
    .insert({
      version,
      nom: `DER ${contenu.cabinet.nom} - v${version}`,
      storage_path: path,
      contenu: contenu as unknown as Database["public"]["Tables"]["der_modele"]["Insert"]["contenu"],
      statut: "brouillon",
      actif: false,
      updated_by: userId,
      notes: `Généré automatiquement — ${partenaires.length} compagnie(s) active(s)`,
    })
    .select("id, version")
    .single();
  if (error || !cree) throw new Error(error?.message ?? "Création du brouillon impossible");

  return { id: cree.id, version: cree.version, contenu };
}

/** Régénère le PDF d'un brouillon après édition légère du contenu. */
export async function enregistrerBrouillonDerModele(
  supabase: Client,
  params: { id: string; contenu: DerContenu; userId: string | null },
) {
  const { data: existant } = await supabase
    .from("der_modele")
    .select("id, statut, storage_path, version")
    .eq("id", params.id)
    .maybeSingle();
  if (!existant) throw new Error("Brouillon introuvable");
  if (existant.statut !== "brouillon") throw new Error("Seul un brouillon peut être modifié");

  const pdf = await genererPdfDer(params.contenu);
  const path = `der-modele/${Date.now()}_v${existant.version}.pdf`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw new Error(upErr.message);
  if (existant.storage_path) await supabase.storage.from(BUCKET).remove([existant.storage_path]);

  const { error } = await supabase
    .from("der_modele")
    .update({
      storage_path: path,
      contenu: params.contenu as unknown as Database["public"]["Tables"]["der_modele"]["Update"]["contenu"],
      updated_by: params.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Validation humaine : le brouillon devient la version active, l'ancienne est archivée. */
export async function validerEtActiverDerModele(
  supabase: Client,
  params: { id: string; userId: string | null },
) {
  const { data: brouillon } = await supabase
    .from("der_modele")
    .select("id, statut")
    .eq("id", params.id)
    .maybeSingle();
  if (!brouillon) throw new Error("Version introuvable");
  if (brouillon.statut !== "brouillon") throw new Error("Cette version n'est pas un brouillon");

  await supabase
    .from("der_modele")
    .update({ actif: false, statut: "archive" })
    .eq("actif", true);

  const { error } = await supabase
    .from("der_modele")
    .update({
      actif: true,
      statut: "valide_actif",
      obsolete: false,
      obsolete_motif: null,
      obsolete_le: null,
      valide_par: params.userId,
      valide_le: new Date().toISOString(),
      updated_by: params.userId,
    })
    .eq("id", params.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
