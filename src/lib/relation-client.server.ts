/**
 * Agent relation client — traitement des emails entrants déjà rattachés à un
 * client existant.
 *
 * Trois niveaux cadrés avec le cabinet :
 *  - niveau_0 : sinistre, réclamation, résiliation, santé, paiement → jamais
 *    d'automatisation, même en brouillon. Tâche admin urgente.
 *  - niveau_1 : info contrat, info garanties, demande d'attestation, et
 *    seulement si l'IA est très confiante → réponse envoyée automatiquement.
 *  - niveau_2 : tout le reste (et tout doute) → réponse en brouillon dans la
 *    file d'attente, validée manuellement par le cabinet.
 * Les pièces KYC détectées en pièce jointe sont routées vers le pipeline
 * existant (lecture CNI, complétion fiche, relance LCB-FT), quel que soit le
 * niveau de la demande.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import { creerTacheAdmin } from "@/lib/agent-taches.server";
import { grillePourFamille, synthetiserGaranties, type ValeursGrille } from "@/lib/garanties-grille";

type Admin = SupabaseClient<any, any, any>;

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODELES = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];
const CABINET = "EJ Partners Assurances";
const BUCKET = "dossier-documents";
const SEUIL_NIVEAU_1 = 0.8;
const STATUTS_CONTRAT_ACTIF = ["actif", "contrat_actif", "contrat_valide"];

/** Type de document contrat correspondant à une attestation d'assurance. */
export const TYPE_ATTESTATION = "attestation_assurance";

export type NiveauRelation = "niveau_0" | "niveau_1" | "niveau_2";
export type IntentionRelation = "info_contrat" | "info_garanties" | "attestation" | null;
/** Sous-type précisant la nature d'un email niveau 0. */
export type SousTypeNiveau0 = "sinistre" | "reclamation" | "resiliation" | "sante" | "paiement" | null;

export interface EmailClient {
  sujet: string | null;
  expediteur_nom: string | null;
  expediteur_email: string | null;
  texte: string | null;
  pieces_jointes: { nom: string; mime: string | null; attachment_id: string | null }[];
}

export interface ClassificationRelation {
  niveau: NiveauRelation;
  sous_type: SousTypeNiveau0;
  intention: IntentionRelation;
  piece_jointe_kyc: boolean;
  pieces_kyc: { nom: string; type: "cni" | "justificatif_domicile" | "rib" | "kbis" }[];
  confiance: number;
  resume: string;
  modele: string | null;
}


function extraireJson(texte: string): Record<string, unknown> {
  const nettoye = texte.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(nettoye) as Record<string, unknown>;
  } catch {
    const debut = nettoye.indexOf("{");
    const fin = nettoye.lastIndexOf("}");
    if (debut === -1 || fin <= debut) throw new Error("Réponse IA illisible (JSON attendu)");
    return JSON.parse(nettoye.slice(debut, fin + 1)) as Record<string, unknown>;
  }
}

function texteOuNull(v: unknown, max = 400): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "null") return null;
  return t.slice(0, max);
}

function consigne(email: EmailClient): string {
  return [
    "Tu es assistant relation client dans un cabinet de courtage en assurances français.",
    "On te transmet un email entrant provenant d'un CLIENT DÉJÀ CONNU du cabinet.",
    "Classe la demande dans un seul niveau :",
    '- "niveau_0" : sinistre, déclaration de dommage, réclamation, mécontentement, résiliation,',
    "  sujet de santé (maladie, hospitalisation, arrêt de travail, remboursement de soins),",
    "  ou sujet de paiement (prélèvement, impayé, remboursement, cotisation non passée).",
    '- "niveau_1" : UNIQUEMENT si la demande correspond exactement à une de ces trois intentions,',
    "  sans aucune ambiguïté et sans autre demande associée :",
    '  * "info_contrat" : demande d\'information sur le contrat en cours (numéro, compagnie, cotisation, date d\'effet)',
    '  * "info_garanties" : demande d\'information sur les garanties souscrites',
    '  * "attestation" : demande d\'attestation d\'assurance',
    '- "niveau_2" : tout le reste (conseil, changement de situation, demande floue, plusieurs demandes,',
    "  ou intention ci-dessus mais dont tu n'es pas certain).",
    "Indique aussi si l'email contient une pièce KYC en pièce jointe (pièce d'identité, justificatif de",
    "domicile, RIB, Kbis) d'après les noms de fichiers. Cela se cumule avec le niveau.",
    "En cas de doute, réponds toujours niveau_2. N'invente rien.",
    "",
    `Expéditeur : ${email.expediteur_nom ?? ""} <${email.expediteur_email ?? ""}>`,
    `Objet : ${email.sujet ?? "(sans objet)"}`,
    `Pièces jointes : ${email.pieces_jointes.map((p) => p.nom).join(", ") || "aucune"}`,
    "Corps du message :",
    (email.texte ?? "").slice(0, 6000),
    "",
    'Réponds STRICTEMENT en JSON : {"niveau":"niveau_0|niveau_1|niveau_2",',
    '"intention":"info_contrat|info_garanties|attestation|null","piece_jointe_kyc":false,',
    '"pieces_kyc":[{"nom":"fichier.pdf","type":"cni|justificatif_domicile|rib|kbis"}],',
    '"confiance":0.0,"resume":"une phrase"}',
  ].join("\n");
}

/** Analyse IA d'un email client. Toute incertitude retombe en niveau_2. */
export async function analyserEmailClient(email: EmailClient): Promise<ClassificationRelation> {
  const cle = process.env["LOVABLE_API_KEY"];
  if (!cle) throw new Error("Analyse indisponible : clé IA absente du projet.");

  let derniere = "";
  for (const modele of MODELES) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({ model: modele, messages: [{ role: "user", content: consigne(email) }] }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const contenu = json.choices?.[0]?.message?.content ?? "";
      if (!contenu) throw new Error("Réponse IA vide");
      const brut = extraireJson(contenu);

      const niveauBrut = String(brut["niveau"] ?? "").toLowerCase().replace(/\s|-/g, "_");
      const confiance = Math.max(0, Math.min(1, Number(brut["confiance"]) || 0));
      const intentionBrut = texteOuNull(brut["intention"], 40)?.toLowerCase() ?? null;
      const intention: IntentionRelation =
        intentionBrut === "info_contrat" || intentionBrut === "info_garanties" || intentionBrut === "attestation"
          ? intentionBrut
          : null;

      // Garde-fou : niveau_1 exige une intention explicite ET une forte confiance.
      let niveau: NiveauRelation = "niveau_2";
      if (niveauBrut === "niveau_0") niveau = "niveau_0";
      else if (niveauBrut === "niveau_1" && intention && confiance >= SEUIL_NIVEAU_1) niveau = "niveau_1";

      const piecesBrut = Array.isArray(brut["pieces_kyc"]) ? (brut["pieces_kyc"] as any[]) : [];
      const pieces_kyc = piecesBrut
        .map((p) => ({
          nom: texteOuNull(p?.nom, 250) ?? "",
          type: String(p?.type ?? "").toLowerCase(),
        }))
        .filter(
          (p): p is { nom: string; type: "cni" | "justificatif_domicile" | "rib" | "kbis" } =>
            !!p.nom && ["cni", "justificatif_domicile", "rib", "kbis"].includes(p.type),
        );

      return {
        niveau,
        intention: niveau === "niveau_1" ? intention : intention,
        piece_jointe_kyc: brut["piece_jointe_kyc"] === true || pieces_kyc.length > 0,
        pieces_kyc,
        confiance,
        resume: texteOuNull(brut["resume"], 400) ?? "",
        modele,
      };
    }
    derniere = `${res.status} ${await res.text()}`;
    if (res.status === 429) throw new Error("Analyse IA momentanément saturée.");
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw new Error(`Analyse IA impossible : ${derniere}`);
}

type ClientMini = { id: string; nom: string | null; prenom: string | null; email: string | null };

type ContratMini = {
  id: string;
  numero: string | null;
  assureur: string | null;
  produit: string | null;
  produit_id: string | null;
  date_effet: string | null;
  prime_annuelle: number | null;
  fractionnement: string | null;
  statut: string | null;
};

function nomComplet(c: ClientMini): string {
  return [c.prenom, c.nom].filter(Boolean).join(" ") || "Madame, Monsieur";
}

function euros(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

async function contratActif(admin: Admin, clientId: string): Promise<ContratMini | null> {
  const { data } = await admin
    .from("contrats")
    .select("id, numero, assureur, produit, produit_id, date_effet, prime_annuelle, fractionnement, statut")
    .eq("client_id", clientId)
    .in("statut", STATUTS_CONTRAT_ACTIF)
    .order("date_effet", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ContratMini | null) ?? null;
}

async function lignesGaranties(admin: Admin, produitId: string | null) {
  if (!produitId) return null;
  const { data: produit } = await admin
    .from("produits")
    .select("nom, produit_familles(code)")
    .eq("id", produitId)
    .maybeSingle();
  const familleCode = (produit as any)?.produit_familles?.code ?? null;
  const grille = grillePourFamille(familleCode);
  if (!grille) return null;

  const { data: ligne } = await admin
    .from("produit_garanties")
    .select("grille_version, valeurs, statut")
    .eq("produit_id", produitId)
    .maybeSingle();
  const g = ligne as { grille_version: number; valeurs: ValeursGrille; statut: string } | null;
  if (!g || g.statut !== "valide" || g.grille_version !== grille.version) return null;

  const synthese = synthetiserGaranties(grille, g.valeurs ?? {});
  return synthese.detail
    .filter((d) => d.couverture === "oui" || d.couverture === "option")
    .map((d) => ({
      libelle: d.libelle + (d.couverture === "option" ? " (option)" : ""),
      valeur:
        [
          d.plafond ? `plafond ${d.plafond}` : null,
          d.franchise ? `franchise ${d.franchise}` : null,
          d.delai_carence ? `délai de carence ${d.delai_carence}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "Couvert",
    }));
}

async function journaliser(
  admin: Admin,
  clientId: string,
  titre: string,
  contenu: string,
  type: "email" | "systeme" = "email",
) {
  try {
    await admin.from("activites").insert({ client_id: clientId, type, titre, contenu: contenu.slice(0, 6000) });
  } catch (e) {
    console.error("[agent-relation-client] activité non enregistrée", e);
  }
}

function lienMail(messageId: string | null): string {
  return messageId ? `https://mail.google.com/mail/u/0/#all/${messageId}` : "";
}

async function enregistrerReponse(
  admin: Admin,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("client_reponses_ia").upsert(row as never, { onConflict: "gmail_message_id" });
  } catch (e) {
    console.error("[agent-relation-client] enregistrement réponse impossible", e);
  }
}

async function envoyerReponse(
  destinataire: string,
  donnees: {
    clientName: string;
    titre: string;
    paragraphes: string[];
    lignes?: { libelle: string; valeur: string }[];
  },
  attachments?: { name: string; base64: string }[],
): Promise<void> {
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  await sendTemplateEmail("relation-client-reponse", destinataire, {
    templateData: { ...donnees, cabinetName: CABINET },
    ...(attachments && attachments.length ? { attachments } : {}),
  });
}

/** Pièces KYC en pièce jointe : dépôt + pipeline existant (CNI → LCB-FT). */
async function routerPiecesKyc(
  admin: Admin,
  params: {
    client: ClientMini;
    email: EmailClient;
    classification: ClassificationRelation;
    gmail_message_id: string;
    userId: string;
  },
): Promise<number> {
  const { client, email, classification } = params;
  const parNom = new Map(email.pieces_jointes.map((p) => [p.nom.toLowerCase(), p]));
  let deposees = 0;

  const { telechargerPieceJointe } = await import("@/lib/gmail.server");
  for (const piece of classification.pieces_kyc) {
    const jointe = parNom.get(piece.nom.toLowerCase());
    if (!jointe?.attachment_id) continue;
    try {
      const { base64 } = await telechargerPieceJointe(params.gmail_message_id, jointe.attachment_id);
      const octets = Buffer.from(base64, "base64");
      const chemin = `${client.id}/kyc/${piece.type}-${Date.now()}-${jointe.nom}`;
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(chemin, octets, { contentType: jointe.mime ?? "application/octet-stream" });
      if (upErr) throw new Error(upErr.message);

      const { data: insere, error: insErr } = await admin
        .from("client_kyc_documents")
        .insert({
          client_id: client.id,
          type: piece.type,
          nom: jointe.nom,
          storage_path: chemin,
          statut: "a_valider",
          notes: "Reçu en pièce jointe d'un email client (agent relation client)",
          uploaded_by: params.userId,
        })
        .select("id")
        .maybeSingle();
      if (insErr) throw new Error(insErr.message);
      deposees += 1;

      await journaliser(
        admin,
        client.id,
        "Pièce KYC reçue par email et déposée automatiquement",
        `Document : ${jointe.nom} (${piece.type})\nEmail : ${lienMail(params.gmail_message_id)}`,
        "systeme",
      );

      if (piece.type === "cni" && insere) {
        const { traiterPieceIdentiteEtRelancerLcb } = await import("@/lib/cni-extraction.server");
        await traiterPieceIdentiteEtRelancerLcb(admin as never, (insere as { id: string }).id);
      }
    } catch (e) {
      await creerTacheAdmin(admin as never, {
        titre: `Pièce jointe KYC non traitée — ${nomComplet(client)}`,
        description: [
          `Fichier : ${piece.nom}`,
          `Erreur : ${e instanceof Error ? e.message : "erreur inconnue"}`,
          `Email : ${lienMail(params.gmail_message_id)}`,
          "Action : déposer la pièce manuellement depuis l'onglet Conformité de la fiche client.",
        ].join("\n"),
        client_id: client.id,
        created_by: params.userId,
      });
    }
  }
  return deposees;
}

export interface ResultatRelationClient {
  niveau: NiveauRelation;
  intention: IntentionRelation;
  action: "tache_urgente" | "reponse_envoyee" | "brouillon" | "rien";
  pieces_kyc: number;
  motif?: string;
}

/**
 * Traite un email entrant rattaché à un client existant.
 * Aucune étape ne doit échouer silencieusement : toute erreur crée une tâche.
 */
export async function traiterEmailClient(
  admin: Admin,
  params: {
    client_id: string;
    email: EmailClient;
    gmail_message_id: string;
    gmail_thread_id?: string | null;
    userId: string;
  },
): Promise<ResultatRelationClient> {
  const { email, gmail_message_id } = params;

  const { data: clientRow } = await admin
    .from("clients")
    .select("id, nom, prenom, email")
    .eq("id", params.client_id)
    .maybeSingle();
  const client = (clientRow as ClientMini | null) ?? null;
  if (!client) throw new Error("Fiche client introuvable");

  const classification = await analyserEmailClient(email);
  const base = {
    client_id: client.id,
    gmail_message_id,
    gmail_thread_id: params.gmail_thread_id ?? null,
    email_sujet: email.sujet ?? null,
    categorie: classification.niveau,
    intention: classification.intention,
    confiance: classification.confiance,
    resume: classification.resume,
    destinataire: client.email,
    created_by: params.userId,
    updated_at: new Date().toISOString(),
  };

  // Pièces KYC : routées quel que soit le niveau de la demande.
  const piecesKyc = classification.piece_jointe_kyc
    ? await routerPiecesKyc(admin, { client, email, classification, gmail_message_id, userId: params.userId })
    : 0;

  const brouillon = async (motif: string, objet: string, corps: string): Promise<ResultatRelationClient> => {
    await enregistrerReponse(admin, {
      ...base,
      categorie: "niveau_2",
      statut: "brouillon",
      motif,
      objet,
      corps,
    });
    await journaliser(
      admin,
      client.id,
      "Réponse préparée en brouillon (à valider)",
      `${motif}\nEmail : ${lienMail(gmail_message_id)}\n\n${corps}`,
    );
    return {
      niveau: "niveau_2",
      intention: classification.intention,
      action: "brouillon",
      pieces_kyc: piecesKyc,
      motif,
    };
  };

  // ---- Niveau 0 : aucune automatisation, tâche urgente.
  if (classification.niveau === "niveau_0") {
    await creerTacheAdmin(admin as never, {
      titre: `Sinistre/réclamation reçu — ${nomComplet(client)}`,
      description: [
        `Objet : ${email.sujet ?? "(sans objet)"}`,
        `Résumé IA : ${classification.resume || "non fourni"}`,
        `Email : ${lienMail(gmail_message_id)}`,
        "Aucune réponse automatique n'a été envoyée : traitement humain obligatoire.",
      ].join("\n"),
      client_id: client.id,
      priorite: "urgente",
      created_by: params.userId,
    });
    await enregistrerReponse(admin, { ...base, statut: "aucune_reponse", motif: "Niveau 0 — traitement humain" });
    await journaliser(
      admin,
      client.id,
      "Email sensible reçu — traitement humain requis",
      `${classification.resume}\nEmail : ${lienMail(gmail_message_id)}`,
    );
    return { niveau: "niveau_0", intention: null, action: "tache_urgente", pieces_kyc: piecesKyc };
  }

  const objetReponse = `Votre demande — ${email.sujet ?? "votre contrat"}`.slice(0, 200);

  // ---- Niveau 1 : réponses automatiques strictement cadrées.
  if (classification.niveau === "niveau_1" && client.email) {
    const contrat = await contratActif(admin, client.id);
    if (!contrat) {
      return brouillon(
        "Aucun contrat actif trouvé sur la fiche client : réponse à compléter manuellement.",
        objetReponse,
        `Bonjour ${nomComplet(client)},\n\nNous revenons vers vous concernant votre demande.\n\n[À compléter : aucun contrat actif n'a été trouvé sur la fiche client.]\n\nCordialement,\nL'équipe ${CABINET}`,
      );
    }

    if (classification.intention === "info_contrat") {
      const lignes = [
        { libelle: "Numéro de contrat", valeur: contrat.numero ?? "—" },
        { libelle: "Compagnie", valeur: contrat.assureur ?? "—" },
        { libelle: "Produit", valeur: contrat.produit ?? "—" },
        {
          libelle: "Cotisation annuelle",
          valeur: `${euros(contrat.prime_annuelle)}${contrat.fractionnement ? ` (${contrat.fractionnement})` : ""}`,
        },
        {
          libelle: "Date d'effet",
          valeur: contrat.date_effet ? new Date(contrat.date_effet).toLocaleDateString("fr-FR") : "—",
        },
      ];
      await envoyerReponse(client.email, {
        clientName: nomComplet(client),
        titre: "Les informations de votre contrat en cours",
        paragraphes: [
          "Vous trouverez ci-dessous les informations de votre contrat en cours.",
          "Pour toute autre question, il vous suffit de répondre à cet email.",
        ],
        lignes,
      });
      await enregistrerReponse(admin, {
        ...base,
        contrat_id: contrat.id,
        statut: "envoye",
        objet: objetReponse,
        corps: lignes.map((l) => `${l.libelle} : ${l.valeur}`).join("\n"),
        envoye_le: new Date().toISOString(),
      });
      await journaliser(
        admin,
        client.id,
        "Réponse automatique envoyée — informations du contrat",
        `Email : ${lienMail(gmail_message_id)}\n\n${lignes.map((l) => `${l.libelle} : ${l.valeur}`).join("\n")}`,
      );
      return { niveau: "niveau_1", intention: "info_contrat", action: "reponse_envoyee", pieces_kyc: piecesKyc };
    }

    if (classification.intention === "info_garanties") {
      const lignes = await lignesGaranties(admin, contrat.produit_id);
      if (!lignes || lignes.length === 0) {
        return brouillon(
          "Aucune grille de garanties validée n'est disponible pour ce produit : détail à fournir manuellement.",
          objetReponse,
          `Bonjour ${nomComplet(client)},\n\nVous trouverez ci-dessous le détail des garanties de votre contrat ${contrat.numero ?? ""}.\n\n[À compléter : grille de garanties non validée pour ce produit.]\n\nCordialement,\nL'équipe ${CABINET}`,
        );
      }
      await envoyerReponse(client.email, {
        clientName: nomComplet(client),
        titre: "Le détail des garanties de votre contrat",
        paragraphes: [
          `Voici le détail des garanties de votre contrat ${contrat.numero ?? ""} (${contrat.assureur ?? "votre assureur"}).`,
          "Les conditions générales du contrat restent la référence contractuelle.",
        ],
        lignes,
      });
      await enregistrerReponse(admin, {
        ...base,
        contrat_id: contrat.id,
        statut: "envoye",
        objet: objetReponse,
        corps: lignes.map((l) => `${l.libelle} : ${l.valeur}`).join("\n"),
        envoye_le: new Date().toISOString(),
      });
      await journaliser(
        admin,
        client.id,
        "Réponse automatique envoyée — détail des garanties",
        `Email : ${lienMail(gmail_message_id)}\n\n${lignes.map((l) => `${l.libelle} : ${l.valeur}`).join("\n")}`,
      );
      return { niveau: "niveau_1", intention: "info_garanties", action: "reponse_envoyee", pieces_kyc: piecesKyc };
    }

    if (classification.intention === "attestation") {
      const { data: docs } = await admin
        .from("documents")
        .select("id, file_name, storage_path, mime_type, type_document")
        .eq("contrat_id", contrat.id)
        .eq("type_document", TYPE_ATTESTATION)
        .order("created_at", { ascending: false })
        .limit(1);
      const doc = ((docs ?? []) as any[])[0] as
        | { file_name: string; storage_path: string; mime_type: string | null }
        | undefined;

      if (!doc) {
        return brouillon(
          "Aucune attestation trouvée sur le contrat, à fournir manuellement.",
          objetReponse,
          `Bonjour ${nomComplet(client)},\n\nVous trouverez ci-joint votre attestation d'assurance pour le contrat ${contrat.numero ?? ""}.\n\n[À compléter : aucune attestation n'est archivée sur le contrat — la demander à la compagnie puis la joindre.]\n\nCordialement,\nL'équipe ${CABINET}`,
        );
      }

      const { data: fichier, error: dlErr } = await admin.storage.from(BUCKET).download(doc.storage_path);
      if (dlErr || !fichier) {
        return brouillon(
          "Attestation référencée mais fichier illisible dans le stockage : à joindre manuellement.",
          objetReponse,
          `Bonjour ${nomComplet(client)},\n\nVous trouverez ci-joint votre attestation d'assurance.\n\n[À compléter : fichier introuvable dans le stockage.]\n\nCordialement,\nL'équipe ${CABINET}`,
        );
      }
      const base64 = Buffer.from(await fichier.arrayBuffer()).toString("base64");
      await envoyerReponse(
        client.email,
        {
          clientName: nomComplet(client),
          titre: "Votre attestation d'assurance",
          paragraphes: [
            `Vous trouverez en pièce jointe votre attestation d'assurance pour le contrat ${contrat.numero ?? ""} (${contrat.assureur ?? "votre assureur"}).`,
            "Nous restons à votre disposition pour toute précision.",
          ],
        },
        [{ name: doc.file_name, base64 }],
      );
      await enregistrerReponse(admin, {
        ...base,
        contrat_id: contrat.id,
        statut: "envoye",
        objet: objetReponse,
        corps: `Attestation envoyée en pièce jointe : ${doc.file_name}`,
        envoye_le: new Date().toISOString(),
      });
      await journaliser(
        admin,
        client.id,
        "Attestation d'assurance envoyée automatiquement",
        `Pièce jointe : ${doc.file_name}\nEmail : ${lienMail(gmail_message_id)}`,
      );
      return { niveau: "niveau_1", intention: "attestation", action: "reponse_envoyee", pieces_kyc: piecesKyc };
    }
  }

  // ---- Niveau 2 (et tout doute) : brouillon à valider.
  return brouillon(
    classification.niveau === "niveau_1"
      ? "Adresse email du client absente : envoi automatique impossible."
      : `Classification niveau 2 (confiance ${(classification.confiance * 100).toFixed(0)} %) — validation humaine requise.`,
    objetReponse,
    [
      `Bonjour ${nomComplet(client)},`,
      "",
      "Nous avons bien reçu votre message et revenons vers vous.",
      "",
      `[Demande résumée : ${classification.resume || "à qualifier"}]`,
      "",
      `Cordialement,\nL'équipe ${CABINET}`,
    ].join("\n"),
  );
}
