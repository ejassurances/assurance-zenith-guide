import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function estAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
  return (data ?? []).length > 0;
}

const creerSchema = z.object({
  nom: z.string().trim().min(1).max(200),
  prenom: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(255),
  taux_commission: z.number().min(0).max(1).optional(),
});

/**
 * Création d'un compte mandataire par le cabinet (réservé admin — pas
 * d'auto-inscription, contrairement aux prescripteurs). Crée le compte
 * Supabase s'il n'existe pas encore, attribue le rôle mandataire, crée son
 * profil (mandataires_profils — équipe désactivée par défaut, jamais
 * activée automatiquement), et envoie le mot de passe provisoire par mail.
 *
 * Ne construit PAS le contrat interne mandataire (texte à valider avant
 * codage, comme la lettre de mission) — c'est une étape séparée, à faire
 * une fois le compte créé.
 */
export const creerMandataire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => creerSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!(await estAdmin(context.supabase, context.userId))) {
      return { ok: false as const, error: "Action réservée aux administrateurs." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const nomComplet = [data.prenom, data.nom].filter(Boolean).join(" ");

    const { data: profilExistant } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    const { genererMotDePasseProvisoire } = await import("@/lib/dossier-automation.server");
    const password = genererMotDePasseProvisoire();

    let userId: string;
    if (profilExistant) {
      userId = (profilExistant as { id: string }).id;
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
      .upsert({ user_id: userId, role: "mandataire" } as never, { onConflict: "user_id,role" });

    // equipe_activee jamais mis à true ici : toujours une activation
    // explicite et séparée du cabinet (avec avenant), jamais à la création.
    await supabaseAdmin.from("mandataires_profils").upsert(
      {
        user_id: userId,
        taux_commission: data.taux_commission ?? null,
      } as never,
      { onConflict: "user_id" },
    );

    let emailSent = false;
    let emailError: string | null = null;
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const { appUrl } = await import("@/lib/app-url");
      const res = await sendTemplateEmail("compte-client-cree", email, {
        templateData: {
          clientName: nomComplet,
          email,
          motDePasseProvisoire: password,
          link: appUrl("/auth"),
        },
        idempotencyKey: `compte-mandataire-${userId}`,
      });
      emailSent = res.sent;
      if (!res.sent) emailError = "Adresse en liste de suppression : e-mail non envoyé.";
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Erreur d'envoi inconnue";
    }

    return { ok: true as const, user_id: userId, email_sent: emailSent, email_error: emailError };
  });
