/**
 * Signature des documents de souscription Néoliane depuis l'espace client.
 *
 * Contrôles d'accès alignés sur la lettre de mission et le devoir de conseil :
 * la lecture et la signature ne sont possibles que si le parcours est rattaché
 * à un client dont `clients.user_id` est l'utilisateur appelant.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const parcoursSchema = z.object({ parcours_id: z.string().uuid() });

const parapheSchema = z
  .string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/, "PNG attendu")
  .max(500_000);

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Vérifie que le parcours appartient bien au client connecté. */
async function assertProprietaire(supabase: any, userId: string, parcoursId: string) {
  const { data, error } = await supabase
    .from("neoliane_parcours")
    .select("id, client_id, signature_client_statut, clients:client_id(user_id)")
    .eq("id", parcoursId)
    .maybeSingle();
  if (error || !data) throw new Error("Document de souscription introuvable");
  if ((data as any).clients?.user_id !== userId) throw new Error("Non autorisé");
  return data as { id: string; signature_client_statut: string };
}

/** Documents préremplis à signer (aperçu PDF + emplacements attendus). */
export const souscriptionDocumentsAsigner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parcoursSchema.parse(input))
  .handler(async ({ data, context }) => {
    const p = await assertProprietaire(context.supabase, context.userId, data.parcours_id);
    if (p.signature_client_statut === "signee") {
      return { ok: true as const, deja_signe: true, documents: [] };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { documentsPourClient } = await import("./neoliane/signature-client.server");
    const documents = await documentsPourClient(supabaseAdmin, data.parcours_id);
    return { ok: true as const, deja_signe: false, documents };
  });

/** Signature effective par le client, puis dépôt et validation chez Néoliane. */
export const souscriptionSignerParClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        parcours_id: z.string().uuid(),
        signataire: z.string().min(2).max(120),
        paraphes: z
          .record(z.string().min(1), parapheSchema)
          .refine((v) => Object.keys(v).length > 0, "Au moins un paraphe est requis"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const p = await assertProprietaire(context.supabase, context.userId, data.parcours_id);
    if (p.signature_client_statut === "signee") throw new Error("Documents déjà signés");
    if (p.signature_client_statut === "non_demandee") {
      throw new Error("Aucune signature n'est attendue sur ce dossier");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signerSouscription } = await import("./neoliane/signature-client.server");
    const res = await signerSouscription(supabaseAdmin, data.parcours_id, data.paraphes, {
      signataire: data.signataire,
      ip: getRequestIP({ xForwardedFor: true }) ?? null,
      ua: getRequestHeader("user-agent") ?? null,
      origine: "client",
    });
    return { ok: res.ok, jeton: res.jeton, horodatage: res.horodatage };
  });
