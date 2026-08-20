import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { EmailResume } from "@/lib/gmail.server";
import { estEmailInterne } from "@/lib/domaines-internes";
import {
  adressesServices,
  chargerServices,
  serviceDeEtiquettes,
  serviceParCle,
  type DefinitionService,
  type ServiceCabinet,
} from "@/lib/services-adresses";

/**
 * Renvoi des mails MAL AIGUILLÉS. Le premier libellé de service est posé
 * manuellement par le staff : l'erreur est donc humaine. Quand le contenu du
 * message ne correspond manifestement pas au thème du service dans lequel il a
 * été posé, l'agent renvoie le mail vers l'adresse réelle du bon service, en
 * REFORMULANT la demande (jamais un transfert brut), avec le client d'origine
 * en copie et le mail d'origine cité en référence.
 *
 * Garde-fous contre les faux positifs :
 *  - confiance IA minimale de 0,8 et service détecté explicitement différent ;
 *  - services sans adresse dédiée (Gestion Commerciale, Service Conformite) :
 *    aucun renvoi, le mail reste sur place ;
 *  - adresse cible identique à l'adresse d'arrivée : aucun renvoi ;
 *  - expéditeur interne ou adresse de service : aucun renvoi (anti-boucle) ;
 *  - un message déjà renvoyé une fois n'est jamais renvoyé à nouveau.
 */

type Admin = SupabaseClient<Database>;

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODELES = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];
const SEUIL_CONFIANCE = 0.8;
const PREFIXE_SUJET = "[Réaiguillage]";

export interface ResultatAiguillage {
  /** Mails renvoyés vers l'adresse du bon service. */
  renvoyes: number;
  /** Identifiants Gmail renvoyés (à exclure du reste du traitement). */
  ids: string[];
  /** Renvois en échec. */
  erreurs: number;
}

interface AnalyseAiguillage {
  service: ServiceCabinet | null;
  confiance: number;
  resume: string;
  modele: string | null;
}

function extraireJson(texte: string): Record<string, unknown> {
  const nettoye = texte.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(nettoye) as Record<string, unknown>;
  } catch {
    const d = nettoye.indexOf("{");
    const f = nettoye.lastIndexOf("}");
    if (d === -1 || f <= d) throw new Error("Réponse IA illisible (JSON attendu)");
    return JSON.parse(nettoye.slice(d, f + 1)) as Record<string, unknown>;
  }
}

function consigne(params: {
  arrivee: DefinitionService;
  sujet: string | null;
  expediteur: string | null;
  texte: string | null;
  pieces: string[];
}): string {
  return [
    "Tu es assistant de tri du courrier d'un cabinet de courtage en assurances français.",
    "Un membre du personnel a rangé MANUELLEMENT cet email dans un service. Tu dois dire à quel service il",
    "appartient réellement, afin de corriger une éventuelle erreur de rangement.",
    "",
    "Services possibles :",
    ...SERVICES.map((s) => `- ${s.cle} : ${s.theme}`),
    "",
    `Service dans lequel le mail a été rangé : ${params.arrivee.cle}`,
    "",
    "Règles impératives :",
    "- Si le mail correspond au service où il est déjà rangé, renvoie ce même service.",
    "- Si tu hésites, si le mail pourrait relever de plusieurs services, ou si le contenu est trop pauvre",
    '  pour trancher, renvoie service = null et confiance = 0. Ne "corrige" jamais par intuition.',
    "- Ne propose un service différent que si le contenu du mail est MANIFESTEMENT étranger au thème du",
    "  service d'arrivée.",
    "",
    `Expéditeur : ${params.expediteur ?? ""}`,
    `Objet : ${params.sujet ?? "(sans objet)"}`,
    `Pièces jointes : ${params.pieces.join(", ") || "aucune"}`,
    "Corps du message :",
    (params.texte ?? "").slice(0, 6000),
    "",
    'Réponds STRICTEMENT en JSON : {"service":"' +
      SERVICES.map((s) => s.cle).join("|") +
      '|null","confiance":0.0,',
    '"resume":"une phrase décrivant la demande, à la troisième personne, sans conseil ni prise de position"}',
  ].join("\n");
}

async function analyser(params: {
  arrivee: DefinitionService;
  sujet: string | null;
  expediteur: string | null;
  texte: string | null;
  pieces: string[];
}): Promise<AnalyseAiguillage> {
  const cle = process.env["LOVABLE_API_KEY"];
  if (!cle) throw new Error("Analyse indisponible : clé IA absente du projet.");

  let derniere = "";
  for (const modele of MODELES) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({ model: modele, messages: [{ role: "user", content: consigne(params) }] }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const brut = extraireJson(json.choices?.[0]?.message?.content ?? "");
      const valeur = String(brut["service"] ?? "").trim().toLowerCase();
      const service = SERVICES.find((s) => s.cle === valeur)?.cle ?? null;
      const resume = typeof brut["resume"] === "string" ? brut["resume"].trim().slice(0, 400) : "";
      return {
        service,
        confiance: Math.max(0, Math.min(1, Number(brut["confiance"]) || 0)),
        resume,
        modele,
      };
    }
    derniere = `${res.status} ${await res.text()}`;
    if (res.status === 429) throw new Error("Analyse IA momentanément saturée.");
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw new Error(`Analyse IA impossible : ${derniere}`);
}

function echapper(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function corpsHtml(params: {
  nomClient: string;
  emailClient: string | null;
  resume: string;
  serviceArrivee: DefinitionService;
  serviceCible: DefinitionService;
  sujet: string | null;
  date: string | null;
  texteOrigine: string | null;
  pieces: string[];
  gmailId: string;
}): string {
  const origine = (params.texteOrigine ?? "").slice(0, 8000);
  return [
    "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111\">",
    "<p>Bonjour,</p>",
    `<p>${echapper(params.nomClient)}${
      params.emailClient ? ` (${echapper(params.emailClient)})` : ""
    } a écrit pour demander : ${echapper(params.resume)}.</p>`,
    `<p>Ce message avait été rangé dans « ${echapper(params.serviceArrivee.libelle)} » ; il relève du service « ${echapper(
      params.serviceCible.libelle,
    )} » et vous est transféré ici pour traitement. Le client est en copie de ce message afin qu'il sache que sa demande a été redirigée.</p>`,
    "<hr style=\"border:none;border-top:1px solid #ddd;margin:18px 0\" />",
    "<p style=\"color:#555;font-size:13px\"><strong>Message d'origine (référence)</strong><br />",
    `Objet : ${echapper(params.sujet ?? "(sans objet)")}<br />`,
    `Date : ${echapper(params.date ?? "non précisée")}<br />`,
    `Pièces jointes : ${echapper(params.pieces.join(", ") || "aucune")}<br />`,
    `Message Gmail : <a href="https://mail.google.com/mail/u/0/#all/${echapper(params.gmailId)}">ouvrir dans Gmail</a>`,
    "</p>",
    `<blockquote style="margin:0;padding:10px 14px;border-left:3px solid #ccc;color:#333;white-space:pre-wrap">${echapper(
      origine,
    )}</blockquote>`,
    "<p style=\"color:#777;font-size:12px\">Message généré automatiquement par le CRM du cabinet (routage interne, sans conseil).</p>",
    "</div>",
  ].join("\n");
}

/**
 * Renvoie les mails mal aiguillés d'un lot vers l'adresse du bon service.
 * Renvoie la liste des identifiants traités : ils ne doivent plus être analysés
 * par les autres agents sur ce passage.
 */
export async function aiguillerLot(
  admin: Admin,
  params: { messages: EmailResume[]; userId: string; limite?: number },
): Promise<ResultatAiguillage> {
  const limite = Math.max(1, Math.min(params.limite ?? 10, 50));
  const out: ResultatAiguillage = { renvoyes: 0, ids: [], erreurs: 0 };
  if (!params.messages.length) return out;

  const { lireMessage, envoyerMessage, poserLabelCabinet } = await import("@/lib/gmail.server");

  const ids = params.messages.map((m) => m.id);
  const { data: dejaVus } = await admin
    .from("crm_emails")
    .select("gmail_message_id, triage_ia")
    .in("gmail_message_id", ids);
  const dejaRenvoyes = new Set(
    (dejaVus ?? [])
      .filter((r) => (r.triage_ia as { agent?: string } | null)?.agent === "aiguillage")
      .map((r) => r.gmail_message_id),
  );

  let traites = 0;
  for (const m of params.messages) {
    if (traites >= limite) break;
    if (dejaRenvoyes.has(m.id)) continue;
    if (m.etiquettes.includes("SENT")) continue;
    if ((m.sujet ?? "").startsWith(PREFIXE_SUJET)) continue;

    const expediteur = (m.expediteur_email ?? "").toLowerCase().trim();
    if (!expediteur) continue;
    // Anti-boucle : jamais de renvoi d'un mail interne ou d'une adresse de service.
    if (estEmailInterne(expediteur) || ADRESSES_SERVICES.includes(expediteur)) continue;

    const arrivee = serviceDeEtiquettes(m.etiquettes);
    if (!arrivee) continue;

    try {
      const detail = await lireMessage(m.id);
      const pieces = detail.pieces_jointes.map((p) => p.nom);
      const analyse = await analyser({
        arrivee,
        sujet: detail.sujet ?? m.sujet ?? null,
        expediteur: `${detail.expediteur_nom ?? ""} <${expediteur}>`,
        texte: detail.texte ?? detail.snippet ?? null,
        pieces,
      });
      traites++;

      if (!analyse.service || analyse.service === arrivee.cle) continue;
      if (analyse.confiance < SEUIL_CONFIANCE) continue;

      const cible = serviceParCle(analyse.service);
      // Service sans adresse dédiée, ou même boîte que le service d'arrivée :
      // le mail reste sur place, aucun renvoi.
      if (!cible.adresse || cible.adresse === arrivee.adresse) continue;

      const nomClient = detail.expediteur_nom?.trim() || expediteur;
      const resume = analyse.resume || "une demande dont l'objet est précisé dans le message d'origine";

      await envoyerMessage({
        to: cible.adresse,
        cc: expediteur,
        sujet: `${PREFIXE_SUJET} ${detail.sujet ?? m.sujet ?? "(sans objet)"}`.slice(0, 200),
        html: corpsHtml({
          nomClient,
          emailClient: expediteur,
          resume,
          serviceArrivee: arrivee,
          serviceCible: cible,
          sujet: detail.sujet ?? m.sujet ?? null,
          date: detail.date ?? m.date ?? null,
          texteOrigine: detail.texte ?? detail.snippet ?? null,
          pieces,
          gmailId: m.id,
        }),
      });

      // Le mail d'origine quitte la file du service d'arrivée : il est archivé
      // là, et posé en « A_Traiter » du service réellement compétent.
      await poserLabelCabinet(m.id, arrivee.archive, { retirer: [arrivee.a_traiter] });
      await poserLabelCabinet(m.id, cible.a_traiter).catch((e: unknown) => {
        console.error("[aiguillage] étiquetage du service cible impossible", m.id, e);
      });

      await admin.from("crm_emails").upsert(
        {
          gmail_message_id: m.id,
          gmail_thread_id: detail.thread_id ?? m.thread_id ?? null,
          direction: "entrant",
          recu_le: detail.date ?? m.date ?? null,
          notes: `Mal aiguillé (${arrivee.libelle}) — renvoyé à ${cible.adresse}, client en copie`,
          triage_ia: JSON.parse(
            JSON.stringify({
              agent: "aiguillage",
              service_arrivee: arrivee.cle,
              service_cible: cible.cle,
              adresse: cible.adresse,
              confiance: analyse.confiance,
              resume,
              modele: analyse.modele,
            }),
          ),
          triage_le: new Date().toISOString(),
          created_by: params.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "gmail_message_id" },
      );

      out.renvoyes++;
      out.ids.push(m.id);
      console.info(
        `[aiguillage] ${m.id} · ${arrivee.cle} → ${cible.cle} (${cible.adresse}) · confiance=${analyse.confiance}`,
      );
    } catch (e) {
      out.erreurs++;
      console.error("[aiguillage] renvoi impossible", m.id, e);
    }
  }

  return out;
}
