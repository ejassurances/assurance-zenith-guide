import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Seuil légal indicatif — 15h/an DDA (article L.511-2 du Code des assurances). Affiché, pas certifié par l'app. */
export const HEURES_FORMATION_DDA_MIN_AN = 15;

const declarerFormationSchema = z.object({
  annee: z.number().int().min(2020).max(2100),
  heures: z.number().positive().max(200),
  intitule: z.string().trim().min(1).max(300),
  organisme: z.string().trim().max(200).optional(),
  date_session: z.string().optional(),
});

export const declarerFormation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => declarerFormationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("mandataires_formations").insert({
      user_id: userId,
      annee: data.annee,
      heures: data.heures,
      intitule: data.intitule,
      organisme: data.organisme ?? null,
      date_session: data.date_session ?? null,
      declare_par: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Récapitulatif des heures déclarées par année, pour soi-même. */
export const mesFormations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("mandataires_formations")
      .select("id, annee, heures, intitule, organisme, date_session, created_at")
      .eq("user_id", userId)
      .order("annee", { ascending: false })
      .order("date_session", { ascending: false });
    if (error) throw new Error(error.message);
    const parAnnee = new Map<number, number>();
    for (const f of data ?? []) {
      parAnnee.set(f.annee, (parAnnee.get(f.annee) ?? 0) + Number(f.heures));
    }
    return {
      lignes: data ?? [],
      totauxParAnnee: Array.from(parAnnee.entries())
        .map(([annee, heures]) => ({ annee, heures }))
        .sort((a, b) => b.annee - a.annee),
    };
  });

/** Mes pièces KYC (mon propre espace). */
export const mesPiecesKyc = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("mandataires_kyc_documents")
      .select("id, type, nom, statut, date_emission, date_expiration, notes, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const deposerKycSchema = z.object({
  type: z.string().min(1).max(100),
  nom: z.string().min(1).max(300),
  storage_path: z.string().min(1),
  date_emission: z.string().optional(),
  date_expiration: z.string().optional(),
});

export const deposerPieceKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deposerKycSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("mandataires_kyc_documents").insert({
      user_id: userId,
      type: data.type,
      nom: data.nom,
      storage_path: data.storage_path,
      date_emission: data.date_emission ?? null,
      date_expiration: data.date_expiration ?? null,
      uploaded_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
