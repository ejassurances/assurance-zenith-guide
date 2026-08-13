import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Onglet Email du CRM : lecture de la boîte principale Gmail du cabinet,
 * rattachement des messages (client / dossier / contrat / compagnie),
 * création de fiche + dossier depuis un email, et envoi depuis le CRM.
 */

type StaffClient = {
  from: (table: "user_roles") => {
    select: (cols: string) => { eq: (col: string, val: string) => PromiseLike<{ data: { role: string }[] | null }> };
  };
};

async function exigerStaff(supabase: unknown, userId: string) {
  const { data } = await (supabase as StaffClient).from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("mandataire")) throw new Error("Accès réservé au cabinet.");
  return roles.includes("admin") ? "admin" : "mandataire";
}


const liensSchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  dossier_id: z.string().uuid().optional().nullable(),
  contrat_id: z.string().uuid().optional().nullable(),
  compagnie_id: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/** Boîte de réception principale (onglet « Principal » de Gmail). */
export const boiteReception = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        recherche: z.string().trim().max(200).optional().nullable(),
        pageToken: z.string().max(200).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { listerBoitePrincipale } = await import("@/lib/gmail.server");
    const { messages, nextPageToken } = await listerBoitePrincipale({
      recherche: data.recherche ?? null,
      pageToken: data.pageToken ?? null,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = messages.map((m) => m.id);
    const { data: liens } = ids.length
      ? await supabaseAdmin
          .from("crm_emails")
          .select(
            "id, gmail_message_id, client_id, dossier_id, contrat_id, compagnie_id, notes, clients(nom, prenom), compagnies(nom)",
          )
          .in("gmail_message_id", ids)
      : { data: [] };

    return { messages, nextPageToken, liens: liens ?? [] };
  });

/** Contenu complet d'un message + son rattachement éventuel. */
export const messageComplet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(5).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { lireMessage } = await import("@/lib/gmail.server");
    const message = await lireMessage(data.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lien } = await supabaseAdmin
      .from("crm_emails")
      .select("*")
      .eq("gmail_message_id", data.id)
      .maybeSingle();

    return { message, lien: lien ?? null };
  });

/** Rattache un message à un client, un dossier, un contrat ou une compagnie. */
export const rattacherMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    liensSchema
      .extend({
        gmail_message_id: z.string().min(5).max(80),
        gmail_thread_id: z.string().max(80).optional().nullable(),
        expediteur_nom: z.string().max(200).optional().nullable(),
        expediteur_email: z.string().max(255).optional().nullable(),
        destinataires: z.string().max(1000).optional().nullable(),
        sujet: z.string().max(500).optional().nullable(),
        snippet: z.string().max(2000).optional().nullable(),
        recu_le: z.string().max(40).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("crm_emails")
      .upsert(
        {
          gmail_message_id: data.gmail_message_id,
          gmail_thread_id: data.gmail_thread_id ?? null,
          direction: "entrant",
          expediteur_nom: data.expediteur_nom ?? null,
          expediteur_email: data.expediteur_email ?? null,
          destinataires: data.destinataires ?? null,
          sujet: data.sujet ?? null,
          snippet: data.snippet ?? null,
          recu_le: data.recu_le ?? null,
          client_id: data.client_id ?? null,
          dossier_id: data.dossier_id ?? null,
          contrat_id: data.contrat_id ?? null,
          compagnie_id: data.compagnie_id ?? null,
          notes: data.notes ?? null,
          created_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "gmail_message_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (data.client_id) {
      await supabaseAdmin.from("activites").insert({
        client_id: data.client_id,
        type: "email",
        titre: `Email reçu : ${data.sujet ?? "(sans objet)"}`,
        contenu: `De ${data.expediteur_email ?? "inconnu"}\n\n${data.snippet ?? ""}`,
        created_by: context.userId,
      });
    }

    return { id: row.id };
  });

/** Supprime le rattachement d'un message. */
export const detacherMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ gmail_message_id: z.string().min(5).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("crm_emails").delete().eq("gmail_message_id", data.gmail_message_id);
    return { ok: true };
  });

/** Crée une fiche client (et éventuellement un dossier) depuis un email. */
export const creerFicheDepuisEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        gmail_message_id: z.string().min(5).max(80),
        gmail_thread_id: z.string().max(80).optional().nullable(),
        sujet: z.string().max(500).optional().nullable(),
        snippet: z.string().max(2000).optional().nullable(),
        recu_le: z.string().max(40).optional().nullable(),
        nom: z.string().trim().min(1).max(120),
        prenom: z.string().trim().max(120).optional().nullable(),
        email: z.string().trim().email().max(255),
        telephone: z.string().trim().max(30).optional().nullable(),
        creer_dossier: z.boolean().default(false),
        type_assurance: z.string().trim().max(60).default("autre"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existant } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();

    let clientId = existant?.id ?? null;
    if (!clientId) {
      const { data: cree, error } = await supabaseAdmin
        .from("clients")
        .insert({
          nom: data.nom,
          prenom: data.prenom || null,
          email: data.email,
          mobile: data.telephone || null,
          statut: "prospect",
          origine: "internet",
          etiquettes: ["email-entrant"],
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error || !cree) throw new Error(error?.message ?? "Création de la fiche impossible");
      clientId = cree.id;
    }

    let dossierId: string | null = null;
    let dossierRef: string | null = null;
    if (data.creer_dossier) {
      const { creerDossierAutomatique } = await import("@/lib/dossier-automation.server");
      const dossier = await creerDossierAutomatique(supabaseAdmin, {
        client_id: clientId,
        nom: data.nom,
        prenom: data.prenom ?? null,
        email: data.email,
        telephone: data.telephone ?? null,
        type_assurance: data.type_assurance,
        notes: `Créé depuis un email : ${data.sujet ?? ""}`,
        admin_id: context.userId,
        origin: "crm-email",
      });
      dossierId = dossier.id;
      dossierRef = dossier.reference;
    }

    await supabaseAdmin.from("crm_emails").upsert(
      {
        gmail_message_id: data.gmail_message_id,
        gmail_thread_id: data.gmail_thread_id ?? null,
        direction: "entrant",
        expediteur_email: data.email,
        expediteur_nom: [data.prenom, data.nom].filter(Boolean).join(" ") || null,
        sujet: data.sujet ?? null,
        snippet: data.snippet ?? null,
        recu_le: data.recu_le ?? null,
        client_id: clientId,
        dossier_id: dossierId,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gmail_message_id" },
    );

    await supabaseAdmin.from("activites").insert({
      client_id: clientId,
      type: "email",
      titre: `Fiche créée depuis un email : ${data.sujet ?? "(sans objet)"}`,
      contenu: data.snippet ?? null,
      created_by: context.userId,
    });

    return { client_id: clientId, dossier_id: dossierId, dossier_reference: dossierRef, deja_existant: !!existant };
  });

/** Rattache un email à la fiche d'une compagnie. */
export const rattacherCompagnie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        gmail_message_id: z.string().min(5).max(80),
        gmail_thread_id: z.string().max(80).optional().nullable(),
        compagnie_id: z.string().uuid(),
        expediteur_nom: z.string().max(200).optional().nullable(),
        expediteur_email: z.string().max(255).optional().nullable(),
        sujet: z.string().max(500).optional().nullable(),
        snippet: z.string().max(2000).optional().nullable(),
        recu_le: z.string().max(40).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("crm_emails").upsert(
      {
        gmail_message_id: data.gmail_message_id,
        gmail_thread_id: data.gmail_thread_id ?? null,
        direction: "entrant",
        compagnie_id: data.compagnie_id,
        expediteur_nom: data.expediteur_nom ?? null,
        expediteur_email: data.expediteur_email ?? null,
        sujet: data.sujet ?? null,
        snippet: data.snippet ?? null,
        recu_le: data.recu_le ?? null,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gmail_message_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envoie un email depuis la boîte du cabinet et l'archive dans le CRM. */
export const envoyerEmailCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    liensSchema
      .extend({
        to: z.string().trim().email().max(255),
        cc: z.string().trim().max(500).optional().nullable(),
        sujet: z.string().trim().min(1).max(300),
        message: z.string().trim().min(1).max(20000),
        thread_id: z.string().max(80).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { envoyerMessage } = await import("@/lib/gmail.server");

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">${data.message
      .split("\n")
      .map((l) => l.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!))
      .join("<br />")}</div>`;

    const envoye = await envoyerMessage({
      to: data.to,
      cc: data.cc || null,
      sujet: data.sujet,
      html,
      threadId: data.thread_id || null,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("crm_emails").upsert(
      {
        gmail_message_id: envoye.id,
        gmail_thread_id: envoye.threadId,
        direction: "sortant",
        destinataires: [data.to, data.cc].filter(Boolean).join(", "),
        sujet: data.sujet,
        snippet: data.message.slice(0, 300),
        recu_le: new Date().toISOString(),
        client_id: data.client_id ?? null,
        dossier_id: data.dossier_id ?? null,
        contrat_id: data.contrat_id ?? null,
        compagnie_id: data.compagnie_id ?? null,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gmail_message_id" },
    );

    if (data.client_id) {
      await supabaseAdmin.from("activites").insert({
        client_id: data.client_id,
        type: "email",
        titre: `Email envoyé : ${data.sujet}`,
        contenu: data.message,
        created_by: context.userId,
      });
    }

    return { id: envoye.id, thread_id: envoye.threadId };
  });
