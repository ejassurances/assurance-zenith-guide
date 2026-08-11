import type { SupabaseClient } from "@supabase/supabase-js";
import { CRM_WEBHOOK_URL, type CrmWebhookPayload } from "./crm-webhook.config";

const CLIENT_FIELDS =
  "id,reference,civilite,prenom,nom,email,mobile,ville,code_postal,statut,origine,marque,besoins,dda_statut,conformite_score,conformite_niveau,created_at";

/** Construit la charge utile envoyée au webhook pour un client donné. */
export async function buildClientPayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  clientId: string,
  event: string,
): Promise<CrmWebhookPayload> {
  const { data, error } = await client.from("clients").select(CLIENT_FIELDS).eq("id", clientId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Client introuvable");
  return {
    source: "ej-partners-crm",
    event,
    sent_at: new Date().toISOString(),
    client: { ...data, besoins: data.besoins ?? [] } as CrmWebhookPayload["client"],
  };
}

/** Envoie la charge utile au webhook Google Apps Script. */
export async function postToCrmWebhook(payload: CrmWebhookPayload) {
  const res = await fetch(CRM_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, response: text.slice(0, 500) };
}
