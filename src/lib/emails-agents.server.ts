import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { EmailResume } from "@/lib/gmail.server";

/**
 * Exécution des agents IA (veille, finance, commercial, relation client) sur un
 * lot de messages de la boîte principale. Utilisé à l'ouverture de l'onglet
 * Emails et par le job planifié /api/public/scan-emails.
 */

type Admin = SupabaseClient<Database>;

export interface ResultatAgents {
  dossiers_crees: number;
  factures_creees: number;
  bordereaux_crees: number;
  veilles_creees: number;
  reponses_auto: number;
  brouillons_reponses: number;
  /** Emails dont le traitement automatique (dont l'étiquetage Gmail) a échoué. */
  erreurs: number;

}

/**
 * Rattachement automatique d'un lot de messages : expéditeur connu d'un client,
 * ou domaine d'une compagnie partenaire. Sert au job planifié (l'onglet Emails
 * fait ce rattachement dans son propre flux).
 */
export async function rattacherLot(
  admin: Admin,
  params: { messages: EmailResume[]; userId: string },
): Promise<{ rattaches_client: number; rattaches_compagnie: number }> {
  const { messages, userId } = params;
  const ids = messages.map((m) => m.id);
  if (!ids.length) return { rattaches_client: 0, rattaches_compagnie: 0 };

  const { data: liens } = await admin.from("crm_emails").select("gmail_message_id").in("gmail_message_id", ids);
  const dejaLies = new Set((liens ?? []).map((l) => l.gmail_message_id));

  const [{ data: clients }, { data: compagnies }] = await Promise.all([
    admin.from("clients").select("id, email, email2"),
    admin.from("compagnies").select("id, contact_email, site_web"),
  ]);

  const clientParEmail = new Map<string, string>();
  for (const c of clients ?? []) {
    for (const e of [c.email, c.email2]) if (e) clientParEmail.set(e.toLowerCase().trim(), c.id);
  }
  const domaine = (v: string | null) => {
    if (!v) return null;
    const m = v.toLowerCase().match(/([a-z0-9-]+\.[a-z.]{2,})/);
    return m ? m[1]!.replace(/^www\./, "") : null;
  };
  const compagnieParDomaine = new Map<string, string>();
  for (const cp of compagnies ?? []) {
    for (const d of [domaine(cp.contact_email), domaine(cp.site_web)]) if (d) compagnieParDomaine.set(d, cp.id);
  }

  let rattachesClient = 0;
  let rattachesCompagnie = 0;
  for (const m of messages) {
    if (dejaLies.has(m.id) || !m.expediteur_email) continue;
    const expediteur = m.expediteur_email.toLowerCase().trim();
    const clientId = clientParEmail.get(expediteur) ?? null;
    const compagnieId = clientId ? null : compagnieParDomaine.get(domaine(expediteur) ?? "") ?? null;
    if (!clientId && !compagnieId) continue;

    const { error } = await admin.from("crm_emails").upsert(
      {
        gmail_message_id: m.id,
        gmail_thread_id: m.thread_id ?? null,
        direction: m.etiquettes.includes("SENT") ? "sortant" : "entrant",
        recu_le: m.date ?? null,
        client_id: clientId,
        compagnie_id: compagnieId,
        notes: clientId
          ? "Rattaché automatiquement (tri planifié — email client connu)"
          : "Rattaché automatiquement (tri planifié — domaine compagnie)",
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gmail_message_id" },
    );
    if (error) {
      console.error("[scan-emails] rattachement", m.id, error.message);
      continue;
    }
    if (clientId) rattachesClient++;
    else rattachesCompagnie++;
  }

  return { rattaches_client: rattachesClient, rattaches_compagnie: rattachesCompagnie };
}


export async function executerAgents(
  admin: Admin,
  params: {
    messages: EmailResume[];
    ids: string[];
    userId: string;
    /**
     * Messages posés manuellement par le staff sur le seul label parent
     * « Direction Commerciale » (filet de rattrapage) : le label est retiré
     * après traitement, et un mail jugé sans importance part à la corbeille.
     */
    rattrapage?: string[];
  },
): Promise<ResultatAgents> {
  const { messages, ids } = params;
  const { userId } = params;
  const rattrapage = new Set(params.rattrapage ?? []);

    // Agent commercial : les messages entrants qui ne correspondent à aucun
    // client sont analysés par l'IA. Classification confiante -> prospect,
    // dossier, recueil et lettre de mission créés ; sinon suggestion affichée.
    let dossiersCrees = 0;
    let erreurs = 0;

    let facturesCreees = 0;
    let bordereauxCrees = 0;
    let veillesCreees = 0;
    const { data: dejaTriage } = ids.length
      ? await admin.from("crm_emails").select("gmail_message_id").in("gmail_message_id", ids).not("triage_ia", "is", null)
      : { data: [] };
    const triageFaits = new Set((dejaTriage ?? []).map((r) => r.gmail_message_id));
    const { data: liensApres } = ids.length
      ? await admin.from("crm_emails").select("gmail_message_id, client_id").in("gmail_message_id", ids)
      : { data: [] };
    const avecClient = new Set((liensApres ?? []).filter((l) => l.client_id).map((l) => l.gmail_message_id));

    const aTrier = messages
      .filter(
        (m) =>
          !!m.expediteur_email &&
          !m.etiquettes.includes("SENT") &&
          !avecClient.has(m.id) &&
          // Un mail en rattrapage est réanalysé même s'il a déjà été trié.
          (!triageFaits.has(m.id) || rattrapage.has(m.id)),
      )
      .sort((a, b) => Number(rattrapage.has(b.id)) - Number(rattrapage.has(a.id)))
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
      const { poserLabelCabinet, mettreCorbeille, retirerLabelRattrapage } = await import("@/lib/gmail.server");
      const { traiterEmailFinance } = await import("@/lib/finance-agent.server");
      const { traiterEmailVeille } = await import("@/lib/veille-reglementaire.server");
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

          // Agent veille réglementaire : newsletter ACPR (aucun traitement CRM
          // commercial ou comptable sur ces mails).
          const veille = await traiterEmailVeille(admin, {
            email: entree,
            gmail_message_id: m.id,
            recu_le: m.date ?? null,
            userId: userId,
          });
          if (veille.action !== "ignore") {
            veillesCreees++;
            await admin.from("crm_emails").upsert(
              {
                gmail_message_id: m.id,
                gmail_thread_id: m.thread_id ?? null,
                direction: "entrant",
                recu_le: m.date ?? null,
                notes: `Agent veille réglementaire — ${veille.impact_assurance ? "impact assurance" : "non impacté"}`,
                triage_ia: JSON.parse(JSON.stringify({ agent: "veille", ...veille })),
                triage_le: new Date().toISOString(),
                created_by: userId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "gmail_message_id" },
            );
            continue;
          }

          // Agent finance ensuite : facture fournisseur ou bordereau de
          // commissions. Si ce n'est pas du ressort de la finance, le tri
          // prospect (agent commercial) prend la suite.
          const finance = await traiterEmailFinance(admin, {
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
            userId: userId,
          });
          if (finance.action !== "ignore") {
            if (finance.action === "facture_creee") facturesCreees++;
            if (finance.action === "bordereau_cree") bordereauxCrees++;
            await admin.from("crm_emails").upsert(
              {
                gmail_message_id: m.id,
                gmail_thread_id: m.thread_id ?? null,
                direction: "entrant",
                recu_le: m.date ?? null,
                notes: `Agent finance — ${finance.categorie} (${finance.action})`,
                triage_ia: JSON.parse(JSON.stringify({ agent: "finance", ...finance })),
                triage_le: new Date().toISOString(),
                created_by: userId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "gmail_message_id" },
            );
            continue;
          }

          const triage = await analyserEmailProspect(entree);
          // Catégorisation faite : prospect entrant spontané.
          await poserLabelCabinet(m.id, "gc_a_traiter");

          if (estPublicite(triage)) {
            // Publicité / newsletter / spam : ni fiche client, ni tâche.
            await marquerEmailPublicite(admin, {
              email: entree,
              triage,
              gmail_message_id: m.id,
              gmail_thread_id: m.thread_id ?? null,
              recu_le: m.date ?? null,
              userId: userId,
            });
            if (rattrapage.has(m.id)) {
              // Rattrapage manuel + mail sans importance : corbeille Gmail.
              await mettreCorbeille(m.id);
              corbeille++;
              console.info(
                `[rattrapage] mail sans importance mis à la corbeille — id=${m.id} · expéditeur=${
                  m.expediteur_email ?? "inconnu"
                } · objet=${m.sujet ?? "(sans objet)"} · catégorie=${triage.categorie ?? "publicite"}`,
              );
            } else {
              await poserLabelCabinet(m.id, "a_ignorer", { retirer: ["gc_a_traiter"] });
            }
          } else if (classificationConfiante(triage)) {
            await creerDossierDepuisEmail(admin, {
              email: entree,
              triage,
              gmail_message_id: m.id,
              gmail_thread_id: m.thread_id ?? null,
              recu_le: m.date ?? null,
              userId: userId,
            });
            dossiersCrees++;
            // Traitement automatique complet : prospect traité par l'IA.
            await poserLabelCabinet(m.id, "gc_archive", { retirer: ["gc_a_traiter"] });
          } else {
            // Classification incertaine : fiche prospect + LCB-FT + tâche
            // humaine de qualification, mais aucun dossier créé.
            await creerFicheProspectIncertaine(admin, {
              email: entree,
              triage,
              gmail_message_id: m.id,
              gmail_thread_id: m.thread_id ?? null,
              recu_le: m.date ?? null,
              userId: userId,
            });
            // Qualification humaine attendue : à relancer.
            await poserLabelCabinet(m.id, "gc_archive", { retirer: ["gc_a_traiter"] });
          }
          if (rattrapage.has(m.id)) {
            await retirerLabelRattrapage(m.id);
            rattrapagesTraites++;
          }

        } catch (e) {
          erreurs++;
          console.error("[agent-commercial] triage email", m.id, e);
          // Aucune étape ne doit échouer silencieusement : une tâche décrit l'erreur.
          await creerTacheAdmin(admin, {
            titre: `Traitement automatique d'un email entrant impossible — ${m.expediteur_email ?? "expéditeur inconnu"}`,
            description: [
              `Objet : ${m.sujet ?? "(sans objet)"}`,
              `Erreur : ${e instanceof Error ? e.message : "erreur inconnue"}`,
              "Email à qualifier manuellement depuis l'onglet Emails.",
            ].join("\n"),
            created_by: userId,
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
      ? await admin
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
          const resultat = await traiterEmailClient(admin, {
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
            userId: userId,
          });
          if (resultat.action === "reponse_envoyee") reponsesAuto++;
          if (resultat.action === "brouillon") brouillons++;
          await admin
            .from("crm_emails")
            .update({
              triage_ia: JSON.parse(JSON.stringify({ agent: "relation_client", ...resultat })),
              triage_le: new Date().toISOString(),
            })
            .eq("gmail_message_id", m.id);
        } catch (e) {
          erreurs++;
          console.error("[agent-relation-client] traitement email", m.id, e);
          await creerTacheAdmin(admin, {
            titre: `Email client non traité automatiquement — ${m.expediteur_email ?? "expéditeur inconnu"}`,
            description: [
              `Objet : ${m.sujet ?? "(sans objet)"}`,
              `Erreur : ${e instanceof Error ? e.message : "erreur inconnue"}`,
              "Email à traiter manuellement depuis l'onglet Emails.",
            ].join("\n"),
            client_id: lien.client_id,
            created_by: userId,
          });
        }
      }
    }
  return {
    dossiers_crees: dossiersCrees,
    factures_creees: facturesCreees,
    bordereaux_crees: bordereauxCrees,
    veilles_creees: veillesCreees,
    reponses_auto: reponsesAuto,
    brouillons_reponses: brouillons,
    erreurs,

  };
}
