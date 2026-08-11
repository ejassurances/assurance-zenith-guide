import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Réception des données CRM depuis Google Apps Script.
 * Sécurité : en-tête `x-crm-token` devant correspondre au secret CRM_WEBHOOK_TOKEN.
 */
const schema = z.object({
  nom: z.string().min(1),
  prenom: z.string().optional(),
  civilite: z.string().optional(),
  email: z.string().email().optional(),
  mobile: z.string().optional(),
  ville: z.string().optional(),
  code_postal: z.string().optional(),
  marque: z.enum(["ej_assurances", "ej_coparentalite"]).optional(),
  besoins: z.array(z.string()).optional(),
  origine: z.enum(["internet", "assurlead", "telephone", "apporteur", "reseau", "autre"]).optional(),
  remarque: z.string().optional(),
});

export const Route = createFileRoute("/api/public/webhooks/crm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRM_WEBHOOK_TOKEN"];
        if (!expected) return new Response("Webhook non configuré", { status: 503 });
        if (request.headers.get("x-crm-token") !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("JSON invalide", { status: 400 });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const p = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let existingId: string | null = null;
        if (p.email) {
          const { data } = await supabaseAdmin.from("clients").select("id").eq("email", p.email).maybeSingle();
          existingId = data?.id ?? null;
        }

        const values = {
          civilite: p.civilite ?? null,
          prenom: p.prenom ?? null,
          nom: p.nom,
          email: p.email ?? null,
          mobile: p.mobile ?? null,
          ville: p.ville ?? null,
          code_postal: p.code_postal ?? null,
          marque: p.marque ?? "ej_assurances",
          besoins: p.besoins ?? [],
          origine: p.origine ?? "internet",
          remarque: p.remarque ?? null,
        };

        let clientId = existingId;
        if (existingId) {
          const { error } = await supabaseAdmin.from("clients").update(values).eq("id", existingId);
          if (error) return new Response(error.message, { status: 500 });
        } else {
          const { data, error } = await supabaseAdmin
            .from("clients")
            .insert({ ...values, statut: "prospect" })
            .select("id")
            .single();
          if (error) return new Response(error.message, { status: 500 });
          clientId = data.id;
        }

        if (clientId) {
          await supabaseAdmin.from("activites").insert({
            client_id: clientId,
            type: "systeme",
            titre: existingId ? "Fiche mise à jour via webhook" : "Fiche créée via webhook",
            contenu: `Source : Google Apps Script · marque ${values.marque}`,
          });
        }

        return new Response(JSON.stringify({ ok: true, client_id: clientId, updated: Boolean(existingId) }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
