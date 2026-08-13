import type { SupabaseClient } from "@supabase/supabase-js";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODELES = ["google/gemini-3.6-flash", "google/gemini-2.5-flash"];

export type LigneClassement = {
  dossier_devis_id: string;
  rang: number;
  justification: string;
};

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
  if (!cle) throw new Error("Classement indisponible : clé IA absente du projet.");

  let derniere = "";
  for (const modele of MODELES) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({ model: modele, messages: [{ role: "user", content: prompt }] }),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const contenu = json.choices?.[0]?.message?.content ?? "";
      if (!contenu) throw new Error("Réponse IA vide");
      return { modele, brut: extraireJson(contenu) };
    }
    derniere = `${res.status} ${await res.text()}`;
    if (res.status === 429) throw new Error("Classement IA momentanément saturé.");
    if (res.status !== 400 && res.status !== 404) break;
  }
  throw new Error(`Classement IA impossible : ${derniere}`);
}

function consigne(ctx: { branche: string | null; recueil: unknown; devis: unknown[] }) {
  return [
    "Tu es analyste technique dans un cabinet de courtage en assurances français (ACPR / DDA).",
    "On te transmet les devis comparés d'un dossier et le recueil des besoins du client.",
    "Ta mission : CLASSER ces devis du plus adapté au moins adapté au regard des besoins exprimés",
    "(niveaux de garanties souhaités, postes prioritaires, budget indiqué), avec pour chacun une",
    "justification courte (2 phrases maximum), concrète, qui explique le rang et l'écart avec le besoin.",
    "",
    `Branche d'assurance : ${ctx.branche ?? "non précisée"}`,
    "Recueil des besoins (JSON) :",
    JSON.stringify(ctx.recueil ?? {}).slice(0, 6000),
    "Devis saisis (JSON) :",
    JSON.stringify(ctx.devis).slice(0, 6000),
    "",
    "Chaque devis porte un champ 'compagnie_tier_favori' : 1, 2 ou 3 si la compagnie est une compagnie",
    "favorite du cabinet (1 = préférence la plus forte), null sinon.",
    "",
    "Règles :",
    "- Classe TOUS les devis fournis, une seule fois chacun, rangs 1..N sans doublon.",
    "- Reprends exactement les identifiants 'id' fournis dans le champ dossier_devis_id.",
    "- Si une compagnie favorite (tier 1, 2 ou 3) figure parmi les devis, elle doit être positionnée en priorité dans le classement, même si son tarif n'est pas le plus bas, tant que ses garanties répondent aux besoins exprimés. N'affiche pas comme mieux classé un devis moins cher qu'une offre favorite retenue en rang 1, sauf si l'offre favorite ne couvre pas les besoins prioritaires exprimés — dans ce cas, explique-le clairement dans la justification. Si plusieurs compagnies favorites figurent parmi les devis, elles sont classées normalement entre elles selon l'adéquation aux besoins, sans réordonnancement forcé selon leur tier interne.",
    "- N'invente aucune garantie ni aucun tarif absent des devis fournis.",
    "- Si une information manque, dis-le explicitement dans la justification.",
    "- Tu classes et tu justifies : tu ne décides pas de l'offre retenue.",
    "",
    'Réponds STRICTEMENT en JSON : {"classement":[{"dossier_devis_id":"...","rang":1,"justification":"..."}]}',
  ].join("\n");
}


/**
 * Classement IA des devis comparés d'un dossier. Le résultat est enregistré en
 * statut 'propose' : le staff reste seul décideur de l'offre retenue.
 */
export async function classerDevisDossier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  dossierId: string,
  userId: string,
) {
  const { data: dossier, error: dErr } = await supabase
    .from("dossiers")
    .select("id, type_assurance, recueil_besoins")
    .eq("id", dossierId)
    .maybeSingle();
  if (dErr || !dossier) throw new Error("Dossier introuvable ou accès refusé");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dos = dossier as any;

  const { data: devisRows, error: devErr } = await supabase
    .from("dossier_devis")
    .select(
      "id, cotisation_mensuelle, garanties_resume, compagnies:compagnie_id(nom, tier_favori), produits:produit_id(nom), produit_formules:formule_id(nom)",
    )
    .eq("dossier_id", dossierId)
    .order("created_at", { ascending: true });
  if (devErr) throw new Error(devErr.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const devis = (devisRows ?? []) as any[];
  if (devis.length < 2) throw new Error("Saisissez au moins 2 devis pour lancer le classement IA.");

  const payload = devis.map((d) => ({
    id: d.id as string,
    compagnie: d.compagnies?.nom ?? null,
    compagnie_tier_favori: d.compagnies?.tier_favori ?? null,
    produit: d.produits?.nom ?? null,
    formule: d.produit_formules?.nom ?? null,
    cotisation_mensuelle: d.cotisation_mensuelle,
    garanties_resume: d.garanties_resume,
  }));


  const { modele, brut } = await appelerIa(
    consigne({ branche: dos.type_assurance ?? null, recueil: dos.recueil_besoins ?? null, devis: payload }),
  );

  const obj = (brut ?? {}) as Record<string, unknown>;
  const brutes = Array.isArray(obj["classement"]) ? (obj["classement"] as Record<string, unknown>[]) : [];
  const ids = new Set(payload.map((p) => p.id));
  const vues = new Set<string>();
  const classement: LigneClassement[] = [];
  for (const l of brutes) {
    const id = String(l["dossier_devis_id"] ?? "");
    if (!ids.has(id) || vues.has(id)) continue;
    vues.add(id);
    classement.push({
      dossier_devis_id: id,
      rang: classement.length + 1,
      justification: String(l["justification"] ?? "").slice(0, 1500) || "Justification non fournie.",
    });
  }
  // Les devis oubliés par l'IA sont ajoutés en fin de classement, sans jugement inventé.
  for (const p of payload) {
    if (vues.has(p.id)) continue;
    classement.push({
      dossier_devis_id: p.id,
      rang: classement.length + 1,
      justification: "Non classé par l'analyse : informations insuffisantes dans le devis saisi.",
    });
  }

  // Un nouveau classement remplace l'ancien 'propose' non traité (pas d'accumulation).
  await supabase
    .from("dossier_devis_classements")
    .delete()
    .eq("dossier_id", dossierId)
    .eq("statut", "propose");

  const { data: inserted, error: iErr } = await supabase
    .from("dossier_devis_classements")
    .insert({
      dossier_id: dossierId,
      modele_ia: modele,
      classement,
      statut: "propose",
      created_by: userId,
      genere_le: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (iErr || !inserted) throw new Error(iErr?.message ?? "Enregistrement du classement impossible");

  return { classement_id: inserted.id as string, classement };
}

/**
 * Le staff retient une offre : la compagnie / le produit du devis choisi sont
 * reportés sur le dossier, le classement est marqué traité et le devoir de
 * conseil est généré en BROUILLON (aucun envoi automatique au client).
 */
export async function retenirDevisDossier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  classementId: string,
  devisId: string,
  userId: string,
) {
  const { data: cls, error: cErr } = await supabase
    .from("dossier_devis_classements")
    .select("id, dossier_id, statut")
    .eq("id", classementId)
    .maybeSingle();
  if (cErr || !cls) throw new Error("Classement introuvable ou accès refusé");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = cls as any;

  const { data: devis, error: dErr } = await supabase
    .from("dossier_devis")
    .select("id, dossier_id, compagnie_id, produit_id")
    .eq("id", devisId)
    .maybeSingle();
  if (dErr || !devis) throw new Error("Devis introuvable");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = devis as any;
  if (d.dossier_id !== c.dossier_id) throw new Error("Ce devis n'appartient pas au dossier du classement");
  if (!d.compagnie_id || !d.produit_id) throw new Error("Ce devis n'a pas de compagnie / produit renseigné");

  const { error: upErr } = await supabase
    .from("dossiers")
    .update({ compagnie_id: d.compagnie_id, produit_id: d.produit_id })
    .eq("id", c.dossier_id);
  if (upErr) throw new Error(upErr.message);

  await supabase.from("dossier_devis_classements").update({ statut: "traite" }).eq("id", classementId);

  const { genererDevoirConseilAuto } = await import("./devoir-conseil.server");
  const res = await genererDevoirConseilAuto(supabase, c.dossier_id, userId, { sansEnvoi: true });

  return { dossier_id: c.dossier_id as string, devoir_id: res.id, envoye: false };
}

/**
 * Produit à tarification FIXE : le devis est construit depuis la formule et les
 * options du produit (aucun appel IA, une seule tarification connue), devient la
 * seule offre du dossier, et le devoir de conseil est généré en BROUILLON.
 */
export async function creerDevisTarifFixe(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  params: { dossierId: string; formuleId: string; optionIds: string[] },
  userId: string,
) {
  const { data: dossier, error: dErr } = await supabase
    .from("dossiers")
    .select("id, produit_id, compagnie_id")
    .eq("id", params.dossierId)
    .maybeSingle();
  if (dErr || !dossier) throw new Error("Dossier introuvable ou accès refusé");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dos = dossier as any;
  if (!dos.produit_id) throw new Error("Sélectionnez d'abord le produit du dossier.");

  const { data: produit, error: pErr } = await supabase
    .from("produits")
    .select("id, nom, compagnie_id, mode_tarification")
    .eq("id", dos.produit_id)
    .maybeSingle();
  if (pErr || !produit) throw new Error("Produit introuvable");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prod = produit as any;
  if (prod.mode_tarification !== "fixe") throw new Error("Ce produit n'est pas en tarification fixe.");

  const { data: formule, error: fErr } = await supabase
    .from("produit_formules")
    .select("id, nom, produit_id, tarif_fixe, actif")
    .eq("id", params.formuleId)
    .maybeSingle();
  if (fErr || !formule) throw new Error("Formule introuvable");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = formule as any;
  if (form.produit_id !== prod.id) throw new Error("Cette formule n'appartient pas au produit du dossier.");
  if (form.tarif_fixe == null) throw new Error(`Aucun tarif fixe renseigné sur la formule ${form.nom}.`);

  let options: { nom: string; tarif_fixe: number | null }[] = [];
  if (params.optionIds.length > 0) {
    const { data: opts, error: oErr } = await supabase
      .from("produit_options")
      .select("id, nom, tarif_fixe, produit_id, actif")
      .in("id", params.optionIds)
      .eq("produit_id", prod.id)
      .eq("actif", true);
    if (oErr) throw new Error(oErr.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options = ((opts ?? []) as any[]).map((o) => ({ nom: o.nom as string, tarif_fixe: o.tarif_fixe }));
  }

  const total =
    Number(form.tarif_fixe) + options.reduce((s, o) => s + (o.tarif_fixe == null ? 0 : Number(o.tarif_fixe)), 0);

  const resume = [
    `Formule ${form.nom} : ${Number(form.tarif_fixe).toLocaleString("fr-FR")} € / mois`,
    ...options.map(
      (o) =>
        `Option ${o.nom} : ${o.tarif_fixe == null ? "tarif non renseigné" : `${Number(o.tarif_fixe).toLocaleString("fr-FR")} € / mois`}`,
    ),
    `Total : ${total.toLocaleString("fr-FR")} € / mois`,
  ].join("\n");

  // Tarif fixe : une seule tarification connue, donc une seule offre au dossier.
  await supabase.from("dossier_devis").delete().eq("dossier_id", params.dossierId);

  const { data: devis, error: iErr } = await supabase
    .from("dossier_devis")
    .insert({
      dossier_id: params.dossierId,
      compagnie_id: prod.compagnie_id,
      produit_id: prod.id,
      formule_id: form.id,
      cotisation_mensuelle: total,
      garanties_resume: resume,
      source: "manuel",
      saisi_par: userId,
    })
    .select("id")
    .single();
  if (iErr || !devis) throw new Error(iErr?.message ?? "Enregistrement du devis impossible");

  if (dos.compagnie_id !== prod.compagnie_id) {
    const { error: upErr } = await supabase
      .from("dossiers")
      .update({ compagnie_id: prod.compagnie_id, produit_id: prod.id })
      .eq("id", params.dossierId);
    if (upErr) throw new Error(upErr.message);
  }

  const { genererDevoirConseilAuto } = await import("./devoir-conseil.server");
  const res = await genererDevoirConseilAuto(supabase, params.dossierId, userId, { sansEnvoi: true });

  return { devis_id: devis.id as string, total, devoir_id: res.id, envoye: false };
}
