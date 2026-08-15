import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { messageTechnique, reduireReponseNeoliane } from "@/lib/neoliane/redaction";

/**
 * Webhook EZ Gestion Néoliane (§9). Appelé par Néoliane sur les événements
 * `contract` et `contractDemarche`.
 *
 * Sécurité : la route est publique (caller externe) mais exige un secret partagé
 * transmis en en-tête `x-neoliane-signature` (ou en paramètre `token`) —
 * NEOLIANE_WEBHOOK_SECRET. Le traitement est idempotent : l'état réel est
 * toujours rechargé depuis Néoliane via `refreshUrl` / `/contract/{id}`.
 */

const payloadSchema = z.object({
  eventName: z.string().optional(),
  event: z.string().optional(),
  /** Format réel documenté : identifiant de l'objet modifié. */
  modifiedObjectId: z.union([z.string(), z.number()]).optional(),
  contractId: z.union([z.string(), z.number()]).optional(),
  demarcheId: z.union([z.string(), z.number()]).optional(),
  id: z.union([z.string(), z.number()]).optional(),
  /** `regularisation-instance` pour les événements contractDemarche. */
  type: z.string().optional(),
  message: z.string().optional(),
  refreshUrl: z.string().optional(),
});

export const Route = createFileRoute("/api/public/webhooks/neoliane")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = (process.env["NEOLIANE_WEBHOOK_SECRET"] ?? "").trim();
        const fourni =
          request.headers.get("x-neoliane-signature") ??
          new URL(request.url).searchParams.get("token") ??
          "";
        if (!secret || fourni !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const brut = await request.text();
        let parsed: unknown = null;
        try {
          parsed = brut ? JSON.parse(brut) : {};
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const p = payloadSchema.safeParse(parsed);
        if (!p.success) return new Response("Invalid payload", { status: 400 });

        const eventName = p.data.eventName ?? p.data.event ?? "contract";
        // Sur `contractDemarche`, `modifiedObjectId` est l'identifiant de la
        // démarche et `contractId` celui du contrat porteur.
        const objetModifie = p.data.modifiedObjectId ?? p.data.id;
        const demarcheId =
          p.data.demarcheId ?? (eventName === "contractDemarche" ? objetModifie : undefined);
        const contractId =
          eventName === "contractDemarche" ? p.data.contractId : (p.data.contractId ?? objetModifie);
        const ressourceId = demarcheId ?? contractId ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Rechargement de l'état réel (idempotent) : la notification n'est
        // jamais considérée comme source de vérité.
        let etat: unknown = null;
        let erreur: string | null = null;
        try {
          const api = await import("@/lib/neoliane/api.server");
          if (contractId) etat = await api.rafraichirContrat(String(contractId));
          else if (demarcheId) etat = await api.rafraichirDemarche(String(demarcheId));
        } catch (e) {
          erreur = messageTechnique((e as Error).message);
        }

        await supabaseAdmin.from("neoliane_evenements").insert({
          event_name: eventName,
          ressource_id: ressourceId === null ? null : String(ressourceId),
          refresh_url: p.data.refreshUrl ?? null,
          // Minimisation RGPD : seuls les identifiants techniques sont conservés.
          payload: reduireReponseNeoliane(parsed) as never,
          etat_rafraichi: reduireReponseNeoliane(etat) as never,
          traite: !erreur,
          erreur,
        });

        // Toujours 200 : Néoliane ne doit pas rejouer indéfiniment ; les échecs
        // techniques restent consultables dans le journal interne.
        return Response.json({ received: true, refreshed: !erreur });
      },
    },
  },
});
