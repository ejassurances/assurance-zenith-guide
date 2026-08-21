import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const valeurSchema = z.object({
  couverture: z.enum(["oui", "non", "option", "inconnu"]),
  plafond: z.string().max(300).nullable().optional(),
  franchise: z.string().max(300).nullable().optional(),
  delai_carence: z.string().max(300).nullable().optional(),
  conditions: z.string().max(800).nullable().optional(),
  extrait: z.string().max(1200).nullable().optional(),
  confiance: z.number().min(0).max(1).nullable().optional(),
});

async function estStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  return roles.includes("admin") || roles.includes("mandataire");
}

async function assertStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  if (!(await estStaff(supabase, userId))) throw new Error("Accès réservé au cabinet");
}

/**
 * Interroge la bibliothèque des CG clients (jamais le Drive à la volée) avant de
 * demander un nouvel upload : même compagnie déclarée + même branche.
 */
export const rechercherCgBibliotheque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        compagnie_nom: z.string().min(2).max(160),
        branche: z.string().min(2).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { editionIncertaine, MESSAGE_EDITION_INCERTAINE } = await import("@/lib/bibliotheque-cg");
    const recherche = data.compagnie_nom.trim().toLowerCase();
    const { data: rows } = await supabaseAdmin
      .from("bibliotheque_cg_clients")
      .select("id, compagnie_nom, branche, edition_annee, valide, statut, created_at, nom_fichier")
      .eq("branche", data.branche)
      .ilike("compagnie_nom", `%${recherche}%`)
      .order("valide", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);

    const entrees = ((rows ?? []) as {
      id: string;
      compagnie_nom: string;
      branche: string;
      edition_annee: string | null;
      valide: boolean;
      statut: string;
      created_at: string;
      nom_fichier: string | null;
    }[]).map((e) => ({
      ...e,
      edition_incertaine: editionIncertaine(e),
      /** Une édition non confirmée n'autorise JAMAIS à se passer du vrai document. */
      upload_requis: editionIncertaine(e) || !e.valide,
      message: editionIncertaine(e) ? MESSAGE_EDITION_INCERTAINE : null,
    }));

    return { entrees };
  });

/**
 * Enregistre un nouveau CG client dans la bibliothèque puis lance l'extraction
 * IA. Le résultat reste un brouillon à valider par un humain.
 */
export const enregistrerCgBibliotheque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        compagnie_nom: z.string().min(2).max(160),
        branche: z.string().min(2).max(60),
        storage_path: z.string().min(3).max(500),
        nom_fichier: z.string().max(300).nullable().optional(),
        mime_type: z.string().max(120).nullable().optional(),
        edition_annee: z.string().max(20).nullable().optional(),
        dossier_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Le chemin doit appartenir au déposant (contrôle identique à la policy de stockage).
    if (!data.storage_path.startsWith(`${context.userId}/`)) {
      const staff = await estStaff(context.supabase, context.userId);
      if (!staff) throw new Error("Chemin de fichier non autorisé");
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("bibliotheque_cg_clients")
      .insert({
        compagnie_nom: data.compagnie_nom.trim(),
        branche: data.branche,
        edition_annee: data.edition_annee?.trim() || null,
        storage_path: data.storage_path,
        nom_fichier: data.nom_fichier ?? null,
        mime_type: data.mime_type ?? null,
        uploaded_from: data.dossier_id ?? null,
        statut: "depose",
        valide: false,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message ?? "Enregistrement du document impossible");

    const id = (inserted as { id: string }).id;
    let analyse: string | null = null;
    try {
      const { analyserCgBibliotheque } = await import("@/lib/bibliotheque-cg-extraction.server");
      await analyserCgBibliotheque(supabaseAdmin as never, id);
      analyse = "brouillon";
    } catch (e) {
      analyse = null;
      await supabaseAdmin
        .from("bibliotheque_cg_clients")
        .update({
          statut: "a_analyser",
          avertissements: `Extraction automatique en échec : ${e instanceof Error ? e.message : String(e)}`,
        })
        .eq("id", id);
    }

    return { id, analyse };
  });

/** Relance l'extraction IA sur une entrée (cabinet). */
export const analyserCgBibliothequeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { analyserCgBibliotheque } = await import("@/lib/bibliotheque-cg-extraction.server");
    return analyserCgBibliotheque(context.supabase, data.id);
  });

/** Enregistre la grille relue sans la valider. */
export const enregistrerBrouillonCgBibliotheque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        valeurs: z.record(z.string(), valeurSchema),
        edition_annee: z.string().max(20).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("bibliotheque_cg_clients")
      .update({
        valeurs: data.valeurs,
        edition_annee: data.edition_annee?.trim() || null,
        statut: "brouillon",
        valide: false,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Validation humaine : l'année d'édition est OBLIGATOIRE pour valider une entrée
 * — sans édition confirmée, aucune réutilisation n'est autorisée.
 */
export const validerCgBibliotheque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        valeurs: z.record(z.string(), valeurSchema),
        edition_annee: z.string().min(4).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("bibliotheque_cg_clients")
      .update({
        valeurs: data.valeurs,
        edition_annee: data.edition_annee.trim(),
        statut: "valide",
        valide: true,
        valide_par: context.userId,
        valide_le: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lien signé de consultation du document (cabinet). */
export const urlCgBibliotheque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { BUCKET_CG_CLIENTS } = await import("@/lib/bibliotheque-cg");
    const { data: row } = await context.supabase
      .from("bibliotheque_cg_clients")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const chemin = (row as { storage_path: string } | null)?.storage_path;
    if (!chemin) throw new Error("Document introuvable");
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET_CG_CLIENTS)
      .createSignedUrl(chemin, 300);
    if (error || !signed) throw new Error(error?.message ?? "Lien indisponible");
    return { url: signed.signedUrl };
  });

/** Liste de la bibliothèque pour le cabinet. */
export const listerCgBibliotheque = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ branche: z.string().max(60).nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    let req = context.supabase
      .from("bibliotheque_cg_clients")
      .select(
        "id, compagnie_nom, branche, edition_annee, nom_fichier, famille_code, grille_version, valeurs, valeurs_proposees, avertissements, modele_ia, statut, valide, valide_le, uploaded_from, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.branche) req = req.eq("branche", data.branche);
    const { data: rows, error } = await req;
    if (error) throw new Error(error.message);
    return { entrees: rows ?? [] };
  });
