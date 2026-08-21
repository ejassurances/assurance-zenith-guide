import type { SupabaseClient } from "@supabase/supabase-js";
import { genererPdfGelAvoirs, genererPdfRegistreDora, genererPdfRegistreRgpd } from "@/lib/registres-pdf.server";
import { construireFec } from "@/lib/fec.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

async function exigerStaff(supabase: Client, userId: string, adminSeul = false) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (adminSeul ? !roles.includes("admin") : !roles.includes("admin") && !roles.includes("mandataire")) {
    throw new Error("Accès réservé au cabinet.");
  }
  return roles;
}

const RESULTAT_LABEL: Record<string, string> = {
  aucune_correspondance: "Aucune correspondance sur les listes de gel des avoirs",
  correspondance_a_analyser: "Correspondance potentielle a analyser",
  correspondance_confirmee: "Correspondance confirmee - mesures de gel appliquees",
};

/** Contrôle « Gel des avoirs » horodaté + preuve PDF archivée dans 02_Recueil_et_Conformite. */
export async function enregistrerGelAvoirs(
  supabase: Client,
  params: {
    client_id: string;
    resultat: "aucune_correspondance" | "correspondance_a_analyser" | "correspondance_confirmee";
    observations: string | null;
    user_id: string;
  },
) {
  await exigerStaff(supabase, params.user_id);

  const [{ data: client, error }, { data: profil }, { data: risque }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, reference, nom, prenom, date_naissance")
      .eq("id", params.client_id)
      .maybeSingle(),
    supabase.from("profiles").select("full_name, email").eq("id", params.user_id).maybeSingle(),
    supabase
      .from("client_risque_lcbft")
      .select("score_risque, niveau_vigilance")
      .eq("client_id", params.client_id)
      .maybeSingle(),
  ]);
  if (error || !client) throw new Error(error?.message ?? "Client introuvable ou accès refusé.");

  const effectueLe = new Date().toISOString();
  const auteur = (profil as any)?.full_name ?? (profil as any)?.email ?? "Collaborateur du cabinet";
  const identite = [(client as any).nom, (client as any).prenom].filter(Boolean).join(" ");

  const { data: ligne, error: insErr } = await supabase
    .from("client_gel_avoirs")
    .insert({
      client_id: params.client_id,
      effectue: true,
      effectue_le: effectueLe,
      effectue_par: params.user_id,
      resultat: params.resultat,
      observations: params.observations,
    })
    .select("id")
    .single();
  if (insErr || !ligne) throw new Error(insErr?.message ?? "Enregistrement impossible.");

  let driveUrl: string | null = null;
  try {
    const pdf = await genererPdfGelAvoirs({
      reference_client: (client as any).reference ?? params.client_id.slice(0, 8),
      nom_client: identite,
      date_naissance: (client as any).date_naissance ?? null,
      effectue_le: effectueLe,
      effectue_par: auteur,
      resultat: RESULTAT_LABEL[params.resultat] ?? params.resultat,
      observations: params.observations,
      niveau_vigilance: (risque as any)?.niveau_vigilance ?? null,
      score_risque: (risque as any)?.score_risque ?? null,
    });
    const { archiverPdfSurDrive } = await import("@/lib/drive-arborescence.server");
    const archive = await archiverPdfSurDrive(supabase, {
      client_id: params.client_id,
      sous_dossier: "02_Recueil_et_Conformite",
      nom_fichier: `gel-avoirs-${(client as any).reference ?? params.client_id.slice(0, 8)}-${effectueLe.slice(0, 10)}.pdf`,
      pdf,
    });
    if (archive.ok) {
      driveUrl = archive.url ?? null;
      await supabase
        .from("client_gel_avoirs")
        .update({ drive_file_id: archive.file_id, drive_url: driveUrl })
        .eq("id", (ligne as any).id);
    }
  } catch (e) {
    console.error("[gel-avoirs] preuve Drive non archivée", params.client_id, e);
  }

  return { ok: true as const, id: (ligne as any).id, effectue_le: effectueLe, drive_url: driveUrl };
}

async function archiverRegistre(supabase: Client, nomFichier: string, pdf: Uint8Array) {
  try {
    const { assurerChemin, deposerFichier, urlFichierDrive } = await import("@/lib/google-drive.server");
    const { DRIVE_REGISTRE_DDA } = await import("@/lib/drive-arborescence.server");
    const dossier = await assurerChemin(DRIVE_REGISTRE_DDA);
    const depot = await deposerFichier({ folderId: dossier, nom: nomFichier, contenu: pdf });
    return depot.webViewLink ?? urlFichierDrive(depot.id);
  } catch (e) {
    console.error("[registres] archivage Drive impossible", nomFichier, e);
    return null;
  }
}

function base64(pdf: Uint8Array) {
  let binaire = "";
  for (const octet of pdf) binaire += String.fromCharCode(octet);
  return btoa(binaire);
}

/** Registre RGPD (art. 30) : PDF téléchargeable + archivage au registre DDA/ACPR. */
export async function exporterRegistreRgpd(supabase: Client, userId: string) {
  await exigerStaff(supabase, userId);
  const { data } = await supabase
    .from("registre_traitements_rgpd")
    .select("*")
    .order("created_at", { ascending: true });
  const pdf = await genererPdfRegistreRgpd((data ?? []) as never);
  const nom = `registre-rgpd-art30-${new Date().toISOString().slice(0, 10)}.pdf`;
  const driveUrl = await archiverRegistre(supabase, nom, pdf);
  return { nom_fichier: nom, pdf_base64: base64(pdf), drive_url: driveUrl };
}

/** Registre DORA : PDF téléchargeable + archivage au registre DDA/ACPR. */
export async function exporterRegistreDora(supabase: Client, userId: string) {
  await exigerStaff(supabase, userId);
  const [{ data: systemes }, { data: incidents }] = await Promise.all([
    supabase.from("dora_systemes_tiers").select("*").order("criticite", { ascending: true }),
    supabase.from("dora_incidents").select("*").order("survenu_le", { ascending: false }),
  ]);
  const pdf = await genererPdfRegistreDora((systemes ?? []) as never, (incidents ?? []) as never);
  const nom = `registre-dora-${new Date().toISOString().slice(0, 10)}.pdf`;
  const driveUrl = await archiverRegistre(supabase, nom, pdf);
  return { nom_fichier: nom, pdf_base64: base64(pdf), drive_url: driveUrl };
}

/** Export FEC de l'exercice (réservé à la direction). */
export async function genererFec(
  supabase: Client,
  params: { date_debut: string; date_fin: string },
  userId: string,
) {
  await exigerStaff(supabase, userId, true);
  return construireFec(supabase, params);
}
