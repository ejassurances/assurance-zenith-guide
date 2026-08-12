import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Espace client : auto-inscription restreinte aux e-mails déjà connus du CRM,
 * et suivi du changement de mot de passe obligatoire.
 */

export const autoInscriptionClient = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(10).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) L'e-mail doit correspondre à une fiche client existante.
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, nom, prenom, user_id")
      .ilike("email", email)
      .maybeSingle();

    if (!client) {
      return {
        ok: false as const,
        error:
          "Cette adresse e-mail n'est pas reconnue. La création de compte est réservée aux clients du cabinet — contactez-nous pour être enregistré.",
      };
    }

    // 2) Un compte existe déjà ?
    const { data: profil } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (profil || client.user_id) {
      return {
        ok: false as const,
        error: "Un espace existe déjà pour cette adresse. Utilisez la connexion ou « mot de passe oublié ».",
      };
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: `${client.prenom ?? ""} ${client.nom}`.trim() },
    });
    if (error || !created.user) {
      return { ok: false as const, error: error?.message ?? "Création du compte impossible" };
    }

    await supabaseAdmin.from("clients").update({ user_id: created.user.id }).eq("id", client.id);

    return { ok: true as const };
  });

/** Lève l'obligation de changement de mot de passe après un changement réussi. */
export const validerChangementMotDePasse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
