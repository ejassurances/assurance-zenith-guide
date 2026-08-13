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
