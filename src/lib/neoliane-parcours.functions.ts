import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions du parcours Néoliane complet (tarification → panier →
 * offre → signature → gestion). Aucun secret ni appel API n'atteint le
 * navigateur : tout est exécuté ici, côté serveur, après contrôle du rôle.
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
}

const membreSchema = z.object({
  socialSecurityScheme: z.string().min(1),
  birthYear: z.number().int().min(1900).max(2100),
  familyMember: z.string().min(1),
});

const ligneSchema = z.object({
  pricingId: z.union([z.string(), z.number()]),
  members: z.array(z.string()).optional(),
});

const idSchema = z.object({ parcours_id: z.string().uuid() });

/** Ouvre un parcours : crée le profil Néoliane et le persiste. */
export const neolianeDemarrerParcours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        dossier_id: z.string().uuid().nullish(),
        client_id: z.string().uuid().nullish(),
        product_type: z.string().min(1),
        zip_code: z.string().regex(/^\d{5}$/),
        date_effet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        profile_health: z.array(membreSchema).optional(),
        profile_members: z.array(membreSchema).optional(),
        pet: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { demarrerParcours } = await import("./neoliane/parcours.server");
    const parcours = await demarrerParcours(
      context.supabase,
      {
        dossierId: data.dossier_id ?? null,
        clientId: data.client_id ?? null,
        productType: data.product_type,
        zipCode: data.zip_code,
        dateEffect: data.date_effet,
        ...(data.profile_health ? { profileHealth: data.profile_health } : {}),
        ...(data.profile_members ? { profileMembers: data.profile_members } : {}),
        ...(data.pet ? { pet: data.pet } : {}),
      },
      context.userId,
    );
    return {
      ok: true as const,
      parcours_id: parcours.id,
      profile_id: parcours.profile_id,
      etape: parcours.etape,
      parcours_json: JSON.stringify(parcours),
    };
  });

/** Génère les tarifs (types de produits, membres, bloc animal). */
export const neolianeGenererTarifs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        parcours_id: z.string().uuid(),
        types: z.array(z.string()).optional(),
        profile_members: z.array(membreSchema).optional(),
        pet: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { genererTarifs } = await import("./neoliane/parcours.server");
    const res = await genererTarifs(context.supabase, data.parcours_id, {
      ...(data.types ? { types: data.types } : {}),
      ...(data.profile_members ? { profileMembers: data.profile_members } : {}),
      ...(data.pet ? { pet: data.pet } : {}),
    });
    return { ok: true as const, resultat: JSON.stringify(res ?? null) };
  });

/** Compose (POST) ou remplace intégralement (PUT) le panier. */
export const neolianeComposerPanier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        parcours_id: z.string().uuid(),
        produits: z.array(ligneSchema).min(1),
        remplacer: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { composerPanier } = await import("./neoliane/parcours.server");
    const panier = await composerPanier(
      context.supabase,
      data.parcours_id,
      data.produits,
      data.remplacer ?? false,
    );
    return { ok: true as const, panier: JSON.stringify(panier ?? null) };
  });

/** Lecture du panier réel + produits couplables (isSellable). */
export const neolianeLirePanier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { consulterPanier, produitsCouplables } = await import("./neoliane/parcours.server");
    const panier = await consulterPanier(context.supabase, data.parcours_id);
    const couplables = await produitsCouplables(context.supabase, data.parcours_id).catch(
      () => null,
    );
    return {
      ok: true as const,
      panier: JSON.stringify(panier ?? null),
      couplables: JSON.stringify(couplables ?? null),
    };
  });

/** Référentiels dynamiques : champs d'offre, résiliations, prélèvements. */
export const neolianeDonneesDynamiques = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { donneesDynamiques } = await import("./neoliane/parcours.server");
    const res = await donneesDynamiques(context.supabase, data.parcours_id);
    return { ok: true as const, donnees: JSON.stringify(res) };
  });

/** Création / mise à jour de l'offre (warnings NIR non bloquants). */
export const neolianeEnregistrerOffre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        parcours_id: z.string().uuid(),
        corps: z.record(z.string(), z.unknown()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { enregistrerOffre } = await import("./neoliane/parcours.server");
    const res = await enregistrerOffre(context.supabase, data.parcours_id, data.corps);
    return {
      ok: res.ok,
      offer_id: res.offerId,
      contract_ids: res.contractIds,
      avertissements: JSON.stringify(res.avertissements),
      erreurs: JSON.stringify(res.erreurs),
    };
  });

/** Finalisation (verrouillage de l'offre). */
export const neolianeFinaliserOffre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ parcours_id: z.string().uuid(), sign_type: z.string().default("handSign") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { finaliser } = await import("./neoliane/parcours.server");
    const res = await finaliser(context.supabase, data.parcours_id, data.sign_type);
    return { ok: true as const, resultat: JSON.stringify(res ?? null) };
  });

/** Documents préremplis à signer (BA, SEPA, mandat de résiliation). */
export const neolianeDocumentsSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { documentsASigner } = await import("./neoliane/parcours.server");
    const res = await documentsASigner(context.supabase, data.parcours_id);
    return { ok: true as const, documents: JSON.stringify(res ?? null) };
  });

/** Dépôt des documents signés (Base64), contrat par contrat. */
export const neolianeDeposerSignatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        parcours_id: z.string().uuid(),
        documents: z
          .array(
            z.object({
              contractId: z.string().min(1),
              ba: z.string().optional(),
              sepa: z.string().optional(),
              resiliation: z
                .array(z.object({ familyMember: z.string(), file: z.string() }))
                .optional(),
            }),
          )
          .min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { deposerSignatures } = await import("./neoliane/parcours.server");
    const res = await deposerSignatures(context.supabase, data.parcours_id, data.documents);
    return { ok: true as const, resultat: JSON.stringify(res ?? null) };
  });

/** Validation finale : statut par contrat. */
export const neolianeValiderSouscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { validerSouscription } = await import("./neoliane/parcours.server");
    const res = await validerSouscription(context.supabase, data.parcours_id);
    return {
      ok: res.ok,
      contrats_valides: JSON.stringify(res.contratsValides ?? null),
      erreurs: JSON.stringify(res.erreurs ?? null),
    };
  });

/** Devis PDF Néoliane (éditique) pour un pricingId retenu. */
export const neolianeGenererDevis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        parcours_id: z.string().uuid(),
        pricing_id: z.union([z.string(), z.number()]),
        identite: z.object({
          civility: z.enum(["mr", "mrs"]),
          lastname: z.string().min(1),
          firstname: z.string().min(1),
          address: z.string().min(1),
          zipCode: z.string().optional(),
          city: z.string().optional(),
          email: z.string().email(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { chargerParcours } = await import("./neoliane/parcours.server");
    const { genererDevis } = await import("./neoliane/api.server");
    const p = await chargerParcours(context.supabase, data.parcours_id);
    if (!p.profile_id) throw new Error("Profil Néoliane absent.");
    const res = await genererDevis(p.profile_id, String(data.pricing_id), data.identite);
    return { ok: true as const, document: JSON.stringify(res ?? null) };
  });

/** Supports de vente d'un produit (éditique). */
export const neolianeSupportsDeVente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ product_id: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { lireSupportsDeVente } = await import("./neoliane/api.server");
    return {
      ok: true as const,
      documents: JSON.stringify(await lireSupportsDeVente(data.product_id)),
    };
  });

/** Formules Chien / Chat. */
export const neolianeFormulesAnimal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { lireFormulesAnimal } = await import("./neoliane/api.server");
    return { ok: true as const, formules: JSON.stringify(await lireFormulesAnimal()) };
  });

/** Validation de la userApiKey (isValid + sousCode). */
export const neolianeValiderCle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { validerUserApiKey } = await import("./neoliane/api.server");
    try {
      const r = await validerUserApiKey();
      return { ok: true as const, is_valid: r.isValid, sous_code: r.sousCode, status: r.status };
    } catch (e) {
      return { ok: false as const, erreur: (e as Error).message };
    }
  });

/* ------------------------------------------------------------------ */
/* EZ Gestion — abonnements et rafraîchissements                      */
/* ------------------------------------------------------------------ */

export const neolianeAbonnements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.enum(["lister", "abonner", "supprimer"]),
        event_name: z.enum(["contract", "contractDemarche"]).optional(),
        callback: z.string().url().optional(),
        id: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const api = await import("./neoliane/api.server");
    try {
      if (data.action === "abonner") {
        if (!data.event_name || !data.callback) throw new Error("Événement et callback requis.");
        return {
          ok: true as const,
          resultat: JSON.stringify(await api.abonnerEvenement(data.event_name, data.callback)),
        };
      }
      if (data.action === "supprimer") {
        if (!data.id) throw new Error("Identifiant d'abonnement requis.");
        return {
          ok: true as const,
          resultat: JSON.stringify(await api.supprimerAbonnement(data.id)),
        };
      }
      return { ok: true as const, resultat: JSON.stringify(await api.listerAbonnements()) };
    } catch (e) {
      return { ok: false as const, erreur: (e as Error).message };
    }
  });

/** Rafraîchit un contrat ou une démarche depuis Néoliane. */
export const neolianeRafraichir = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ type: z.enum(["contract", "demarche"]), id: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const api = await import("./neoliane/api.server");
    const res =
      data.type === "contract"
        ? await api.rafraichirContrat(data.id)
        : await api.rafraichirDemarche(data.id);
    return { ok: true as const, etat: JSON.stringify(res ?? null) };
  });

/**
 * Radiation de contrats Néoliane (POST /contract/cancel) — uniquement pour les
 * contrats pas encore transmis à la compagnie.
 */
export const neolianeRadierContrats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contract_ids: z.array(z.string().min(1)).min(1).max(20),
        commentaire: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const api = await import("./neoliane/api.server");
    try {
      const res = await api.radierContrats(data.contract_ids, data.commentaire);
      return { ok: true as const, resultat: JSON.stringify(res) };
    } catch (e) {
      return { ok: false as const, erreur: (e as Error).message };
    }
  });

/** Derniers événements EZ Gestion reçus (journal interne). */
export const neolianeEvenements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("neoliane_evenements")
      .select("id, event_name, ressource_id, traite, erreur, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { ok: true as const, evenements: data ?? [] };
  });
