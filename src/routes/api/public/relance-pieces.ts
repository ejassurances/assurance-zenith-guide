import { createFileRoute } from "@tanstack/react-router";
import { appUrl } from "@/lib/app-url";

/**
 * Relance automatique J+2 : envoie un e-mail aux clients dont le dossier
 * comporte encore des pièces obligatoires manquantes, 2 jours après la
 * création du dossier (puis au maximum une fois tous les 2 jours).
 *
 * À appeler par un planificateur (1×/jour) avec l'en-tête
 * `x-relance-token: <RELANCE_PIECES_TOKEN>`.
 */
export const Route = createFileRoute("/api/public/relance-pieces")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["RELANCE_PIECES_TOKEN"];
        if (!token || request.headers.get("x-relance-token") !== token) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const origin = new URL(request.url).origin;

        const seuil = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();

        const { data: dossiers, error } = await supabaseAdmin
          .from("dossiers")
          .select("id, reference, client_nom, client_email, created_at, relance_pieces_envoyee_le")
          .not("client_email", "is", null)
          .in("statut", ["nouveau", "en_cours"])
          .lte("created_at", seuil)
          .limit(200);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        let envoyes = 0;
        const details: { dossier: string; pieces: number; sent: boolean }[] = [];

        for (const d of dossiers ?? []) {
          if (d.relance_pieces_envoyee_le && d.relance_pieces_envoyee_le > seuil) continue;

          const { data: pieces } = await supabaseAdmin
            .from("dossier_pieces_requises")
            .select("libelle")
            .eq("dossier_id", d.id)
            .eq("obligatoire", true)
            .eq("statut", "manquante");

          if (!pieces || pieces.length === 0) continue;

          let sent = false;
          try {
            const res = await sendTemplateEmail("pieces-manquantes", d.client_email!, {
              templateData: {
                clientName: d.client_nom,
                reference: d.reference,
                pieces: pieces.map((p) => p.libelle),
                link: appUrl("/espace/mon-espace"),
              },
              idempotencyKey: `relance-pieces-${d.id}-${new Date().toISOString().slice(0, 10)}`,
            });
            sent = res.sent;
          } catch {
            sent = false;
          }

          await supabaseAdmin
            .from("dossiers")
            .update({ relance_pieces_envoyee_le: new Date().toISOString() })
            .eq("id", d.id);

          if (sent) envoyes += 1;
          details.push({ dossier: d.reference, pieces: pieces.length, sent });
        }

        return Response.json({ ok: true, envoyes, details });
      },
    },
  },
});
