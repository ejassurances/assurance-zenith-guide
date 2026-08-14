import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Agent commercial — création de tâches humaines de reprise en main.
 * Toute automatisation qui ne peut pas aller au bout (classification
 * incertaine, recueil incomplet, erreur technique) doit déposer une tâche
 * plutôt que d'échouer silencieusement.
 */

type Admin = SupabaseClient<Database>;

/** Premier administrateur du cabinet (destinataire par défaut des tâches). */
export async function adminParDefaut(admin: Admin): Promise<string | null> {
  const { data } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

export async function creerTacheAdmin(
  admin: Admin,
  params: {
    titre: string;
    description?: string | null;
    client_id?: string | null;
    priorite?: Database["public"]["Enums"]["tache_priorite"];
    assignee_id?: string | null;
    created_by?: string | null;
  },
): Promise<void> {
  try {
    const assignee = params.assignee_id ?? (await adminParDefaut(admin));
    await admin.from("taches").insert({
      titre: params.titre.slice(0, 300),
      description: params.description?.slice(0, 4000) ?? null,
      client_id: params.client_id ?? null,
      priorite: params.priorite ?? "haute",
      statut: "a_faire",
      assignee_id: assignee,
      created_by: params.created_by ?? assignee,
      echeance: new Date().toISOString().slice(0, 10),
    });
  } catch (e) {
    console.error("[agent-commercial] création de tâche impossible", e);
  }
}
