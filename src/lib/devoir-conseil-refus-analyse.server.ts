import type { SupabaseClient } from "@supabase/supabase-js";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODELES = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];

type Recommandation = "contre_proposition" | "cloture_perdue";

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

async function appelerIa(prompt: string) {
  const cle = process.env["LOVABLE_API_KEY"];
  if (!cle) throw new Error("Analyse indisponible : clé IA absente du projet.");

  let derniere = "";
  for (const modele of MODELES) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({
        model: modele,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const contenu = json.choices?.[0]?.message?.content ?? "";
      if (!contenu) throw new Error("Réponse IA vide");
      return { modele, brut: extraireJson(contenu) };
    }
    derniere = `${res.status} ${await res.text()}`;
    if (res.status === 429) throw new Error("Analyse IA momentanément saturée.");
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw new Error(`Analyse IA impossible : ${derniere}`);
}

function consigne(ctx: {
  motif: string;
  devoir: Record<string, unknown>;
  offres: unknown;
  recueil: unknown;
  branche: string | null;
}) {
  return [
    "Tu es analyste conformité dans un cabinet de courtage en assurances français (ACPR / DDA).",
    "Un client vient de REFUSER le devoir de conseil qui lui a été présenté.",
    "Ton rôle : déterminer s'il est pertinent de préparer une CONTRE-PROPOSITION commerciale adaptée,",
    "ou s'il faut CLÔTURER le dossier en « perdu » (refus de principe, client injoignable, projet abandonné,",
    "besoin hors de notre champ, refus non travaillable).",
    "",
    `Branche d'assurance : ${ctx.branche ?? "non précisée"}`,
    `Motif de refus exprimé par le client : ${ctx.motif}`,
    "",
    "Devoir de conseil refusé (JSON) :",
    JSON.stringify(ctx.devoir).slice(0, 6000),
    "Offres comparées (JSON) :",
    JSON.stringify(ctx.offres ?? []).slice(0, 4000),
    "Recueil des besoins du dossier (JSON) :",
    JSON.stringify(ctx.recueil ?? {}).slice(0, 6000),
    "",
    "Règles :",
    "- Si le motif porte sur le prix, une garantie, une compagnie, un délai ou un malentendu : recommande 'contre_proposition'.",
    "- Si le motif exprime un abandon du projet, un refus définitif, une souscription ailleurs déjà signée",
    "  ou une inéligibilité : recommande 'cloture_perdue'.",
    "- La suggestion doit être concrète et actionnable pour le courtier (compagnie/produit à envisager,",
    "  ajustement de cotisation ou de quotité, garantie à revoir, argument à reprendre), sans promesse commerciale chiffrée fausse.",
    "- N'invente aucun tarif précis : parle en axes d'ajustement.",
    "",
    'Réponds STRICTEMENT en JSON : {"recommandation":"contre_proposition|cloture_perdue","synthese":"...","suggestion_contre_proposition":"..."}',
  ].join("\n");
}

/**
 * Analyse IA du motif de refus d'un devoir de conseil et enregistrement
 * d'une recommandation à destination du cabinet (validation humaine obligatoire).
 */
export async function analyserRefusDevoirConseil(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  devoirId: string,
) {
  const { data: devoir, error } = await supabase
    .from("devoirs_conseil")
    .select("*")
    .eq("id", devoirId)
    .maybeSingle();
  if (error || !devoir) throw new Error("Devoir de conseil introuvable");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = devoir as any;
  const motif = String(d.refus_motif ?? "").trim();
  if (!motif) throw new Error("Aucun motif de refus à analyser");

  const { data: dossier } = await supabase
    .from("dossiers")
    .select("id, type_assurance, recueil_besoins")
    .eq("id", d.dossier_id)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dos = dossier as any;

  const { modele, brut } = await appelerIa(
    consigne({
      motif,
      devoir: {
        recommandation: d.recommandation,
        motifs: d.motifs,
        mises_en_garde: d.mises_en_garde,
        compagnie: d.compagnie,
        produit: d.produit,
        cotisation_mensuelle: d.cotisation_mensuelle,
        frais_dossier: d.frais_dossier,
        frais_souscription: d.frais_souscription,
        economie_estimee: d.economie_estimee,
        garanties: d.garanties,
        exigences_client: d.exigences_client,
      },
      offres: d.offres,
      recueil: dos?.recueil_besoins ?? null,
      branche: dos?.type_assurance ?? null,
    }),
  );

  const obj = (brut ?? {}) as Record<string, unknown>;
  const reco: Recommandation =
    String(obj["recommandation"] ?? "") === "cloture_perdue" ? "cloture_perdue" : "contre_proposition";
  const synthese = String(obj["synthese"] ?? "").slice(0, 4000) || "Analyse indisponible.";
  const suggestion =
    reco === "contre_proposition" && obj["suggestion_contre_proposition"]
      ? String(obj["suggestion_contre_proposition"]).slice(0, 4000)
      : null;

  const { data: inserted, error: iErr } = await supabase
    .from("devoir_conseil_refus_analyses")
    .insert({
      devoir_id: devoirId,
      dossier_id: d.dossier_id,
      motif_client: motif.slice(0, 4000),
      recommandation_ia: reco,
      synthese,
      suggestion_contre_proposition: suggestion,
      modele_ia: modele,
      statut: "en_attente",
    })
    .select("id")
    .single();
  if (iErr || !inserted) throw new Error(iErr?.message ?? "Enregistrement de l'analyse impossible");

  return { analyse_id: inserted.id as string, recommandation: reco, synthese, suggestion };
}
