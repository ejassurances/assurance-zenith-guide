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
    const selectLiens =
      "id, gmail_message_id, client_id, dossier_id, contrat_id, compagnie_id, notes, clients(nom, prenom), compagnies(nom)";
    const { data: liens } = ids.length
      ? await supabaseAdmin.from("crm_emails").select(selectLiens).in("gmail_message_id", ids)
      : { data: [] };

    // Rattachement automatique : expéditeur = email d'un client existant.
    const dejaLies = new Set((liens ?? []).map((l) => l.gmail_message_id));
    const aTraiter = messages.filter(
      (m) => !dejaLies.has(m.id) && !!m.expediteur_email && !m.etiquettes.includes("SENT"),
    );
    let nouveaux = 0;
    if (aTraiter.length) {
      const emails = [...new Set(aTraiter.map((m) => m.expediteur_email!.toLowerCase()))];
      const { data: clients } = await supabaseAdmin.from("clients").select("id, email, nom, prenom").in("email", emails);
      const parEmail = new Map((clients ?? []).map((c) => [(c.email ?? "").toLowerCase(), c]));
      for (const m of aTraiter) {
        const cl = parEmail.get(m.expediteur_email!.toLowerCase());
        if (!cl) continue;
        const { error } = await supabaseAdmin.from("crm_emails").upsert(
          {
            gmail_message_id: m.id,
            gmail_thread_id: m.thread_id ?? null,
            direction: "entrant",
            recu_le: m.date ?? null,
            client_id: cl.id,
            notes: "Rattaché automatiquement (email expéditeur connu)",
            created_by: context.userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "gmail_message_id" },
        );
        if (error) {
          console.error("Rattachement auto email:", error.message);
          continue;
        }
        nouveaux++;
        await supabaseAdmin.from("activites").insert({
          client_id: cl.id,
          type: "email",
          titre: "Email rattaché automatiquement",
          contenu: `De ${m.expediteur_email}\nObjet : ${m.sujet ?? "(sans objet)"}\nEmail : https://mail.google.com/mail/u/0/#all/${m.id}`,
          created_by: context.userId,
        });
      }
    }

    // Agent commercial : les messages entrants qui ne correspondent à aucun
    // client sont analysés par l'IA. Classification confiante -> prospect,
    // dossier, recueil et lettre de mission créés ; sinon suggestion affichée.
    let dossiersCrees = 0;
    let facturesCreees = 0;
    let bordereauxCrees = 0;
    const { data: dejaTriage } = ids.length
      ? await supabaseAdmin.from("crm_emails").select("gmail_message_id").in("gmail_message_id", ids).not("triage_ia", "is", null)
      : { data: [] };
    const triageFaits = new Set((dejaTriage ?? []).map((r) => r.gmail_message_id));
    const { data: liensApres } = ids.length
      ? await supabaseAdmin.from("crm_emails").select("gmail_message_id, client_id").in("gmail_message_id", ids)
      : { data: [] };
    const avecClient = new Set((liensApres ?? []).filter((l) => l.client_id).map((l) => l.gmail_message_id));

    const aTrier = messages
      .filter(
        (m) =>
          !!m.expediteur_email &&
          !m.etiquettes.includes("SENT") &&
          !avecClient.has(m.id) &&
          !triageFaits.has(m.id),
      )
      .slice(0, 5);

    if (aTrier.length) {
      const { lireMessage } = await import("@/lib/gmail.server");
      const {
        analyserEmailProspect,
        classificationConfiante,
        estPublicite,
        marquerEmailPublicite,
        creerDossierDepuisEmail,
        creerFicheProspectIncertaine,
      } = await import("@/lib/email-triage.server");
      const { creerTacheAdmin } = await import("@/lib/agent-taches.server");
      const { marquerAgentATraiter, marquerAgentArchive } = await import("@/lib/gmail.server");
      const { traiterEmailFinance } = await import("@/lib/finance-agent.server");
      for (const m of aTrier) {
        try {
          const detail = await lireMessage(m.id);
          const entree = {
            sujet: detail.sujet ?? null,
            expediteur_nom: detail.expediteur_nom ?? null,
            expediteur_email: detail.expediteur_email ?? null,
            texte: detail.texte ?? detail.snippet ?? null,
            pieces_jointes: detail.pieces_jointes.map((p) => ({ nom: p.nom, mime: p.mime })),
          };

          // Agent finance en premier : facture fournisseur ou bordereau de
          // commissions. Si ce n'est pas du ressort de la finance, le tri
          // prospect (agent commercial) prend la suite.
          const finance = await traiterEmailFinance(supabaseAdmin, {
            email: {
              ...entree,
              pieces_jointes: detail.pieces_jointes.map((p) => ({
                nom: p.nom,
                mime: p.mime,
                attachment_id: p.attachment_id,
              })),
            },
            gmail_message_id: m.id,
            recu_le: m.date ?? null,
            userId: context.userId,
          });
          if (finance.action !== "ignore") {
            if (finance.action === "facture_creee") facturesCreees++;
            if (finance.action === "bordereau_cree") bordereauxCrees++;
            await supabaseAdmin.from("crm_emails").upsert(
              {
                gmail_message_id: m.id,
                gmail_thread_id: m.thread_id ?? null,
                direction: "entrant",
                recu_le: m.date ?? null,
                notes: `Agent finance — ${finance.categorie} (${finance.action})`,
                triage_ia: JSON.parse(JSON.stringify({ agent: "finance", ...finance })),
                triage_le: new Date().toISOString(),
                created_by: context.userId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "gmail_message_id" },
            );
            continue;
          }

          const triage = await analyserEmailProspect(entree);
          // Catégorisation faite : le mail est pris en charge par l'agent commercial.
          await marquerAgentATraiter(m.id, "commercial");



          if (estPublicite(triage)) {
            // Publicité / newsletter / spam : ni fiche client, ni tâche.
            await marquerEmailPublicite(supabaseAdmin, {
              email: entree,
              triage,
              gmail_message_id: m.id,
              gmail_thread_id: m.thread_id ?? null,
              recu_le: m.date ?? null,
              userId: context.userId,
            });
          } else if (classificationConfiante(triage)) {
            await creerDossierDepuisEmail(supabaseAdmin, {
              email: entree,
              triage,
              gmail_message_id: m.id,
              gmail_thread_id: m.thread_id ?? null,
              recu_le: m.date ?? null,
              userId: context.userId,
            });
            dossiersCrees++;
          } else {
            // Classification incertaine : fiche prospect + LCB-FT + tâche
            // humaine de qualification, mais aucun dossier créé.
            await creerFicheProspectIncertaine(supabaseAdmin, {
              email: entree,
              triage,
              gmail_message_id: m.id,
              gmail_thread_id: m.thread_id ?? null,
              recu_le: m.date ?? null,
              userId: context.userId,
            });
          }
          // Traitement terminé : « À traiter » retiré, « Archivé » posé.
          await marquerAgentArchive(m.id, "commercial");

        } catch (e) {
          console.error("[agent-commercial] triage email", m.id, e);
          // Aucune étape ne doit échouer silencieusement : une tâche décrit l'erreur.
          await creerTacheAdmin(supabaseAdmin, {
            titre: `Traitement automatique d'un email entrant impossible — ${m.expediteur_email ?? "expéditeur inconnu"}`,
            description: [
              `Objet : ${m.sujet ?? "(sans objet)"}`,
              `Erreur : ${e instanceof Error ? e.message : "erreur inconnue"}`,
              "Email à qualifier manuellement depuis l'onglet Emails.",
            ].join("\n"),
            created_by: context.userId,
          });
        }
      }
    }

    // Agent relation client : emails rattachés à un client existant et pas
    // encore analysés. Niveau 0 (sinistre/réclamation/santé/paiement) -> tâche
    // urgente ; niveau 1 -> réponse automatique cadrée ; sinon brouillon.
    let reponsesAuto = 0;
    let brouillons = 0;
    const { data: liensClients } = ids.length
      ? await supabaseAdmin
          .from("crm_emails")
          .select("gmail_message_id, client_id, triage_ia")
          .in("gmail_message_id", ids)
          .not("client_id", "is", null)
      : { data: [] };
    const aRepondre = ((liensClients ?? []) as { gmail_message_id: string; client_id: string; triage_ia: unknown }[])
      .filter((l) => !l.triage_ia)
      .filter((l) => {
        const m = messages.find((x) => x.id === l.gmail_message_id);
        return !!m && !m.etiquettes.includes("SENT") && !!m.expediteur_email;
      })
      .slice(0, 5);

    if (aRepondre.length) {
      const { lireMessage } = await import("@/lib/gmail.server");
      const { traiterEmailClient } = await import("@/lib/relation-client.server");
      const { creerTacheAdmin } = await import("@/lib/agent-taches.server");
      for (const lien of aRepondre) {
        const m = messages.find((x) => x.id === lien.gmail_message_id)!;
        try {
          const detail = await lireMessage(m.id);
          const resultat = await traiterEmailClient(supabaseAdmin, {
            client_id: lien.client_id,
            email: {
              sujet: detail.sujet ?? null,
              expediteur_nom: detail.expediteur_nom ?? null,
              expediteur_email: detail.expediteur_email ?? null,
              texte: detail.texte ?? detail.snippet ?? null,
              pieces_jointes: detail.pieces_jointes.map((p) => ({
                nom: p.nom,
                mime: p.mime,
                attachment_id: p.attachment_id,
              })),
            },
            gmail_message_id: m.id,
            gmail_thread_id: m.thread_id ?? null,
            userId: context.userId,
          });
          if (resultat.action === "reponse_envoyee") reponsesAuto++;
          if (resultat.action === "brouillon") brouillons++;
          await supabaseAdmin
            .from("crm_emails")
            .update({
              triage_ia: JSON.parse(JSON.stringify({ agent: "relation_client", ...resultat })),
              triage_le: new Date().toISOString(),
            })
            .eq("gmail_message_id", m.id);
        } catch (e) {
          console.error("[agent-relation-client] traitement email", m.id, e);
          await creerTacheAdmin(supabaseAdmin, {
            titre: `Email client non traité automatiquement — ${m.expediteur_email ?? "expéditeur inconnu"}`,
            description: [
              `Objet : ${m.sujet ?? "(sans objet)"}`,
              `Erreur : ${e instanceof Error ? e.message : "erreur inconnue"}`,
              "Email à traiter manuellement depuis l'onglet Emails.",
            ].join("\n"),
            client_id: lien.client_id,
            created_by: context.userId,
          });
        }
      }
    }

    const selectComplet = `${selectLiens}, triage_ia, triage_le`;
    const { data: liensFinaux } = ids.length
      ? await supabaseAdmin.from("crm_emails").select(selectComplet).in("gmail_message_id", ids)
      : { data: [] };

    return {
      messages,
      nextPageToken,
      liens: liensFinaux ?? [],
      nouveaux,
      dossiers_crees: dossiersCrees,
      factures_creees: facturesCreees,
      bordereaux_crees: bordereauxCrees,
      reponses_auto: reponsesAuto,
      brouillons_reponses: brouillons,
    };
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
      const { data: cl } = await supabaseAdmin
        .from("clients")
        .select("nom, prenom")
        .eq("id", data.client_id)
        .maybeSingle();
      if (cl) {
        const { etiqueterMessage } = await import("@/lib/gmail.server");
        await etiqueterMessage(
          data.gmail_message_id,
          `CRM/Clients/${[cl.prenom, cl.nom].filter(Boolean).join(" ").replace(/\//g, "-")}`,
        ).catch((e) => console.error("Étiquette Gmail:", e));
      }
      await supabaseAdmin.from("activites").insert({
        client_id: data.client_id,
        type: "email",
        titre: `Email reçu : ${data.sujet ?? "(sans objet)"}`,
        contenu: `De ${data.expediteur_email ?? "inconnu"}\nEmail : https://mail.google.com/mail/u/0/#all/${data.gmail_message_id}`,
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

      // Contrôle LCB-FT / OpenSanctions automatique sur toute nouvelle fiche.
      const { lancerLcbAutomatique } = await import("@/lib/dossier-automation.server");
      await lancerLcbAutomatique(supabaseAdmin, {
        client_id: clientId,
        nom: data.nom,
        prenom: data.prenom ?? null,
      });
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
      contenu: `Email : https://mail.google.com/mail/u/0/#all/${data.gmail_message_id}`,
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
        recu_le: data.recu_le ?? null,
        created_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gmail_message_id" },
    );
    if (error) throw new Error(error.message);

    const { data: cie } = await supabaseAdmin
      .from("compagnies")
      .select("nom")
      .eq("id", data.compagnie_id)
      .maybeSingle();
    if (cie) {
      const { etiqueterMessage } = await import("@/lib/gmail.server");
      await etiqueterMessage(data.gmail_message_id, `CRM/Partenaires/${cie.nom.replace(/\//g, "-")}`).catch((e) =>
        console.error("Étiquette Gmail:", e),
      );
    }
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

    const corps = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">${data.message
      .split("\n")
      .map((l) => l.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!))
      .join("<br />")}</div>`;

    // Signature réglementaire (ORIAS / ACPR) obligatoire aussi sur les envois manuels.
    const { withHtmlSignature } = await import("@/lib/email-templates/send-email");
    const html = withHtmlSignature(corps);

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


/** Marque un message comme lu ou non lu dans Gmail. */
export const marquerLuMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().min(5).max(80), lu: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { marquerLu } = await import("@/lib/gmail.server");
    await marquerLu(data.id, data.lu);
    return { ok: true };
  });

/** Archive un message (le retire de la boîte de réception Gmail). */
export const archiverMessageCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(5).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { archiverMessage } = await import("@/lib/gmail.server");
    await archiverMessage(data.id);
    return { ok: true };
  });

/** Met un message à la corbeille Gmail et supprime son rattachement CRM. */
export const supprimerMessageCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().min(5).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { mettreCorbeille } = await import("@/lib/gmail.server");
    await mettreCorbeille(data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("crm_emails").delete().eq("gmail_message_id", data.id);
    return { ok: true };
  });

/** Applique une étiquette Gmail libre à un message. */
export const etiqueterMessageCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().min(5).max(80), etiquette: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { etiqueterMessage } = await import("@/lib/gmail.server");
    await etiqueterMessage(data.id, data.etiquette);
    return { ok: true };
  });

/**
 * Scan complet de la boîte principale (messages LUS inclus) pour mettre à jour le CRM :
 * rattache automatiquement chaque message à un client (expéditeur ou destinataire connu)
 * ou à une compagnie (email de contact / domaine du site).
 */
export const scannerBoiteCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ pages: z.number().int().min(1).max(20).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { listerBoitePrincipale } = await import("@/lib/gmail.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const maxPages = data.pages ?? 8;

    const [{ data: clients }, { data: compagnies }] = await Promise.all([
      supabaseAdmin.from("clients").select("id, email, email2, nom, prenom"),
      supabaseAdmin.from("compagnies").select("id, nom, contact_email, site_web"),
    ]);

    const clientParEmail = new Map<string, { id: string; nom: string | null; prenom: string | null }>();
    for (const c of clients ?? []) {
      for (const e of [c.email, c.email2]) {
        if (e) clientParEmail.set(e.toLowerCase().trim(), { id: c.id, nom: c.nom, prenom: c.prenom });
      }
    }

    const domaine = (v: string | null) => {
      if (!v) return null;
      const m = v.toLowerCase().match(/([a-z0-9-]+\.[a-z.]{2,})/);
      return m ? m[1].replace(/^www\./, "") : null;
    };
    const compagnieParDomaine = new Map<string, { id: string; nom: string }>();
    for (const cp of compagnies ?? []) {
      for (const d of [domaine(cp.contact_email), domaine(cp.site_web)]) {
        if (d) compagnieParDomaine.set(d, { id: cp.id, nom: cp.nom });
      }
    }

    let analyses = 0;
    let rattachesClient = 0;
    let rattachesCompagnie = 0;
    let deja = 0;
    let pageToken: string | null = null;

    for (let p = 0; p < maxPages; p++) {
      const { messages, nextPageToken } = await listerBoitePrincipale({
        pageToken,
        maxResults: 50,
      });
      if (!messages.length) break;
      analyses += messages.length;

      const ids = messages.map((m) => m.id);
      const { data: liens } = await supabaseAdmin
        .from("crm_emails")
        .select("gmail_message_id")
        .in("gmail_message_id", ids);
      const dejaLies = new Set((liens ?? []).map((l) => l.gmail_message_id));

      for (const m of messages) {
        if (dejaLies.has(m.id)) {
          deja++;
          continue;
        }
        const expediteur = m.expediteur_email?.toLowerCase().trim() ?? null;
        const destinataires = (m.destinataires ?? "").toLowerCase();

        let client = expediteur ? clientParEmail.get(expediteur) ?? null : null;
        if (!client) {
          for (const [email, c] of clientParEmail) {
            if (destinataires.includes(email)) {
              client = c;
              break;
            }
          }
        }
        const compagnie = !client && expediteur ? compagnieParDomaine.get(domaine(expediteur) ?? "") ?? null : null;
        if (!client && !compagnie) continue;

        const { error } = await supabaseAdmin.from("crm_emails").upsert(
          {
            gmail_message_id: m.id,
            gmail_thread_id: m.thread_id ?? null,
            direction: m.etiquettes.includes("SENT") ? "sortant" : "entrant",
            recu_le: m.date ?? null,
            client_id: client?.id ?? null,
            compagnie_id: compagnie?.id ?? null,
            notes: client
              ? "Rattaché automatiquement (scan boîte — email client connu)"
              : "Rattaché automatiquement (scan boîte — domaine compagnie)",
            created_by: context.userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "gmail_message_id" },
        );
        if (error) {
          console.error("Scan boîte email:", error.message);
          continue;
        }
        if (client) {
          rattachesClient++;
          await supabaseAdmin.from("activites").insert({
            client_id: client.id,
            type: "email",
            titre: "Email rattaché automatiquement (scan)",
            contenu: `De ${m.expediteur_email ?? "?"}\nObjet : ${m.sujet ?? "(sans objet)"}\nEmail : https://mail.google.com/mail/u/0/#all/${m.id}`,
            created_by: context.userId,
          });
        } else {
          rattachesCompagnie++;
        }
      }

      pageToken = nextPageToken;
      if (!pageToken) break;
    }

    return { analyses, rattachesClient, rattachesCompagnie, deja };
  });
