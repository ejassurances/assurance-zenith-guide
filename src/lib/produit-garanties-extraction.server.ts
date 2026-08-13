import type { SupabaseClient } from "@supabase/supabase-js";
import {
  grillePourFamille,
  type GrilleGaranties,
  type ValeurGarantie,
  type ValeursGrille,
} from "@/lib/garanties-grille";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
/** Modèles essayés dans l'ordre (entrée PDF acceptée). */
const MODELES = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];
const TAILLE_MAX_PDF = 12 * 1024 * 1024;

const COUVERTURES = new Set(["oui", "non", "option", "inconnu"]);

function consigne(grille: GrilleGaranties) {
  const lignes = grille.garanties.map((g) => `- ${g.code} : ${g.libelle}`).join("\n");
  return [
    "Tu analyses les conditions générales ou l'IPID d'un produit d'assurance français.",
    `Typologie : ${grille.libelle}.`,
    "Remplis la grille de garanties ci-dessous UNIQUEMENT à partir du document fourni.",
    "",
    "Règles impératives :",
    "- N'infère jamais une garantie : si le document ne la mentionne pas explicitement comme couverte, réponds \"non\" lorsqu'il l'exclut, ou \"inconnu\" lorsqu'il est muet.",
    '- "option" uniquement si le document présente la garantie comme facultative/en supplément.',
    "- Pour chaque ligne, cite un extrait littéral court du document (champ extrait) qui justifie ta réponse ; laisse-le vide si tu réponds \"inconnu\".",
    "- Indique le plafond et la franchise tels qu'écrits (texte court), sinon null.",
    "- confiance : nombre entre 0 et 1.",
    "",
    "Garanties de la grille :",
    lignes,
    "",
    'Réponds STRICTEMENT en JSON : {"garanties":{"<code>":{"couverture":"oui|non|option|inconnu","plafond":null,"franchise":null,"conditions":null,"extrait":"...","confiance":0.9}},"avertissements":"..."}',
  ].join("\n");
}

function normaliser(grille: GrilleGaranties, brut: unknown): { valeurs: ValeursGrille; avertissements: string } {
  const obj = (brut ?? {}) as Record<string, unknown>;
  const src = (obj["garanties"] ?? {}) as Record<string, unknown>;
  const valeurs: ValeursGrille = {};
  for (const g of grille.garanties) {
    const raw = (src[g.code] ?? {}) as Record<string, unknown>;
    const couv = String(raw["couverture"] ?? "inconnu");
    const v: ValeurGarantie = {
      couverture: (COUVERTURES.has(couv) ? couv : "inconnu") as ValeurGarantie["couverture"],
      plafond: raw["plafond"] ? String(raw["plafond"]).slice(0, 300) : null,
      franchise: raw["franchise"] ? String(raw["franchise"]).slice(0, 300) : null,
      conditions: raw["conditions"] ? String(raw["conditions"]).slice(0, 800) : null,
      extrait: raw["extrait"] ? String(raw["extrait"]).slice(0, 1200) : null,
      confiance: typeof raw["confiance"] === "number" ? Math.max(0, Math.min(1, raw["confiance"])) : null,
    };
    valeurs[g.code] = v;
  }
  const avertissements = obj["avertissements"] ? String(obj["avertissements"]).slice(0, 2000) : "";
  return { valeurs, avertissements };
}

function extraireJson(texte: string): unknown {
  const nettoye = texte.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(nettoye);
  } catch {
    const debut = nettoye.indexOf("{");
    const fin = nettoye.lastIndexOf("}");
    if (debut === -1 || fin <= debut) throw new Error("Réponse IA illisible (JSON attendu)");
    return JSON.parse(nettoye.slice(debut, fin + 1));
  }
}

async function appelerIa(prompt: string, fichier: { nom: string; mime: string; base64: string }) {
  const cle = process.env["LOVABLE_API_KEY"];
  if (!cle) throw new Error("Analyse indisponible : clé IA absente du projet.");

  let derniere = "";
  for (const modele of MODELES) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({
        model: modele,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "file",
                file: { filename: fichier.nom, file_data: `data:${fichier.mime};base64,${fichier.base64}` },
              },
            ],
          },
        ],
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const contenu = json.choices?.[0]?.message?.content ?? "";
      if (!contenu) throw new Error("Réponse IA vide");
      return { modele, brut: extraireJson(contenu) };
    }
    derniere = `${res.status} ${await res.text()}`;
    if (res.status === 429) throw new Error("Analyse IA momentanément saturée, réessayez dans une minute.");
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw new Error(`Analyse IA impossible : ${derniere}`);
}

/**
 * Analyse un CG/IPID d'un produit et enregistre une PROPOSITION de grille.
 * N'écrit jamais dans `produit_garanties` : la validation humaine est requise.
 */
export async function analyserDocumentProduit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  documentId: string,
  userId: string,
) {
  const { data: doc, error: dErr } = await supabase
    .from("produit_documents")
    .select("id, produit_id, nom, type, storage_path, mime_type")
    .eq("id", documentId)
    .maybeSingle();
  if (dErr || !doc) throw new Error("Document introuvable ou accès refusé");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = doc as any;
  if (!["conditions_generales", "ipid"].includes(d.type)) {
    throw new Error("Seuls les conditions générales et les IPID peuvent être analysés.");
  }

  const { data: produit, error: pErr } = await supabase
    .from("produits")
    .select("id, nom, famille_id, produit_familles(code, nom)")
    .eq("id", d.produit_id)
    .maybeSingle();
  if (pErr || !produit) throw new Error("Produit introuvable ou accès refusé");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = produit as any;
  const familleCode: string | null = p.produit_familles?.code ?? null;
  const grille = grillePourFamille(familleCode);
  if (!grille) throw new Error("Aucune grille de garanties n'est définie pour cette famille de produits.");

  const { data: blob, error: sErr } = await supabase.storage.from("produits-documents").download(d.storage_path);
  if (sErr || !blob) throw new Error("Téléchargement du document impossible");
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error("Le document est vide");
  if (buffer.byteLength > TAILLE_MAX_PDF) {
    throw new Error("Document trop volumineux pour l'analyse automatique (12 Mo maximum).");
  }

  const { modele, brut } = await appelerIa(consigne(grille), {
    nom: d.nom || "document.pdf",
    mime: d.mime_type || "application/pdf",
    base64: buffer.toString("base64"),
  });
  const { valeurs, avertissements } = normaliser(grille, brut);

  const { data: inserted, error: iErr } = await supabase
    .from("produit_garanties_propositions")
    .insert({
      produit_id: d.produit_id,
      document_id: d.id,
      famille_code: grille.familleCode,
      grille_version: grille.version,
      modele_ia: modele,
      valeurs,
      avertissements: avertissements || null,
      statut: "proposee",
      created_by: userId,
    })
    .select("id")
    .single();
  if (iErr || !inserted) throw new Error(iErr?.message ?? "Enregistrement de la proposition impossible");

  return { proposition_id: inserted.id as string, valeurs, avertissements, modele };
}
