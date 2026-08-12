import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Logique LCB-FT partagée (OpenSanctions) — réutilisée par le server fn
 * authentifié `rechercherSanctionsPPE` et par l'automatisation des leads.
 */

type OSMatch = {
  id: string;
  caption: string;
  score: number;
  schema: string;
  datasets: string[];
  properties?: {
    topics?: string[];
    country?: string[];
    birthDate?: string[];
    position?: string[];
  };
};

export interface LcbInput {
  client_id: string;
  nom: string;
  prenom?: string | null;
  date_naissance?: string | null;
  verifie_par?: string | null;
}

export async function executerRechercheLCB(
  supabase: SupabaseClient<Database>,
  input: LcbInput,
) {
  const query = [input.prenom, input.nom].filter(Boolean).join(" ").trim();
  const url = new URL("https://api.opensanctions.org/search/default");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("schema", "Person");

  let matches: OSMatch[] = [];
  let apiOk = true;
  let apiError: string | null = null;
  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) {
      apiOk = false;
      apiError = `HTTP ${res.status}`;
    } else {
      const json = (await res.json()) as { results?: OSMatch[] };
      matches = json.results ?? [];
    }
  } catch (e) {
    apiOk = false;
    apiError = e instanceof Error ? e.message : "network";
  }

  const enrichis = matches
    .filter((m) => m.score >= 0.6)
    .map((m) => {
      const topics = m.properties?.topics ?? [];
      return {
        id: m.id,
        caption: m.caption,
        score: m.score,
        datasets: m.datasets,
        pays: m.properties?.country ?? [],
        date_naissance: m.properties?.birthDate ?? [],
        fonction: m.properties?.position ?? [],
        is_sanction: topics.some((t) => t.startsWith("sanction")),
        is_ppe: topics.some((t) => t === "role.pep" || t.startsWith("role.pep") || t === "gov"),
        topics,
      };
    });

  const has_sanction = enrichis.some((m) => m.is_sanction);
  const has_ppe = enrichis.some((m) => m.is_ppe);
  const best_score = enrichis[0]?.score ?? 0;

  const statut: "clair" | "a_verifier" = enrichis.length > 0 && best_score >= 0.75 ? "a_verifier" : "clair";

  const { data: inserted, error: insErr } = await supabase
    .from("client_lcb_verifications")
    .insert({
      client_id: input.client_id,
      type: "combined",
      fournisseur: "opensanctions",
      requete: {
        nom: input.nom,
        prenom: input.prenom ?? null,
        date_naissance: input.date_naissance ?? null,
        api_ok: apiOk,
        api_error: apiError,
      },
      resultats: enrichis,
      nb_correspondances: enrichis.length,
      score_correspondance: best_score,
      statut,
      verifie_par: input.verifie_par ?? null,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);

  return {
    verification_id: inserted.id,
    matches: enrichis,
    has_sanction,
    has_ppe,
    best_score,
    statut,
    api_ok: apiOk,
    api_error: apiError,
  };
}
