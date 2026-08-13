import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { SITE } from "@/lib/site";
import { appUrl } from "@/lib/app-url";

/**
 * Création + envoi de la lettre de mission — logique partagée entre l'envoi
 * manuel (bouton dossier) et le déclenchement automatique post-recueil.
 */
export async function envoyerLettreMission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
  userId: string,
  origin: string,
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
    genere_le: new Date().toISOString(),
  };

  const hash = createHash("sha256").update(JSON.stringify(contenu)).digest("hex");

  // Une seule lettre « vivante » par dossier
  const { data: existing } = await supabase
    .from("lettres_mission")
    .select("id, statut")
    .eq("dossier_id", dossierId)
    .neq("statut", "annulee")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let lettreId: string;
  if (existing && existing.statut !== "signee") {
    const { error: upErr } = await supabase
      .from("lettres_mission")
      .update({
        contenu,
        document_hash: hash,
        type_assurance: d.type_assurance,
        client_id: d.client_id,
        email_destinataire: d.client_email,
        envoye_le: new Date().toISOString(),
        envoye_par: userId,
        statut: "envoyee",
      })
      .eq("id", existing.id);
    if (upErr) throw new Error(upErr.message);
    lettreId = existing.id;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("lettres_mission")
      .insert({
        dossier_id: dossierId,
        client_id: d.client_id,
        type_assurance: d.type_assurance,
        contenu,
        document_hash: hash,
        statut: "envoyee",
        email_destinataire: d.client_email,
        envoye_le: new Date().toISOString(),
        envoye_par: userId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Erreur création lettre");
    lettreId = inserted.id;
  }

  const result = await sendTemplateEmail("lettre-mission-envoi", d.client_email, {
    templateData: {
      clientName: d.client_nom,
      cabinetName: SITE.shortName,
      reference: d.reference,
      link: appUrl("/espace/signer-lettre-mission"),
    },
    replyTo: SITE.email,
  });
  if (!result.sent) throw new Error("Adresse en liste de suppression — envoi refusé");

  // Statut du dossier : lettre envoyée, en attente de signature
  await supabase.from("dossiers").update({ statut: "lettre_mission_envoyee" }).eq("id", dossierId);
  if (d.client_id) {
    await supabase.from("clients").update({ dda_statut: "en_attente_signature" }).eq("id", d.client_id);
  }

  return { id: lettreId };
}
