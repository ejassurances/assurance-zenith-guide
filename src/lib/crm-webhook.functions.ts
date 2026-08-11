import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Pousse une fiche client vers le webhook Google Apps Script. */
export const syncClientToWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client_id: string; event?: string }) => {
    if (!input?.client_id) throw new Error("client_id requis");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { buildClientPayload, postToCrmWebhook } = await import("./crm-webhook.server");
    const payload = await buildClientPayload(context.supabase, data.client_id, data.event ?? "client.sync");
    const res = await postToCrmWebhook(payload);
    if (!res.ok) throw new Error(`Webhook ${res.status} : ${res.response}`);
    return { ok: true, status: res.status, response: res.response };
  });
