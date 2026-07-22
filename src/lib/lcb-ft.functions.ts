import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Recherche LCB-FT via OpenSanctions (base publique, sanctions + PPE mondiaux).
 * Endpoint gratuit /search/default limité en volume — suffisant pour un cabinet.
 */

const inputSchema = z.object({
  client_id: z.string().uuid(),
  nom: z.string().min(1).max(200),
  prenom: z.string().max(200).optional(),
  date_naissance: z.string().optional(), // YYYY-MM-DD
});

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

export const rechercherSanctionsPPE = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Vérif accès (RLS)
    const { data: client, error: cErr } = await supabase
      .from("clients")
      .select("id, nom, prenom, date_naissance")
      .eq("id", data.client_id)
      .maybeSingle();
    if (cErr || !client) throw new Error("Client introuvable ou accès refusé");

    const query = [data.prenom, data.nom].filter(Boolean).join(" ").trim();
    const url = new URL("https://api.opensanctions.org/search/default");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "10");
    url.searchParams.set("schema", "Person");

    let matches: OSMatch[] = [];
    let apiOk = true;
    let apiError: string | null = null;
    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
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

    // Filtrage : on garde les correspondances au-dessus d'un seuil raisonnable
    const filtered = matches.filter((m) => m.score >= 0.6);

    // Détection topics
    const enrichis = filtered.map((m) => {
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

    // Statut déduit
    let statut: "clair" | "a_verifier" = "clair";
    if (enrichis.length > 0 && best_score >= 0.75) statut = "a_verifier";

    // Enregistrement historique
    const { data: inserted, error: insErr } = await supabase
      .from("client_lcb_verifications")
      .insert({
        client_id: data.client_id,
        type: "combined",
        fournisseur: "opensanctions",
        requete: {
          nom: data.nom,
          prenom: data.prenom ?? null,
          date_naissance: data.date_naissance ?? null,
          api_ok: apiOk,
          api_error: apiError,
        },
        resultats: enrichis,
        nb_correspondances: enrichis.length,
        score_correspondance: best_score,
        statut,
        verifie_par: userId,
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
  });

/** Marque une vérification comme faux positif ou confirmée */
export const marquerVerificationLCB = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        verification_id: z.string().uuid(),
        statut: z.enum(["clair", "faux_positif", "confirme", "a_verifier"]),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("client_lcb_verifications")
      .update({ statut: data.statut, notes: data.notes ?? null })
      .eq("id", data.verification_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
