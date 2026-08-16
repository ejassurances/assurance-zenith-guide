import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Logique LCB-FT partagée (OpenSanctions) — réutilisée par le server fn
 * authentifié `rechercherSanctionsPPE` et par l'automatisation des leads.
 *
 * Endpoint : POST /match/default (screening réglementaire par entité).
 * Authentification obligatoire : header `Authorization: ApiKey <clé>`.
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

type OSMatchResponse = {
  responses?: Record<string, { results?: OSMatch[] }>;
};

export interface LcbInput {
  client_id: string;
  nom: string;
  prenom?: string | null;
  date_naissance?: string | null;
  pays?: string | null;
  verifie_par?: string | null;
}

export type LcbEnrichi = {
  id: string;
  caption: string;
  score: number;
  datasets: string[];
  pays: string[];
  date_naissance: string[];
  fonction: string[];
  is_sanction: boolean;
  is_ppe: boolean;
  topics: string[];
};

const MATCH_URL = "https://api.opensanctions.org/match/default?algorithm=logic-v1";

async function appelerOpenSanctions(input: LcbInput): Promise<{
  matches: OSMatch[];
  apiOk: boolean;
  apiError: string | null;
}> {
  const apiKey = process.env["OPENSANCTIONS_API_KEY"];
  if (!apiKey) {
    return {
      matches: [],
      apiOk: false,
      apiError:
        "Clé OpenSanctions absente : ajoutez OPENSANCTIONS_API_KEY dans les secrets du projet.",
    };
  }

  const name = [input.prenom, input.nom].filter(Boolean).join(" ").trim();
  const properties: Record<string, string[]> = { name: [name] };
  if (input.nom) properties.lastName = [input.nom];
  if (input.prenom) properties.firstName = [input.prenom];
  if (input.date_naissance) properties.birthDate = [input.date_naissance];
  if (input.pays) properties.country = [input.pays];

  try {
    const res = await fetch(MATCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `ApiKey ${apiKey}`,
      },
      body: JSON.stringify({
        queries: {
          client: {
            schema: "Person",
            properties,
          },
        },
      }),
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      const label =
        res.status === 401 || res.status === 403
          ? "clé OpenSanctions refusée (401/403)"
          : `HTTP ${res.status}`;
      return { matches: [], apiOk: false, apiError: `${label} — ${detail}` };
    }

    const json = (await res.json()) as OSMatchResponse;
    return { matches: json.responses?.client?.results ?? [], apiOk: true, apiError: null };
  } catch (e) {
    return { matches: [], apiOk: false, apiError: e instanceof Error ? e.message : "network" };
  }
}

export async function executerRechercheLCB(
  supabase: SupabaseClient<Database>,
  input: LcbInput,
) {
  const { matches, apiOk, apiError } = await appelerOpenSanctions(input);

  const enrichis: LcbEnrichi[] = matches
    .filter((m) => m.score >= 0.6)
    .sort((a, b) => b.score - a.score)
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

  // Une API en échec ne doit jamais produire un « clair » trompeur.
  const statut: "clair" | "a_verifier" =
    !apiOk || (enrichis.length > 0 && best_score >= 0.75) ? "a_verifier" : "clair";

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
        endpoint: "match/default",
        api_ok: apiOk,
        api_error: apiError,
      },
      resultats: enrichis,
      nb_correspondances: enrichis.length,
      score_correspondance: best_score,
      statut,
      notes: apiOk ? null : `Vérification non concluante : ${apiError}`,
      verifie_par: input.verifie_par ?? null,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);

  // Score de risque LCB-FT recalculé à chaque nouveau contrôle (best-effort).
  try {
    const { evaluerRisqueLcbft } = await import("@/lib/risque-lcbft.server");
    await evaluerRisqueLcbft(supabase, input.client_id);
  } catch (e) {
    console.error("[risque-lcbft] évaluation post-contrôle échouée", input.client_id, e);
  }

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
