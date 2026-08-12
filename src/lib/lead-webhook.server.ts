/**
 * Transfert des demandes publiques (contact / simulateur) vers le webhook
 * Google Apps Script du cabinet.
 */
import { CRM_WEBHOOK_URL } from "./crm-webhook.config";

export type LeadWebhookAttachment = {
  nom: string;
  type: string | null;
  taille: number | null;
  contenu_base64: string | null;
};

export type LeadWebhookPayload = {
  source: "EJ Assurances" | "EJ Partners";
  formulaire: "contact" | "simulateur";
  envoye_le: string;
  client_id: string | null;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  type_besoin: string | null;
  message: string | null;
  simulation: Record<string, unknown> | null;
  pieces_jointes: LeadWebhookAttachment[];
};

/** Déduit la marque d'origine à partir du type de besoin. */
export function resolveLeadSource(typeBesoin: string | null | undefined): LeadWebhookPayload["source"] {
  const v = (typeBesoin ?? "").toLowerCase();
  return v.includes("coparent") || v.includes("transmission") ? "EJ Partners" : "EJ Assurances";
}

export async function postLeadToWebhook(
  payload: LeadWebhookPayload,
): Promise<{ ok: boolean; status: number; response: string }> {
  try {
    const res = await fetch(CRM_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    return { ok: res.ok, status: res.status, response: (await res.text()).slice(0, 500) };
  } catch (err) {
    return { ok: false, status: 0, response: err instanceof Error ? err.message : "Erreur réseau" };
  }
}
