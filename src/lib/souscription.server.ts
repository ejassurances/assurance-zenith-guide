import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { labelForBranche } from "@/lib/recueil-besoins-schemas";

/** Délais de relance automatique de la compagnie (en jours après l'envoi). */
export const RELANCES_SOUSCRIPTION_JOURS = [3, 7];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function contexteDossier(supabase: Admin, dossierId: string): Promise<any> {
  const { data, error } = await supabase
    .from("dossiers")
    .select(
      "id, reference, client_nom, client_email, client_id, type_assurance, statut, created_by, souscription_email_compagnie, souscription_envoyee_le, souscription_relances_nb, compagnie_id, produit_id, compagnies:compagnie_id(nom, contact_email), produits:produit_id(nom)",
    )
    .eq("id", dossierId)
    .maybeSingle();
  if (error || !data) throw new Error("Dossier introuvable");
  return data;
}

function emailCompagnie(dossier: {
  souscription_email_compagnie?: string | null;
  compagnies?: { contact_email?: string | null } | null;
}) {
  return dossier.souscription_email_compagnie || dossier.compagnies?.contact_email || null;
}

/**
 * Envoi du dossier de souscription à la compagnie + tâche de suivi.
 * Appelé au passage à l'étape « souscription envoyée ».
 */
export async function envoyerSouscriptionCompagnie(
  supabase: Admin,
  dossierId: string,
  userId: string | null,
  options: { email?: string | null; commentaire?: string | null } = {},
) {
  const d = await contexteDossier(supabase, dossierId);
  const destinataire = options.email || emailCompagnie(d);
  if (!destinataire) {
    throw new Error(
      "Aucune adresse de souscription connue pour cette compagnie : renseignez l'email de contact sur la fiche compagnie.",
    );
  }

  let envoye = false;
  try {
    const res = await sendTemplateEmail("souscription-compagnie", destinataire, {
      templateData: {
        compagnieName: d.compagnies?.nom ?? "",
        reference: d.reference,
        clientName: d.client_nom,
        produit: d.produits?.nom ?? "",
        branche: labelForBranche(d.type_assurance),
        commentaire: options.commentaire ?? "",
      },
      brevoParams: {
        NOM_COMPAGNIE: d.compagnies?.nom ?? "",
        NOM_PRODUIT: d.produits?.nom ?? "",
        TYPE_ASSURANCE: labelForBranche(d.type_assurance),
      },
      idempotencyKey: `souscription-${dossierId}`,
      replyTo: "contact@ej-assurances.fr",
    });
    envoye = res.sent;
  } catch (e) {
    throw new Error(
      `Envoi à la compagnie impossible : ${e instanceof Error ? e.message : "erreur d'expédition"}`,
    );
  }

  const maintenant = new Date().toISOString();
  await supabase
    .from("dossiers")
    .update({
      statut: "souscription_envoyee",
      souscription_email_compagnie: destinataire,
      souscription_envoyee_le: maintenant,
      souscription_relance_le: null,
      souscription_relances_nb: 0,
      souscription_retour_le: null,
    })
    .eq("id", dossierId);

  await supabase.from("dossier_etapes_historique").insert({
    dossier_id: dossierId,
    ancienne_etape: d.statut,
    nouvelle_etape: "souscription_envoyee",
    commentaire: `Dossier de souscription transmis à ${destinataire}${envoye ? "" : " (échec d'expédition)"}`,
    par: userId,
  });

  await supabase.from("taches").insert({
    client_id: d.client_id,
    titre: `Suivi souscription ${d.reference}`,
    description: `Attente du retour de ${d.compagnies?.nom ?? "la compagnie"} (${destinataire}). Relances automatiques à J+3 et J+7.`,
    echeance: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    priorite: "normale",
    statut: "a_faire",
    assignee_id: userId,
    created_by: userId,
  });

  return { ok: true, destinataire, envoye };
}

/**
 * Relance des compagnies sans retour : J+3 puis J+7 après l'envoi.
 * Idempotent — une relance au maximum par palier et par dossier.
 */
export async function relancerSouscriptionsEnAttente(supabase: Admin) {
  const { data: dossiers, error } = await supabase
    .from("dossiers")
    .select(
      "id, reference, client_nom, client_id, type_assurance, souscription_email_compagnie, souscription_envoyee_le, souscription_relances_nb, souscription_retour_le, created_by, compagnies:compagnie_id(nom, contact_email), produits:produit_id(nom)",
    )
    .eq("statut", "souscription_envoyee")
    .is("souscription_retour_le", null)
    .not("souscription_envoyee_le", "is", null)
    .limit(200);
  if (error) throw new Error(error.message);

  const details: { dossier: string; jours: number; envoye: boolean }[] = [];

  for (const d of dossiers ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dos = d as any;
    const envoyeLe = new Date(dos.souscription_envoyee_le).getTime();
    const jours = Math.floor((Date.now() - envoyeLe) / (24 * 3600 * 1000));
    const dejaFaites: number = dos.souscription_relances_nb ?? 0;
    const palier = RELANCES_SOUSCRIPTION_JOURS[dejaFaites];
    if (palier === undefined || jours < palier) continue;

    const destinataire = emailCompagnie(dos);
    if (!destinataire) continue;

    let envoye = false;
    try {
      const res = await sendTemplateEmail("souscription-relance-compagnie", destinataire, {
        templateData: {
          reference: dos.reference,
          clientName: dos.client_nom,
          produit: dos.produits?.nom ?? "",
          jours,
        },
        idempotencyKey: `souscription-relance-${dos.id}-${palier}`,
        replyTo: "contact@ej-assurances.fr",
      });
      envoye = res.sent;
    } catch {
      envoye = false;
    }

    await supabase
      .from("dossiers")
      .update({
        souscription_relance_le: new Date().toISOString(),
        souscription_relances_nb: dejaFaites + 1,
      })
      .eq("id", dos.id);

    await supabase.from("dossier_etapes_historique").insert({
      dossier_id: dos.id,
      ancienne_etape: "souscription_envoyee",
      nouvelle_etape: "souscription_envoyee",
      commentaire: `Relance automatique J+${palier} envoyée à ${destinataire}${envoye ? "" : " (échec d'expédition)"}`,
      par: null,
    });

    await supabase.from("taches").insert({
      client_id: dos.client_id,
      titre: `Relance compagnie J+${palier} — ${dos.reference}`,
      description: `Relance automatique envoyée à ${destinataire}. Sans retour, appeler le service souscription.`,
      echeance: new Date().toISOString().slice(0, 10),
      priorite: dejaFaites === 0 ? "normale" : "haute",
      statut: "a_faire",
      assignee_id: dos.created_by,
      created_by: dos.created_by,
    });

    details.push({ dossier: dos.reference, jours: palier, envoye });
  }

  return { ok: true, relances: details.length, details };
}
