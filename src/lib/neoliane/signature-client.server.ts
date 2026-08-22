/**
 * Signature des documents de souscription Néoliane par le client, depuis son
 * espace — SERVEUR UNIQUEMENT.
 *
 * L'EZ API n'accepte que la finalisation `handSign` : la signature
 * électronique est produite par le cabinet. Le client trace son paraphe dans
 * son espace, le serveur l'appose aux emplacements fournis par Néoliane
 * (BA, SEPA, mandat de résiliation), dépose les PDF signés puis valide
 * l'offre. Aucun PDF n'est stocké : tout transite en mémoire.
 */

import { appUrl } from "@/lib/app-url";
import { SITE } from "@/lib/site";

import { messageTechnique } from "./redaction";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;

export type CleDocument = "BA" | "SEPA" | "RESILIATION";

const LIBELLE: Record<CleDocument, string> = {
  BA: "Bulletin d'adhésion",
  SEPA: "Mandat de prélèvement SEPA",
  RESILIATION: "Mandat de résiliation",
};

export interface DocumentASignerClient {
  contractId: string;
  cle: CleDocument;
  libelle: string;
  /** PDF prérempli (Base64) pour l'aperçu dans l'espace client. */
  pdf_base64: string;
  /** Membres attendus aux emplacements de signature (`holder`, `spouse`, …). */
  signataires: string[];
}

/** URL de l'écran de signature côté client. */
export const LIEN_SIGNATURE = "/espace/signer-souscription";

/**
 * Récupère les documents préremplis chez Néoliane et les met en forme pour
 * l'espace client. Verrouille l'offre (`handSign`) si nécessaire.
 */
export async function documentsPourClient(
  sb: Sb,
  parcoursId: string,
): Promise<DocumentASignerClient[]> {
  const { chargerParcours, documentsASigner, finaliser } = await import("./parcours.server");
  const p = await chargerParcours(sb, parcoursId);
  if (!p.offer_id) throw new Error("Aucune offre Néoliane à signer.");

  const rangs = ["profil", "tarifs", "panier", "offre", "finalisation"];
  if (rangs.indexOf(p.etape) >= 0 && rangs.indexOf(p.etape) < rangs.indexOf("finalisation")) {
    await finaliser(sb, parcoursId, "handSign");
  }

  const bruts = (await documentsASigner(sb, parcoursId)) as unknown;
  if (!Array.isArray(bruts) || bruts.length === 0) {
    throw new Error("Néoliane n'a retourné aucun document à signer.");
  }

  const sortie: DocumentASignerClient[] = [];
  for (const brut of bruts as Record<string, any>[]) {
    for (const cle of ["BA", "SEPA", "RESILIATION"] as CleDocument[]) {
      const pdf = brut[cle];
      if (typeof pdf !== "string" || pdf.length < 100) continue;
      const positions = (brut[`${cle}signPositions`] ?? {}) as Record<string, unknown>;
      sortie.push({
        contractId: String(brut["contractId"] ?? ""),
        cle,
        libelle: LIBELLE[cle],
        pdf_base64: pdf,
        signataires: Object.keys(positions),
      });
    }
  }
  return sortie;
}

/**
 * Ouvre la signature au client : marque le parcours « demandée » et notifie
 * le client par email avec le lien vers son espace.
 */
export async function demanderSignatureClient(
  sb: Sb,
  parcoursId: string,
): Promise<{ ok: true; destinataire: string | null }> {
  const { chargerParcours } = await import("./parcours.server");
  const p = await chargerParcours(sb, parcoursId);
  if (!p.offer_id) throw new Error("Aucune offre Néoliane : complétez la souscription d'abord.");
  if (!p.client_id) throw new Error("Ce parcours n'est rattaché à aucun client.");

  // Les documents doivent exister chez Néoliane avant d'inviter le client.
  await documentsPourClient(sb, parcoursId);

  const { data: client } = await sb
    .from("clients")
    .select("id, email, nom, prenom, user_id")
    .eq("id", p.client_id)
    .maybeSingle();
  if (!client?.user_id) {
    throw new Error("Le client n'a pas encore d'espace en ligne : créez son accès avant l'envoi.");
  }

  await sb
    .from("neoliane_parcours")
    .update({
      signature_client_statut: "demandee",
      signature_demandee_le: new Date().toISOString(),
      signature_erreur: null,
    })
    .eq("id", parcoursId);

  const destinataire = (client.email as string | null) ?? null;
  if (destinataire) {
    const nom = [client.prenom, client.nom].filter(Boolean).join(" ").trim();
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("souscription-signature-client", destinataire, {
        templateData: {
          clientName: nom,
          cabinetName: SITE.shortName,
          link: appUrl(LIEN_SIGNATURE),
        },
        brevoParams: {
          PRENOM: String(client.prenom ?? nom),
          LIEN_ACTION: appUrl(LIEN_SIGNATURE),
        },
        replyTo: SITE.email,
        liens: { client_id: (client as any).id ?? null },
      });
    } catch (e) {
      // L'invitation reste utilisable dans l'espace client : on trace sans bloquer.
      console.error("[neoliane] email de signature non expédié", e);
    }
  }

  return { ok: true, destinataire };
}

/**
 * Signature effective : apposition des paraphes, dépôt chez Néoliane et
 * validation. Tout échec de dépôt ou de validation crée une tâche admin
 * décrivant l'erreur technique retournée par l'API (jamais d'échec muet).
 */
export async function signerSouscription(
  sb: Sb,
  parcoursId: string,
  paraphes: Record<string, string>,
  preuve: { signataire: string; ip?: string | null; ua?: string | null; origine: "client" | "staff" },
) {
  const { chargerParcours, signerElectroniquement } = await import("./parcours.server");
  const p = await chargerParcours(sb, parcoursId);

  try {
    const res = await signerElectroniquement(sb, parcoursId, paraphes, {
      signataire: preuve.signataire,
      ip: preuve.ip ?? null,
    });

    await sb
      .from("neoliane_parcours")
      .update({
        signature_client_statut: res.ok ? "signee" : "echec_depot",
        signature_client_le: new Date().toISOString(),
        signature_client_ip: preuve.ip ?? null,
        signature_client_ua: preuve.ua ?? null,
        signature_signataire: preuve.signataire,
        signature_jeton: res.jeton,
        signature_erreur: res.ok
          ? null
          : JSON.stringify(res.validation.erreurs ?? "validation refusée").slice(0, 1000),
      })
      .eq("id", parcoursId);

    if (res.ok) await avancerDossier(sb, p);

    if (!res.ok) {
      await tacheEchec(
        p,
        preuve,
        `Validation refusée par Néoliane : ${JSON.stringify(res.validation.erreurs ?? null).slice(0, 1500)}`,
      );
    }

    return {
      ok: res.ok,
      jeton: res.jeton,
      horodatage: res.horodatage,
      journal: res.journal,
      validation: res.validation,
    };
  } catch (e) {
    const detail = messageTechnique(e instanceof Error ? e.message : String(e), 1500);
    await sb
      .from("neoliane_parcours")
      .update({
        signature_client_statut: "echec_depot",
        signature_client_le: new Date().toISOString(),
        signature_client_ip: preuve.ip ?? null,
        signature_client_ua: preuve.ua ?? null,
        signature_signataire: preuve.signataire,
        signature_erreur: detail.slice(0, 1000),
      })
      .eq("id", parcoursId);
    await tacheEchec(p, preuve, detail);
    throw new Error(
      "Votre signature a bien été enregistrée mais son dépôt auprès de l'assureur a échoué. Le cabinet a été alerté et revient vers vous.",
    );
  }
}

/** Tâche admin détaillant l'échec technique du dépôt. */
async function tacheEchec(
  p: { id: string; client_id: string | null; offer_id: string | null; contract_ids: string[] },
  preuve: { signataire: string; origine: "client" | "staff" },
  detail: string,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { creerTacheAdmin } = await import("@/lib/agent-taches.server");
    await creerTacheAdmin(supabaseAdmin as never, {
      titre: "Néoliane — dépôt du document signé refusé",
      description: [
        `Signature ${preuve.origine === "client" ? "client" : "cabinet"} par ${preuve.signataire}.`,
        `Parcours : ${p.id}`,
        `Offre Néoliane : ${p.offer_id ?? "—"}`,
        `Contrat(s) : ${(p.contract_ids ?? []).join(", ") || "—"}`,
        "",
        "Erreur technique retournée par l'API :",
        detail,
        "",
        "À faire : vérifier les emplacements de signature (page/coordonnées) et le format des documents, puis relancer le dépôt depuis la console Néoliane.",
      ].join("\n"),
      client_id: p.client_id ?? null,
      priorite: "haute",
    });
  } catch (e) {
    console.error("[neoliane] tâche d'échec de dépôt non créée", e);
  }
}

/** Avance le dossier lié au parcours à l'étape « contrat validé ». */
async function avancerDossier(sb: Sb, p: { dossier_id?: string | null }) {
  const dossierId = p.dossier_id ?? null;
  if (!dossierId) return;
  try {
    const { data } = await sb.from("dossiers").select("statut").eq("id", dossierId).maybeSingle();
    const ancienne = (data?.statut as string | null) ?? null;
    if (ancienne === "contrat_valide" || ancienne === "contrat_actif" || ancienne === "cloture") return;
    await sb
      .from("dossiers")
      .update({ statut: "contrat_valide", updated_at: new Date().toISOString() })
      .eq("id", dossierId);
    await sb.from("dossier_etapes_historique").insert({
      dossier_id: dossierId,
      ancienne_etape: ancienne,
      nouvelle_etape: "contrat_valide",
      commentaire: "Documents de souscription signés par le client et transmis à l'assureur",
    });
  } catch (e) {
    console.error("[neoliane] pipeline non avancé", e);
  }
}
