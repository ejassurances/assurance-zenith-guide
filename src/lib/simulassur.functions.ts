import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions Simulassur (assurance emprunteur).
 * Les secrets, les liens d'activation bruts et les documents Base64 restent
 * côté serveur : le navigateur ne reçoit que des états et des métadonnées.
 */

async function assertStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!roles.some((r) => r === "admin" || r === "mandataire")) {
    throw new Error("Accès réservé au cabinet");
  }
  return roles;
}

/** État de configuration des secrets Simulassur (aucune valeur renvoyée). */
export const simulassurStatut = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { simulassurConfigStatus } = await import("./simulassur/config");
    const { TYPES_DOCUMENTS, LIBELLE_DOCUMENT } = await import("./simulassur/referentiels");
    return {
      ...simulassurConfigStatus(),
      documents: TYPES_DOCUMENTS.map((t) => ({ type: t, libelle: LIBELLE_DOCUMENT[t] })),
    };
  });

/** Suivi Simulassur d'un dossier (tarification, transfert, statuts, espaces). */
export const simulassurSuiviDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: suivi } = await context.supabase
      .from("simulassur_dossiers")
      .select(
        "id, quote_id, simulation_id, produit_code, devis_id, transfert_statut, transfert_le, suivi_statuts, suivi_le, suivi_partiel, contrat_ref, espaces_clients, derniere_erreur, updated_at",
      )
      .eq("dossier_id", data.dossier_id)
      .maybeSingle();
    if (!suivi) return { present: false as const };
    const espaces = Array.isArray(suivi.espaces_clients)
      ? (suivi.espaces_clients as Record<string, unknown>[]).map((e) => ({
          email: String(e["email"] ?? ""),
          produit_code: String(e["produit_code"] ?? ""),
          // Le lien d'activation n'est pas exposé : seule sa présence l'est.
          lien_disponible: !!e["activation_url"],
          transmis_le: String(e["transmis_le"] ?? ""),
        }))
      : [];
    return { present: true as const, suivi: { ...suivi, espaces_clients: espaces } };
  });

/** Tarifie un dossier emprunteur auprès de Simulassur et crée les devis. */
export const simulassurTariferDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dossier_id: z.string().uuid(),
        date_effet: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        code_banque: z.string().max(20).optional(),
        produits: z.array(z.string().max(20)).max(20).optional(),
        forcer: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { tariferDossierSimulassur } = await import("./simulassur/tarification.server");
    const res = await tariferDossierSimulassur(
      context.supabase,
      {
        dossierId: data.dossier_id,
        dateEffet: data.date_effet,
        codeBanque: data.code_banque ?? null,
        produits: data.produits,
        forcer: data.forcer,
      },
      context.userId,
    );
    return { ok: true as const, ...res };
  });

/** Transfère le devis retenu à Simulassur pour lancer la souscription. */
export const simulassurTransfererDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dossier_id: z.string().uuid(),
        devis_id: z.string().uuid(),
        produit_code: z.string().min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { transfererDossier } = await import("./simulassur/souscription.server");
    const res = await transfererDossier(
      context.supabase,
      { dossierId: data.dossier_id, devisId: data.devis_id, produitCode: data.produit_code },
      context.userId,
    );
    return { ok: true as const, ...res };
  });

/** Actualise les statuts de souscription et de résiliation par assuré. */
export const simulassurSuivreDevis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ dossier_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { suivreDevis } = await import("./simulassur/souscription.server");
    const res = await suivreDevis(context.supabase, data.dossier_id, context.userId);
    return { ok: true as const, ...res };
  });

/** Crée les espaces clients Simulassur (deux au maximum). */
export const simulassurCreerEspaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dossier_id: z.string().uuid(),
        comptes: z
          .array(
            z.object({
              email: z.string().email(),
              produit_code: z.string().min(1).max(20),
            }),
          )
          .min(1)
          .max(2),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { creerEspacesClients } = await import("./simulassur/souscription.server");
    const res = await creerEspacesClients(
      context.supabase,
      {
        dossierId: data.dossier_id,
        comptes: data.comptes.map((c) => ({ email: c.email, produitCode: c.produit_code })),
      },
      context.userId,
    );
    return {
      ok: true as const,
      espaces: res.espaces.map((e) => ({
        email: e.email,
        produit_code: e.produit_code,
        lien_disponible: !!e.activation_url,
      })),
    };
  });

/** Génère et archive les documents précontractuels du devis. */
export const simulassurGenererDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dossier_id: z.string().uuid(),
        produit_code: z.string().min(1).max(20),
        types: z.array(z.enum(["fmc", "fsi", "cg", "devis"])).min(1).max(4),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { genererDocuments } = await import("./simulassur/souscription.server");
    const res = await genererDocuments(
      context.supabase,
      { dossierId: data.dossier_id, produitCode: data.produit_code, types: data.types },
      context.userId,
    );
    return {
      ok: true as const,
      documents: res.documents.map((d) => ({ type: d.type, libelle: d.libelle })),
      echecs: res.echecs,
    };
  });
