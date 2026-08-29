import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Système prescripteur (apport d'affaires) :
 * - inscription publique avec acceptation de la convention,
 * - validation admin + création de l'espace prescripteur,
 * - dépôt et suivi des recommandations.
 */

import { STATUTS_RECO } from "./referentiels";

async function estStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "mandataire");
}

/** Inscription publique d'un apporteur d'affaires (aucune authentification). */
export const inscrirePrescripteur = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        nom: z.string().trim().min(2).max(100),
        prenom: z.string().trim().max(100).optional().nullable(),
        email: z.string().trim().email().max(255),
        telephone: z.string().trim().max(30).optional().nullable(),
        zone_activite: z.string().trim().max(200).optional().nullable(),
        type: z.enum(["agent_immo", "autre"]),
        convention: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    const { data: existant } = await supabaseAdmin
      .from("prescripteurs")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existant) {
      return { ok: false as const, error: "Une inscription existe déjà pour cette adresse e-mail." };
    }

    const { data: cree, error } = await supabaseAdmin
      .from("prescripteurs")
      .insert({
        nom: data.nom,
        prenom: data.prenom || null,
        email,
        telephone: data.telephone || null,
        zone_activite: data.zone_activite || null,
        type: data.type,
        statut: "en_attente",
        convention_acceptee_le: new Date().toISOString(),
      } as never)
      .select("id, nom, prenom")
      .single();

    if (error || !cree) {
      return { ok: false as const, error: error?.message ?? "Inscription impossible." };
    }

    const { creerTacheAdmin } = await import("@/lib/agent-taches.server");
    await creerTacheAdmin(supabaseAdmin, {
      titre: `Nouveau prescripteur inscrit — ${(cree as { prenom: string | null; nom: string }).prenom ?? ""} ${(cree as { nom: string }).nom}`.trim() + ", à valider",
      description: `Convention d'apport d'affaires acceptée en ligne.\nE-mail : ${email}\nTéléphone : ${data.telephone || "—"}\nZone : ${data.zone_activite || "—"}\nType : ${data.type}`,
      priorite: "haute",
    });

    return { ok: true as const };
  });

/** Validation admin : passage en « actif » + création de l'espace prescripteur. */
export const validerPrescripteur = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ prescripteur_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!(await estStaff(context.supabase, context.userId))) {
      return { ok: false as const, error: "Action réservée aux administrateurs et mandataires." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin
      .from("prescripteurs")
      .select("id, nom, prenom, email, user_id")
      .eq("id", data.prescripteur_id)
      .maybeSingle();
    if (!p) return { ok: false as const, error: "Prescripteur introuvable." };

    const presc = p as { id: string; nom: string; prenom: string | null; email: string; user_id: string | null };
    const email = presc.email.toLowerCase();
    const nomComplet = `${presc.prenom ?? ""} ${presc.nom}`.trim();

    let userId = presc.user_id;
    let emailSent = false;
    let emailError: string | null = null;

    if (!userId) {
      const { data: profil } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
      const { genererMotDePasseProvisoire } = await import("@/lib/dossier-automation.server");
      const password = genererMotDePasseProvisoire();

      if (profil) {
        userId = (profil as { id: string }).id;
        await supabaseAdmin.auth.admin.updateUserById(userId, { password });
      } else {
        const { data: cree, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: nomComplet },
        });
        if (error || !cree.user) {
          return { ok: false as const, error: error?.message ?? "Création du compte impossible." };
        }
        userId = cree.user.id;
      }

      await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", userId);
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "prescripteur" } as never, { onConflict: "user_id,role" });

      const { appUrl } = await import("@/lib/app-url");
      try {
        const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
        const res = await sendTemplateEmail("compte-client-cree", email, {
          templateData: {
            clientName: nomComplet,
            email,
            motDePasseProvisoire: password,
            link: appUrl("/auth"),
          },
          idempotencyKey: `compte-prescripteur-${userId}`,
        });
        emailSent = res.sent;
        if (!res.sent) emailError = "Adresse en liste de suppression : e-mail non envoyé.";
      } catch (e) {
        emailError = e instanceof Error ? e.message : "Erreur d'envoi inconnue";
      }
    }

    const { error: majErr } = await supabaseAdmin
      .from("prescripteurs")
      .update({ statut: "actif", user_id: userId } as never)
      .eq("id", presc.id);
    if (majErr) return { ok: false as const, error: majErr.message };

    return { ok: true as const, email_sent: emailSent, email_error: emailError };
  });

/** Changement de statut d'un prescripteur (actif / inactif). */
export const changerStatutPrescripteur = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prescripteur_id: z.string().uuid(),
        statut: z.enum(["en_attente", "actif", "inactif"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await estStaff(context.supabase, context.userId))) {
      return { ok: false as const, error: "Action réservée aux administrateurs et mandataires." };
    }
    const { error } = await context.supabase
      .from("prescripteurs")
      .update({ statut: data.statut } as never)
      .eq("id", data.prescripteur_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Dépôt d'une recommandation par le prescripteur connecté. */
export const creerRecommandation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        nom_contact: z.string().trim().min(2).max(150),
        description: z.string().trim().max(4000).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: presc } = await context.supabase
      .from("prescripteurs")
      .select("id, nom, prenom, statut")
      .eq("user_id", context.userId)
      .maybeSingle();
    const p = presc as { id: string; nom: string; prenom: string | null; statut: string } | null;
    if (!p) return { ok: false as const, error: "Aucune fiche prescripteur rattachée à ce compte." };
    if (p.statut !== "actif") return { ok: false as const, error: "Votre compte prescripteur n'est pas actif." };

    const { error } = await context.supabase.from("recommandations_prescripteur").insert({
      prescripteur_id: p.id,
      nom_contact: data.nom_contact,
      description: data.description || null,
    } as never);
    if (error) return { ok: false as const, error: error.message };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { creerTacheAdmin } = await import("@/lib/agent-taches.server");
    await creerTacheAdmin(supabaseAdmin, {
      titre: `Nouvelle recommandation — ${data.nom_contact}`,
      description: `Apportée par ${`${p.prenom ?? ""} ${p.nom}`.trim()}.\n${data.description || ""}`,
      priorite: "haute",
    });

    return { ok: true as const };
  });

/** Mise à jour du suivi d'une recommandation (staff uniquement). */
export const majRecommandation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        recommandation_id: z.string().uuid(),
        statut: z.enum(STATUTS_RECO).optional(),
        verse: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await estStaff(context.supabase, context.userId))) {
      return { ok: false as const, error: "Action réservée aux administrateurs et mandataires." };
    }
    const patch: Record<string, unknown> = {};
    if (data.statut) patch.statut = data.statut;
    if (data.verse !== undefined) {
      patch.verse = data.verse;
      patch.verse_le = data.verse ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) return { ok: true as const };

    const { error } = await context.supabase
      .from("recommandations_prescripteur")
      .update(patch as never)
      .eq("id", data.recommandation_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/** Dossiers récents proposés au rattachement d'une recommandation (staff). */
export const dossiersPourRecommandation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    if (!(await estStaff(context.supabase, context.userId))) {
      return { ok: false as const, error: "Action réservée au cabinet.", dossiers: [] };
    }
    const { data, error } = await context.supabase
      .from("dossiers")
      .select("id, reference, client_nom, client_id")
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) return { ok: false as const, error: error.message, dossiers: [] };
    return { ok: true as const, dossiers: (data ?? []) as { id: string; reference: string; client_nom: string; client_id: string | null }[] };
  });

/**
 * Rattache une recommandation à un dossier : le client du dossier et la
 * commission déjà enregistrée sur ce dossier sont reportés sur la
 * recommandation, ce qui relie l'apport d'affaires au flux financier.
 */
export const lierRecommandationDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        recommandation_id: z.string().uuid(),
        dossier_id: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!(await estStaff(context.supabase, context.userId))) {
      return { ok: false as const, error: "Action réservée aux administrateurs et mandataires." };
    }

    const patch: Record<string, unknown> = { dossier_id: data.dossier_id };
    if (data.dossier_id) {
      const { data: dossier } = await context.supabase
        .from("dossiers")
        .select("id, client_id")
        .eq("id", data.dossier_id)
        .maybeSingle();
      if (!dossier) return { ok: false as const, error: "Dossier introuvable." };
      const clientId = (dossier as { client_id: string | null }).client_id;
      if (clientId) patch.client_id = clientId;

      const { data: commissions } = await context.supabase
        .from("commissions")
        .select("id, created_at")
        .eq("dossier_id", data.dossier_id)
        .order("created_at", { ascending: false })
        .limit(1);
      const commission = ((commissions ?? []) as { id: string }[])[0];
      patch.commission_id = commission?.id ?? null;
    } else {
      patch.commission_id = null;
    }

    const { error } = await context.supabase
      .from("recommandations_prescripteur")
      .update(patch as never)
      .eq("id", data.recommandation_id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, commission_liee: Boolean(patch.commission_id) };
  });
