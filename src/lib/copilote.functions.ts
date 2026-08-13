import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  dossier_id: z.string().uuid(),
  mode: z.enum(["synthese", "prochaine_action", "email_client", "email_compagnie"]),
  precision: z.string().max(1000).optional(),
});

/** Copilote IA du dossier : synthèse, prochaine action, brouillons d'emails. */
export const demanderCopilote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const { executerCopilote } = await import("./copilote.server");
    // Le client Supabase du contexte applique la RLS : un utilisateur sans
    // droit sur le dossier ne peut pas en obtenir de synthèse.
    return executerCopilote(context.supabase, data.dossier_id, data.mode, data.precision ?? null);
  });

const tacheSchema = z.object({
  dossier_id: z.string().uuid(),
  titre: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  echeance_jours: z.number().int().min(0).max(60).default(3),
  priorite: z.enum(["basse", "normale", "haute", "urgente"]).default("normale"),
});

/** Crée la tâche proposée par le copilote sur le client du dossier. */
export const creerTacheCopilote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tacheSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dossier, error } = await supabase
      .from("dossiers")
      .select("id, client_id, reference")
      .eq("id", data.dossier_id)
      .maybeSingle();
    if (error || !dossier) throw new Error("Dossier introuvable ou accès refusé");

    const echeance = new Date(Date.now() + data.echeance_jours * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    const { error: insErr } = await supabase.from("taches").insert({
      client_id: dossier.client_id,
      titre: data.titre,
      description: [data.description, `Dossier ${dossier.reference} — proposé par le copilote IA`]
        .filter(Boolean)
        .join("\n\n"),
      echeance,
      priorite: data.priorite,
      statut: "a_faire",
      assignee_id: userId,
      created_by: userId,
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });
