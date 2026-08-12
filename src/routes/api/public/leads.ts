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

        const origin = new URL(request.url).origin;

        // Admin de référence (propriétaire technique des documents et des tâches)
        const { data: admins } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1);
        const adminId = admins?.[0]?.user_id ?? null;

        const {
          creerDossierAutomatique,
          classerPiecesJointes,
          lancerLcbAutomatique,
          creerEspaceClient,
        } = await import("@/lib/dossier-automation.server");

        // Branche concernée : déduite du sujet du formulaire (emprunteur par défaut
        // pour une demande issue du simulateur).
        const sujet = (d.sujet ?? "").toLowerCase();
        let typeAssurance = "emprunteur";
        if (d.source !== "simulateur") {
          if (/prevoyance|pr[ée]voyance|sant[ée]|mutuelle/.test(sujet)) typeAssurance = "prevoyance_sante";
          else if (/epargne|[ée]pargne|retraite|transmission|coparent/.test(sujet)) typeAssurance = "epargne_retraite";
          else if (/auto|habitation|iard|mrh/.test(sujet)) typeAssurance = "iard";
          else if (/trottinette|edpm/.test(sujet)) typeAssurance = "trottinette";
        }

        // 1) Dossier + checklist des pièces requises
        let dossierId: string | null = null;
        let dossierRef: string | null = null;
        try {
          const dossier = await creerDossierAutomatique(supabaseAdmin, {
            client_id: clientId,
            nom: d.nom,
            prenom: d.prenom || null,
            email: d.email || null,
            telephone: d.telephone || null,
            type_assurance: typeAssurance,
            notes: d.message || null,
            capital: d.simulation?.capital ?? null,
            duree_mois: d.simulation ? d.simulation.duree_ans * 12 : null,
            age: d.simulation?.age ?? null,
            fumeur: d.simulation?.fumeur ?? null,
            economie_estimee: d.simulation ? Math.round(d.simulation.economie_totale) : null,
            admin_id: adminId,
            origin,
          });
          dossierId = dossier.id;
          dossierRef = dossier.reference;
        } catch {
          // Le lead reste capturé même si la création du dossier échoue.
        }

        // 2) Classement automatique des pièces jointes reçues
        let classement: { nom: string; code: string | null; categorie: string }[] = [];
        if (dossierId && (d.pieces_jointes ?? []).length > 0) {
          try {
            classement = await classerPiecesJointes(supabaseAdmin, {
              client_id: clientId,
              dossier_id: dossierId,
              type_assurance: typeAssurance,
              admin_id: adminId,
              pieces: d.pieces_jointes ?? [],
            });
          } catch {
            classement = [];
          }
        }

        // 3) Contrôle LCB-FT automatique (sanctions + PPE)
        const lcb = await lancerLcbAutomatique(supabaseAdmin, {
          client_id: clientId,
          nom: d.nom,
          prenom: d.prenom || null,
        });

        // 4) Espace client (mot de passe provisoire + e-mail d'accès)
        let espace: { created: boolean; email_sent: boolean } = { created: false, email_sent: false };
        if (d.email) {
          try {
            const res = await creerEspaceClient(supabaseAdmin, {
              client_id: clientId,
              email: d.email,
              nom: d.nom,
              prenom: d.prenom || null,
              origin,
            });
            espace = { created: res.created, email_sent: res.email_sent };
          } catch {
            espace = { created: false, email_sent: false };
          }
        }

        // 5) Tâche automatique pour l'admin : rappeler le prospect
        const echeance = new Date();
        echeance.setDate(echeance.getDate() + 2);
        const suivi: string[] = [...parts];
        if (dossierRef) suivi.push(`Dossier créé automatiquement : ${dossierRef} (${typeAssurance})`);
        if (classement.length > 0) {
          suivi.push(
            "Pièces classées : " +
              classement.map((c) => `${c.nom} → ${c.code ?? "à qualifier"}`).join(", "),
          );
        }
        if (lcb) {
          suivi.push(
            `LCB-FT : ${lcb.statut} · ${lcb.matches.length} correspondance(s)${lcb.has_ppe ? " · PPE" : ""}${lcb.has_sanction ? " · sanction" : ""}`,
          );
        }
        if (espace.created) suivi.push("Espace client créé (mot de passe provisoire envoyé par e-mail).");
        await supabaseAdmin.from("taches").insert({
          client_id: clientId,
          titre: `Rappeler ${d.prenom || ""} ${d.nom}`.trim() + (d.source === "simulateur" ? " (simulateur)" : " (contact)"),
          description: suivi.join("\n"),
          echeance: echeance.toISOString().slice(0, 10),
          priorite: lcb && lcb.statut === "a_verifier" ? "urgente" : "haute",
          statut: "a_faire",
          assignee_id: adminId,
        });

        // Transfert de la demande complète vers le webhook Google Apps Script.
        const { postLeadToWebhook, resolveLeadSource } = await import("@/lib/lead-webhook.server");
        const webhook = await postLeadToWebhook({
          source: resolveLeadSource(d.sujet),
          formulaire: d.source,
          envoye_le: new Date().toISOString(),
          client_id: clientId,
          nom: d.nom,
          prenom: d.prenom || "",
          email: d.email || null,
          telephone: d.telephone || null,
          type_besoin: d.sujet || (d.source === "simulateur" ? "emprunteur" : null),
          message: d.message || null,
          simulation: d.simulation ?? null,
          pieces_jointes: (d.pieces_jointes ?? []).map((p) => ({
            nom: p.nom,
            type: p.type ?? null,
            taille: p.taille ?? null,
            contenu_base64: p.contenu_base64 ?? null,
          })),
        });

        return Response.json(
          { ok: true, client_id: clientId, invite_sent: espace.email_sent, dossier_ref: dossierRef, webhook_ok: webhook.ok },
          { headers: corsHeaders() },
        );
      },
    },
  },
});


