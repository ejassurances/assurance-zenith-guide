import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LigneControleEmail {
  id: string;
  gmail_message_id: string;
  sujet: string | null;
  expediteur_nom: string | null;
  expediteur_email: string | null;
  recu_le: string | null;
  traite_le: string | null;
  decision: string | null;
  motif: string | null;
  confiance: number | null;
  label_gmail: string | null;
  statut_traitement: string;
  lien_gmail: string | null;
  lien_brouillon: string | null;
  lien_reponse: string | null;
  client_id: string | null;
  compagnie_id: string | null;
}

export interface DecisionHistorique {
  id: string;
  gmail_message_id: string;
  decision: string;
  origine: string;
  motif: string | null;
  confiance: number | null;
  created_at: string;
}

/** Données de l'écran de contrôle du traitement Gmail (lecture seule). */
export const chargerControleGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [emails, decisions] = await Promise.all([
      supabase
        .from("crm_emails")
        .select(
          "id, gmail_message_id, sujet, expediteur_nom, expediteur_email, recu_le, traite_le, decision, motif, confiance, label_gmail, statut_traitement, lien_gmail, lien_brouillon, lien_reponse, client_id, compagnie_id",
        )
        .order("recu_le", { ascending: false, nullsFirst: false })
        .limit(200),
      supabase
        .from("email_decisions")
        .select("id, gmail_message_id, decision, origine, motif, confiance, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    return {
      emails: (emails.data ?? []) as unknown as LigneControleEmail[],
      decisions: (decisions.data ?? []) as unknown as DecisionHistorique[],
    };
  });
