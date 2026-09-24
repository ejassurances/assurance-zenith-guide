import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function estAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  return (data ?? []).length > 0;
}

const lancerSchema = z.object({
  mandataire_id: z.string().uuid(),
  periode_debut: z.string(),
  periode_fin: z.string(),
});

/**
 * Le courtier lance un précompte : regroupe les commissions non encore
 * précomptées de ce mandataire sur la période, les marque precomptee=true
 * (jamais comptées deux fois — contrainte unique sur precompte_lignes en
 * plus), et envoie directement le précompte (statut 'envoye').
 */
export const lancerPrecompte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lancerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await estAdmin(supabase, userId))) {
      return { ok: false as const, error: "Action réservée aux administrateurs." };
    }

    const { data: commissions, error: errCom } = await supabase
      .from("commissions")
      .select("id, montant, contrat_id, date_versement")
      .eq("beneficiaire_id", data.mandataire_id)
      .eq("precomptee", false)
      .eq("statut", "versee")
      .gte("date_versement", data.periode_debut)
      .lte("date_versement", data.periode_fin);
    if (errCom) return { ok: false as const, error: errCom.message };
    if (!commissions || commissions.length === 0) {
      return { ok: false as const, error: "Aucune commission éligible sur cette période." };
    }

    const montantTotal = commissions.reduce((s, c) => s + Number(c.montant), 0);

    const { data: precompte, error: errP } = await supabase
      .from("precomptes_mandataires")
      .insert({
        mandataire_id: data.mandataire_id,
        periode_debut: data.periode_debut,
        periode_fin: data.periode_fin,
        statut: "envoye",
        montant_total: montantTotal,
        created_by: userId,
        envoye_le: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (errP || !precompte) return { ok: false as const, error: errP?.message ?? "Création impossible." };

    const lignes = commissions.map((c) => ({
      precompte_id: precompte.id,
      commission_id: c.id,
      contrat_id: c.contrat_id,
      montant: c.montant,
    }));
    const { error: errL } = await supabase.from("precompte_lignes").insert(lignes);
    if (errL) return { ok: false as const, error: errL.message };

    await supabase
      .from("commissions")
      .update({ precomptee: true })
      .in(
        "id",
        commissions.map((c) => c.id),
      );

    await supabase.from("taches").insert({
      client_id: null,
      dossier_id: null,
      type: "precompte_a_valider",
      statut: "a_faire",
      priorite: "normale",
      titre: `Précompte envoyé au mandataire — ${commissions.length} commission(s), ${montantTotal.toFixed(2)} €`,
    });

    return { ok: true as const, precompte_id: precompte.id, montant_total: montantTotal, nb_lignes: commissions.length };
  });

/** Liste des précomptes du mandataire connecté (ou tous, pour un admin). */
export const mesPrecomptes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const admin = await estAdmin(supabase, userId);
    let q = supabase
      .from("precomptes_mandataires")
      .select(
        "id, mandataire_id, periode_debut, periode_fin, statut, montant_total, envoye_le, valide_le, facture_recue_le, facture_validee_le, virement_effectue_le, facture_numero",
      )
      .order("created_at", { ascending: false });
    if (!admin) q = q.eq("mandataire_id", userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const idSchema = z.object({ precompte_id: z.string().uuid() });

/** Le mandataire valide le précompte reçu (accord sur les montants). */
export const validerPrecompte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("precomptes_mandataires")
      .update({ statut: "valide_mandataire", valide_le: new Date().toISOString() })
      .eq("id", data.precompte_id)
      .eq("mandataire_id", userId)
      .eq("statut", "envoye");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const factureSchema = z.object({
  precompte_id: z.string().uuid(),
  storage_path: z.string().min(1),
  numero: z.string().max(100).optional(),
});

/** Le mandataire dépose sa propre facture, une fois le précompte validé. */
export const deposerFacturePrecompte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => factureSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("precomptes_mandataires")
      .update({
        statut: "facture_recue",
        facture_storage_path: data.storage_path,
        facture_numero: data.numero ?? null,
        facture_recue_le: new Date().toISOString(),
      })
      .eq("id", data.precompte_id)
      .eq("mandataire_id", userId)
      .eq("statut", "valide_mandataire");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Le cabinet valide la facture reçue. */
export const validerFacturePrecompte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await estAdmin(supabase, userId))) {
      return { ok: false as const, error: "Action réservée aux administrateurs." };
    }
    const { error } = await supabase
      .from("precomptes_mandataires")
      .update({ statut: "facture_validee", facture_validee_le: new Date().toISOString(), facture_validee_par: userId })
      .eq("id", data.precompte_id)
      .eq("statut", "facture_recue");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Le cabinet confirme que le virement a été effectué — dernière étape. */
export const marquerVirementEffectue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await estAdmin(supabase, userId))) {
      return { ok: false as const, error: "Action réservée aux administrateurs." };
    }
    const { error } = await supabase
      .from("precomptes_mandataires")
      .update({
        statut: "virement_effectue",
        virement_effectue_le: new Date().toISOString(),
        virement_effectue_par: userId,
      })
      .eq("id", data.precompte_id)
      .eq("statut", "facture_validee");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
