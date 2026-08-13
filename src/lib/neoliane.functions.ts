import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions Néoliane. Tous les appels partent du serveur : aucun secret
 * ni token n'atteint le navigateur.
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

const payloadSchema = z.record(z.string(), z.unknown());

function messageErreur(e: unknown) {
  const err = e as { name?: string; message?: string; status?: number; body?: unknown };
  return {
    ok: false as const,
    status: err?.status ?? 0,
    erreur: err?.message ?? "Erreur inconnue",
    type: err?.name ?? "Error",
    detail: err?.body ?? null,
  };
}

/** État de configuration des secrets (aucune valeur de secret renvoyée). */
export const neolianeStatut = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { neolianeConfigStatus } = await import("./neoliane/config");
    const { DEFAULT_TARIF_PATH, tarificationPath } = await import("./neoliane/tarification.server");
    const { DEFAULT_SOUSCRIPTION_PATH, souscriptionPath, DEFAULT_SIGNATURE_PATH, signaturePath } =
      await import("./neoliane/souscription.server");
    return {
      ...neolianeConfigStatus(),
      endpoints: {
        tarification: tarificationPath(),
        tarification_defaut: DEFAULT_TARIF_PATH,
        souscription: souscriptionPath(),
        souscription_defaut: DEFAULT_SOUSCRIPTION_PATH,
        signature: signaturePath(),
        signature_defaut: DEFAULT_SIGNATURE_PATH,
      },
    };
  });

/** Test de connexion : tente OAuth2 puis Basic Auth, sans rien exposer. */
export const neolianeTestConnexion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mode: z.enum(["oauth2", "basic"]).default("oauth2") }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { neolianeConfigStatus } = await import("./neoliane/config");
    const statut = neolianeConfigStatus();
    if (!statut.configured) {
      return { ok: false as const, status: 0, erreur: statut.message, type: "NeolianeNotConfiguredError", detail: null };
    }
    try {
      if (data.mode === "basic") {
        const { basicAuthHeader } = await import("./neoliane/client.server");
        basicAuthHeader();
        return {
          ok: true as const,
          mode: "basic" as const,
          message: "En-tête Basic Auth constructible. Un endpoint métier est nécessaire pour valider côté Néoliane.",
        };
      }
      const { getNeolianeAccessToken } = await import("./neoliane/client.server");
      const t = await getNeolianeAccessToken(true);
      return {
        ok: true as const,
        mode: "oauth2" as const,
        message: "Access token OAuth2 obtenu avec succès.",
        expire_le: new Date(t.expiresAt).toISOString(),
        token_apercu: `${t.accessToken.slice(0, 4)}…(${t.accessToken.length} car.)`,
      };
    } catch (e) {
      return messageErreur(e);
    }
  });

/** Module Tarification : appelle l'API et renvoie la réponse brute. */
export const neolianeTarifer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        path: z.string().max(300).optional(),
        payload: payloadSchema,
        withUserApiKey: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    try {
      const { appelerTarification } = await import("./neoliane/tarification.server");
      return await appelerTarification(data);
    } catch (e) {
      return messageErreur(e);
    }
  });

/** Module Souscription : lance la souscription d'un devis retenu. */
export const neolianeSouscrire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        path: z.string().max(300).optional(),
        payload: payloadSchema,
        withUserApiKey: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    try {
      const { lancerSouscription } = await import("./neoliane/souscription.server");
      return await lancerSouscription(data);
    } catch (e) {
      return messageErreur(e);
    }
  });

/** Module Souscription : déclenche la signature électronique. */
export const neolianeSigner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        path: z.string().max(300).optional(),
        payload: payloadSchema,
        withUserApiKey: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    try {
      const { lancerSignature } = await import("./neoliane/souscription.server");
      return await lancerSignature(data);
    } catch (e) {
      return messageErreur(e);
    }
  });
