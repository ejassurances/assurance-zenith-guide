import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const leadSchema = z.object({
  source: z.enum(["contact", "simulateur"]),
  prenom: z.string().trim().min(1).max(80).optional().default(""),
  nom: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255).optional().nullable(),
  telephone: z.string().trim().max(40).optional().nullable(),
  sujet: z.string().trim().max(120).optional().nullable(),
  message: z.string().trim().max(4000).optional().nullable(),
  simulation: z
    .object({
      capital: z.number().nonnegative().max(100_000_000),
      duree_ans: z.number().int().min(1).max(40),
      age: z.number().int().min(18).max(90),
      fumeur: z.boolean(),
      economie_totale: z.number().nonnegative().max(10_000_000),
      economie_mensuelle: z.number().nonnegative().max(100_000),
    })
    .optional(),
  pieces_jointes: z
    .array(
      z.object({
        nom: z.string().trim().max(255),
        type: z.string().trim().max(120).optional().nullable(),
        taille: z.number().nonnegative().max(10_000_000).optional().nullable(),
        contenu_base64: z.string().max(7_000_000).optional().nullable(),
      }),
    )
    .max(5)
    .optional()
    .default([]),
  consent_contact: z.boolean(),
  consent_rgpd: z.boolean(),
});


function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const Route = createFileRoute("/api/public/leads")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders() });
        }
        const parsed = leadSchema.safeParse(payload);
        if (!parsed.success) {
          return Response.json(
            { error: "Validation", details: parsed.error.flatten() },
            { status: 400, headers: corsHeaders() },
          );
        }
        const d = parsed.data;
        if (!d.consent_contact || !d.consent_rgpd) {
          return Response.json({ error: "Consentements requis" }, { status: 400, headers: corsHeaders() });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Reuse an existing client for the same email (avoids duplicate cards
        // when a prospect submits both the contact form and the simulator).
        let clientId: string | null = null;
        if (d.email) {
          const { data: existing } = await supabaseAdmin
            .from("clients")
            .select("id")
            .eq("email", d.email)
            .maybeSingle();
          if (existing) clientId = existing.id;
        }

        if (!clientId) {
          const { data: inserted, error } = await supabaseAdmin
            .from("clients")
            .insert({
              prenom: d.prenom || null,
              nom: d.nom,
              email: d.email || null,
              mobile: d.telephone || null,
              statut: "prospect",
              origine: "internet",
              fumeur: d.simulation?.fumeur ?? null,
              etiquettes: [d.source === "simulateur" ? "simulateur" : "contact-web"],
            })
            .select("id")
            .single();
          if (error || !inserted) {
            return Response.json(
              { error: "Insertion impossible", detail: error?.message },
              { status: 500, headers: corsHeaders() },
            );
          }
          clientId = inserted.id;
        }

        // Journalise la demande dans l'historique du client.
        const titre =
          d.source === "simulateur" ? "Demande d'étude — simulateur emprunteur" : `Contact web${d.sujet ? ` — ${d.sujet}` : ""}`;
        const parts: string[] = [];
        if (d.simulation) {
          parts.push(
            `Simulation : capital ${d.simulation.capital} € · ${d.simulation.duree_ans} ans · ${d.simulation.age} ans${d.simulation.fumeur ? " · fumeur" : ""}`,
            `Économie estimée : ${Math.round(d.simulation.economie_totale)} € (soit ~${Math.round(d.simulation.economie_mensuelle)} €/mois)`,
          );
        }
        if (d.message) parts.push(`Message :\n${d.message}`);
        if (d.telephone) parts.push(`Téléphone : ${d.telephone}`);
        parts.push(`Consentement recontact : oui`, `RGPD acceptée : oui`);

        await supabaseAdmin.from("activites").insert({
          client_id: clientId,
          type: "note",
          titre,
          contenu: parts.join("\n"),
        });

        // Création automatique du compte client + invitation email + tâche admin
        let inviteSent = false;
        if (d.email) {
          try {
            // Vérifier si un utilisateur existe déjà avec cet email
            const { data: existingUser } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .eq("email", d.email)
              .maybeSingle();

            let userId: string | null = existingUser?.id ?? null;

            if (!userId) {
              const origin = new URL(request.url).origin;
              const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
                d.email,
                {
                  data: { full_name: `${d.prenom || ""} ${d.nom}`.trim() },
                  redirectTo: `${origin}/reset-password`,
                },
              );
              if (!inviteErr && invited.user) {
                userId = invited.user.id;
                inviteSent = true;
              }
            }

            if (userId) {
              await supabaseAdmin
                .from("clients")
                .update({ user_id: userId })
                .eq("id", clientId)
                .is("user_id", null);
            }
          } catch {
            // On n'échoue pas la requête si l'invitation échoue — le lead est capturé.
          }
        }

        // Tâche automatique pour l'admin : rappeler le prospect
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1);
        const adminId = admins?.[0]?.user_id ?? null;
        const echeance = new Date();
        echeance.setDate(echeance.getDate() + 2);
        await supabaseAdmin.from("taches").insert({
          client_id: clientId,
          titre: `Rappeler ${d.prenom || ""} ${d.nom}`.trim() + (d.source === "simulateur" ? " (simulateur)" : " (contact)"),
          description: parts.join("\n"),
          echeance: echeance.toISOString().slice(0, 10),
          priorite: "haute",
          statut: "a_faire",
          assignee_id: adminId,
        });

        return Response.json(
          { ok: true, client_id: clientId, invite_sent: inviteSent },
          { headers: corsHeaders() },
        );
      },
    },
  },
});

