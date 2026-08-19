import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { SITE } from "@/lib/site";

const NOTE_RECONSTITUE = "Dossier reconstitué a posteriori";

/**
 * E-mail d'introduction « mise en place de l'espace client », envoyé une seule
 * fois, juste avant l'envoi du DER / de la lettre de mission, aux assurés dont
 * le dossier a été reconstitué a posteriori.
 *
 * Ne s'envoie pas si une lettre de mission a déjà été adressée pour ce dossier
 * (assurés déjà traités sans ce message introductif).
 */
export async function envoyerIntroEspaceClientSiReconstitue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dossier: any,
): Promise<{ sent: boolean; reason?: string }> {
  const notes: string = dossier?.notes ?? "";
  if (!notes.includes(NOTE_RECONSTITUE)) return { sent: false, reason: "dossier_non_reconstitue" };

  const email: string | null = dossier?.client_email ?? null;
  if (!email) return { sent: false, reason: "email_manquant" };

  // Déjà destinataire d'une lettre de mission sur ce dossier → pas de rattrapage
  const { data: lettre } = await supabase
    .from("lettres_mission")
    .select("id")
    .eq("dossier_id", dossier.id)
    .neq("statut", "annulee")
    .limit(1)
    .maybeSingle();
  if (lettre) return { sent: false, reason: "deja_traite" };

  // Idempotence : une seule fois par dossier
  if (dossier.client_id) {
    const { data: dejaEnvoye } = await supabase
      .from("activites")
      .select("id")
      .eq("client_id", dossier.client_id)
      .eq("titre", "E-mail de mise en place de l'espace client envoyé")
      .limit(1)
      .maybeSingle();
    if (dejaEnvoye) return { sent: false, reason: "deja_envoye" };
  }

  const prenom = String(dossier.client_nom ?? "").trim().split(/\s+/)[0] ?? "";

  try {
    const res = await sendTemplateEmail("espace-client-mise-en-place", email, {
      templateData: { prenom },
      replyTo: SITE.email,
      idempotencyKey: `espace-client-intro-${dossier.id}`,
    });
    if (!res.sent) return { sent: false, reason: "recipient_suppressed" };
  } catch (e) {
    console.error("[email] intro espace client non envoyée", dossier.id, e);
    return { sent: false, reason: e instanceof Error ? e.message : "erreur_inconnue" };
  }

  if (dossier.client_id) {
    await supabase
      .from("activites")
      .insert({
        client_id: dossier.client_id,
        type: "email",
        titre: "E-mail de mise en place de l'espace client envoyé",
        contenu: `Destinataire : ${email}\nDossier reconstitué a posteriori — envoyé avant le DER / la lettre de mission.`,
      })
      .then(
        () => undefined,
        (err: unknown) => console.error("[email] trace intro espace client non enregistrée", err),
      );
  }

  return { sent: true };
}
