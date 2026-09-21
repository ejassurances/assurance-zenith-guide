import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { creerTacheAdmin } from "@/lib/agent-taches.server";

/**
 * Bouclage LCB-FT : lecture IA de la pièce d'identité déposée par le prospect,
 * complétion de la date de naissance sur la fiche client, puis relance
 * automatique du contrôle LCB-FT resté « en attente d'informations ».
 */

type Admin = SupabaseClient<Database>;

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODELES = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];
const BUCKETS = ["conformite-documents", "dossier-documents"];
const TAILLE_MAX = 12 * 1024 * 1024;

const PROMPT = [
  "Tu lis une pièce d'identité (CNI, passeport ou titre de séjour).",
  "Extrais uniquement les informations d'état civil du titulaire.",
  "",
  "Réponds STRICTEMENT en JSON, sans texte autour, au format :",
  '{"civilite":"M."|"Mme"|null,"nom":"","prenom":"","date_naissance":"AAAA-MM-JJ","lieu_naissance":"","pays_naissance":"","nationalite":"","date_expiration":"AAAA-MM-JJ","fiable":true}',
  "",
  "Règles :",
  "- Les dates au format ISO AAAA-MM-JJ. Si illisible ou absente, mets null.",
  "- `nom` = nom de naissance / nom de famille ; `prenom` = premier prénom.",
  "- `civilite` = « M. » ou « Mme » selon le sexe indiqué, sinon null.",
  "- `lieu_naissance` = ville de naissance si visible, sinon null ; `pays_naissance` = pays si visible.",
  "- `nationalite` en français (ex. « Française »), sinon null.",
  "- `date_expiration` = date de fin de validité de la pièce, sinon null.",
  "- `fiable` = false si le document est illisible, tronqué, ou si tu n'es pas certain des valeurs.",
  "- N'invente jamais une valeur.",
].join("\n");

type Extraction = {
  civilite: string | null;
  nom: string | null;
  prenom: string | null;
  date_naissance: string | null;
  lieu_naissance: string | null;
  pays_naissance: string | null;
  nationalite: string | null;
  date_expiration: string | null;
  fiable: boolean;
};

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function extraireJson(texte: string): unknown {
  const nettoye = texte.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(nettoye);
  } catch {
    const debut = nettoye.indexOf("{");
    const fin = nettoye.lastIndexOf("}");
    if (debut === -1 || fin <= debut) throw new Error("Réponse IA illisible (JSON attendu)");
    return JSON.parse(nettoye.slice(debut, fin + 1));
  }
}

async function appelerIa(fichier: { nom: string; mime: string; base64: string }): Promise<Extraction> {
  const cle = process.env["LOVABLE_API_KEY"];
  if (!cle) throw new Error("Lecture indisponible : clé IA absente du projet.");

  const contenu = [
    { type: "text", text: PROMPT },
    { type: "file", file: { filename: fichier.nom, file_data: `data:${fichier.mime};base64,${fichier.base64}` } },
  ];

  let derniere = "";
  for (const modele of MODELES) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({ model: modele, messages: [{ role: "user", content: contenu }] }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const texte = json.choices?.[0]?.message?.content ?? "";
      if (!texte) throw new Error("Réponse IA vide");
      const brut = extraireJson(texte) as Record<string, unknown>;
      return {
        nom: typeof brut["nom"] === "string" ? (brut["nom"] as string).trim() : null,
        prenom: typeof brut["prenom"] === "string" ? (brut["prenom"] as string).trim() : null,
        date_naissance: typeof brut["date_naissance"] === "string" ? (brut["date_naissance"] as string).trim() : null,
        lieu_naissance: typeof brut["lieu_naissance"] === "string" ? (brut["lieu_naissance"] as string).trim() : null,
        fiable: brut["fiable"] !== false,
      };
    }
    derniere = `${res.status} ${await res.text()}`;
    if (res.status === 429) throw new Error("Lecture IA momentanément saturée, réessayez dans une minute.");
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw new Error(`Lecture IA impossible : ${derniere}`);
}

/** Comparaison souple des noms (accents, casse, tirets, ordre des prénoms composés). */
function normaliser(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}

function concorde(fiche: string | null, extrait: string | null): boolean {
  const a = normaliser(fiche ?? "");
  const b = normaliser(extrait ?? "");
  if (!a || !b) return false;
  if (a === b) return true;
  const motsA = a.split(" ");
  const motsB = b.split(" ");
  return motsA.some((m) => m.length > 2 && motsB.includes(m));
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function dateValide(v: string | null): boolean {
  if (!v || !ISO.test(v)) return false;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return false;
  const annee = Number(v.slice(0, 4));
  return annee >= 1900 && t < Date.now();
}

async function telecharger(admin: Admin, path: string): Promise<{ blob: Blob } | null> {
  for (const bucket of BUCKETS) {
    const { data } = await admin.storage.from(bucket).download(path);
    if (data) return { blob: data };
  }
  return null;
}

export type ResultatCni =
  | { statut: "ignore"; raison: string }
  | { statut: "ecart"; raison: string }
  | { statut: "complete"; date_naissance: string; lcb: string | null };

/**
 * Traite une pièce d'identité déposée : extraction IA, complétion de la fiche
 * et relance du contrôle LCB-FT si celui-ci attendait des informations.
 */
export async function traiterPieceIdentiteEtRelancerLcb(
  admin: Admin,
  kycDocumentId: string,
): Promise<ResultatCni> {
  const { data: doc } = await admin
    .from("client_kyc_documents")
    .select("id, client_id, type, nom, storage_path")
    .eq("id", kycDocumentId)
    .maybeSingle();
  if (!doc) return { statut: "ignore", raison: "Document introuvable" };
  const d = doc as {
    client_id: string;
    type: string;
    nom: string | null;
    storage_path: string;
  };
  if (d.type !== "cni") return { statut: "ignore", raison: "Type de document non exploitable" };

  // On n'agit que si le contrôle LCB-FT attend justement ces informations.
  const { data: derniere } = await admin
    .from("client_lcb_verifications")
    .select("id, statut")
    .eq("client_id", d.client_id)
    .order("verifie_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((derniere as { statut: string } | null)?.statut !== "en_attente_infos") {
    return { statut: "ignore", raison: "Aucun contrôle LCB-FT en attente d'informations" };
  }

  const { data: client } = await admin
    .from("clients")
    .select("id, nom, prenom, date_naissance, lieu_naissance")
    .eq("id", d.client_id)
    .maybeSingle();
  if (!client) return { statut: "ignore", raison: "Fiche client introuvable" };
  const c = client as {
    id: string;
    nom: string | null;
    prenom: string | null;
    date_naissance: string | null;
    lieu_naissance: string | null;
  };

  let extraction: Extraction;
  try {
    const fichier = await telecharger(admin, d.storage_path);
    if (!fichier) throw new Error("Fichier indisponible dans le stockage");
    const buffer = Buffer.from(await fichier.blob.arrayBuffer());
    if (buffer.byteLength === 0) throw new Error("Fichier vide");
    if (buffer.byteLength > TAILLE_MAX) throw new Error("Fichier trop volumineux (12 Mo maximum)");
    extraction = await appelerIa({
      nom: d.nom || "piece-identite",
      mime: fichier.blob.type || "application/pdf",
      base64: buffer.toString("base64"),
    });
  } catch (e) {
    const raison = e instanceof Error ? e.message : "erreur inconnue";
    await creerTacheAdmin(admin, {
      titre: "Pièce d'identité illisible — LCB-FT en attente",
      description: `La lecture automatique de la pièce d'identité de ${c.prenom ?? ""} ${c.nom ?? ""} a échoué (${raison}).\nAction : saisir manuellement la date de naissance sur la fiche puis relancer le contrôle LCB-FT depuis l'onglet Conformité.`,
      client_id: c.id,
    });
    return { statut: "ecart", raison };
  }

  const ecarts: string[] = [];
  if (!extraction.fiable) ecarts.push("l'IA signale une lecture peu fiable");
  if (!dateValide(extraction.date_naissance)) ecarts.push("date de naissance illisible ou invalide");
  if (!concorde(c.nom, extraction.nom)) {
    ecarts.push(`nom différent (fiche « ${c.nom ?? "—"} » / pièce « ${extraction.nom ?? "—"} »)`);
  }
  if (c.prenom && !concorde(c.prenom, extraction.prenom)) {
    ecarts.push(`prénom différent (fiche « ${c.prenom} » / pièce « ${extraction.prenom ?? "—"} »)`);
  }

  if (ecarts.length > 0) {
    await creerTacheAdmin(admin, {
      titre: "Pièce d'identité — écart avec la fiche client",
      description: `Lecture automatique de la pièce d'identité de ${c.prenom ?? ""} ${c.nom ?? ""} non appliquée.\nÉcarts constatés :\n- ${ecarts.join("\n- ")}\nAction : vérifier la pièce, corriger la fiche manuellement puis relancer le contrôle LCB-FT.`,
      client_id: c.id,
    });
    await admin
      .from("activites")
      .insert({
        client_id: c.id,
        type: "systeme",
        titre: "Lecture automatique de la pièce d'identité non appliquée",
        contenu: `Écarts constatés :\n- ${ecarts.join("\n- ")}`,
      })
      .then(
        () => undefined,
        (e: unknown) => console.error("[CNI] trace écart non enregistrée", e),
      );
    return { statut: "ecart", raison: ecarts.join(" ; ") };
  }

  const dateNaissance = extraction.date_naissance as string;
  const patch: Record<string, unknown> = { date_naissance: dateNaissance };
  if (!c.lieu_naissance && extraction.lieu_naissance) patch["lieu_naissance"] = extraction.lieu_naissance;

  const { error: uErr } = await admin.from("clients").update(patch as never).eq("id", c.id);
  if (uErr) {
    await creerTacheAdmin(admin, {
      titre: "Date de naissance non enregistrée — LCB-FT en attente",
      description: `Mise à jour impossible de la fiche de ${c.prenom ?? ""} ${c.nom ?? ""} : ${uErr.message}`,
      client_id: c.id,
    });
    return { statut: "ecart", raison: uErr.message };
  }

  await admin
    .from("activites")
    .insert({
      client_id: c.id,
      type: "systeme",
      titre: "Date de naissance complétée automatiquement depuis la pièce d'identité déposée",
      contenu: `Date de naissance : ${dateNaissance}${patch["lieu_naissance"] ? `\nLieu de naissance : ${String(patch["lieu_naissance"])}` : ""}\nSource : ${d.nom ?? "pièce d'identité"} déposée par le client.\nLe contrôle LCB-FT est relancé automatiquement.`,
    })
    .then(
      () => undefined,
      (e: unknown) => console.error("[CNI] trace complétion non enregistrée", e),
    );

  let statutLcb: string | null = null;
  try {
    const { lancerLcbAutomatique } = await import("@/lib/dossier-automation.server");
    const res = await lancerLcbAutomatique(admin, {
      client_id: c.id,
      nom: c.nom ?? extraction.nom ?? "",
      prenom: c.prenom ?? extraction.prenom ?? null,
      date_naissance: dateNaissance,
    });
    statutLcb = (res as { statut?: string } | null)?.statut ?? null;
  } catch (e) {
    await creerTacheAdmin(admin, {
      titre: "Relance LCB-FT automatique en échec",
      description: `La date de naissance a bien été complétée, mais le contrôle LCB-FT n'a pas pu être relancé : ${e instanceof Error ? e.message : "erreur inconnue"}.\nAction : relancer le contrôle depuis l'onglet Conformité.`,
      client_id: c.id,
    });
  }

  return { statut: "complete", date_naissance: dateNaissance, lcb: statutLcb };
}
