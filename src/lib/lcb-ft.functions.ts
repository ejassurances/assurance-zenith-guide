import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Recherche LCB-FT via OpenSanctions (sanctions + PPE mondiaux).
 * La logique d'appel et d'enregistrement vit dans `lcb-ft.server.ts`,
 * partagée avec l'automatisation des leads.
 */

const inputSchema = z.object({
  client_id: z.string().uuid(),
  nom: z.string().min(1).max(200),
  prenom: z.string().max(200).optional(),
  date_naissance: z.string().optional(), // YYYY-MM-DD
  pays: z.string().max(60).optional(),
});

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

    const { executerRechercheLCB } = await import("./lcb-ft.server");
    return executerRechercheLCB(supabase, {
      client_id: data.client_id,
      nom: data.nom,
      prenom: data.prenom ?? null,
      date_naissance: data.date_naissance ?? null,
      pays: data.pays ?? null,
      verifie_par: userId,
    });
  });

type StaffClient = {
  from: (table: "user_roles") => {
    select: (cols: string) => { eq: (col: string, val: string) => PromiseLike<{ data: { role: string }[] | null }> };
  };
};

async function exigerStaff(supabase: unknown, userId: string) {
  const { data } = await (supabase as StaffClient).from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("mandataire")) throw new Error("Accès réservé au cabinet.");
}

/**
 * Rattrapage : lance le contrôle LCB-FT sur toutes les fiches clients qui n'ont
 * encore aucune vérification (fiches créées avant l'automatisation ou dont le
 * contrôle automatique a échoué silencieusement).
 */
export const lancerLcbClientsManquants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigerStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { executerRechercheLCB } = await import("./lcb-ft.server");

    const { data: clients } = await supabaseAdmin
      .from("clients")
      .select("id, nom, prenom, date_naissance")
      .order("created_at", { ascending: false })
      .limit(500);
    const { data: deja } = await supabaseAdmin.from("client_lcb_verifications").select("client_id");
    const avec = new Set((deja ?? []).map((v) => v.client_id));

    const aTraiter = (clients ?? []).filter((c) => !avec.has(c.id)).slice(0, 50);
    let traites = 0;
    let aVerifier = 0;
    const erreurs: string[] = [];

    for (const c of aTraiter) {
      try {
        const res = await executerRechercheLCB(supabaseAdmin, {
          client_id: c.id,
          nom: c.nom,
          prenom: c.prenom ?? null,
          date_naissance: c.date_naissance ?? null,
          verifie_par: context.userId,
        });
        traites += 1;
        if (res.statut === "a_verifier") aVerifier += 1;
      } catch (e) {
        erreurs.push(`${c.nom} : ${e instanceof Error ? e.message : "erreur"}`);
      }
    }

    return { total_sans_controle: (clients ?? []).length - avec.size, traites, a_verifier: aVerifier, erreurs };
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
