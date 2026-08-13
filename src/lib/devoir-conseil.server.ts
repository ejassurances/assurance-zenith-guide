import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { SITE } from "@/lib/site";
import { appUrl } from "@/lib/app-url";
import { modeleDevoirConseil, prefillDevoirConseil } from "@/lib/devoir-conseil-modeles";

export type DevoirConseilSaisie = {
  recommandation: string;
  motifs: string;
  mises_en_garde?: string;
  compagnie?: string;
  produit?: string;
  cotisation_mensuelle?: number | null;
  economie_estimee?: number | null;
  garanties?: string;
  exigences_client?: string;
};

/**
 * Génère (ou met à jour) le devoir de conseil natif du dossier et l'envoie
 * au client pour acceptation ou refus.
 */
export async function envoyerDevoirConseil(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
  userId: string,
  saisie: DevoirConseilSaisie,
) {
  const { data: dossier, error: dErr } = await supabase
    .from("dossiers")
    .select("*")
    .eq("id", dossierId)
    .maybeSingle();
  if (dErr || !dossier) throw new Error("Dossier introuvable ou accès refusé");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = dossier as any;
  if (!d.client_email) throw new Error("Le dossier n'a pas d'email client — renseignez-le d'abord.");

  const modele = modeleDevoirConseil(d.type_assurance);


  const contenu = {
    cabinet: {
      nom: SITE.name,
      shortName: SITE.shortName,
      siret: SITE.siret,
      orias: SITE.orias,
      adresse: SITE.address,
      telephone: SITE.phone,
      email: SITE.email,
    },
    client: {
      nom: d.client_nom,
      email: d.client_email,
      telephone: d.client_phone,
    },
    dossier: {
      reference: d.reference,
      type_assurance: d.type_assurance,
    },
    recueil_besoins: d.recueil_besoins ?? {},
    conseil: saisie,
    modele: modele.branche,
    modele_libelle: modele.libelle,
    mentions_legales: modele.mentionsLegales,
    genere_le: new Date().toISOString(),
  };

  const hash = createHash("sha256").update(JSON.stringify(contenu)).digest("hex");

  const { data: existing } = await supabase
    .from("devoirs_conseil")
    .select("id, statut")
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commun = {
    client_id: d.client_id,
    type_assurance: d.type_assurance,
    contenu,
    hash,
    recommandation: saisie.recommandation,
    motifs: saisie.motifs,
    mises_en_garde: saisie.mises_en_garde ?? null,
    statut: "envoye",
    email_destinataire: d.client_email,
    envoye_le: new Date().toISOString(),
    refus_motif: null,
    refuse_le: null,
  };

  let devoirId: string;
  if (existing && existing.statut !== "signe") {
    const { error: upErr } = await supabase.from("devoirs_conseil").update(commun).eq("id", existing.id);
    if (upErr) throw new Error(upErr.message);
    devoirId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("devoirs_conseil")
      .insert({ ...commun, dossier_id: dossierId, created_by: userId })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Erreur création du devoir de conseil");
    devoirId = inserted.id;
  }

  const result = await sendTemplateEmail("devoir-conseil-envoi", d.client_email, {
    templateData: {
      clientName: d.client_nom,
      cabinetName: SITE.shortName,
      reference: d.reference,
      link: appUrl("/espace/signer-devoir-conseil"),
    },
    replyTo: SITE.email,
  });
  if (!result.sent) throw new Error("Adresse en liste de suppression — envoi refusé");

  await supabase.from("dossiers").update({ statut: "devoir_conseil_envoye" }).eq("id", dossierId);
  await supabase.from("dossier_etapes_historique").insert({
    dossier_id: dossierId,
    nouvelle_etape: "devoir_conseil_envoye",
    commentaire: "Devoir de conseil généré et envoyé au client",
    par: userId,
  });

  return { id: devoirId, hash };
}
