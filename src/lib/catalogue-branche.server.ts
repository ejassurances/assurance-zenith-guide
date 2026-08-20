import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Nombre de produits ACTIFS au catalogue du cabinet pour une branche donnée.
 * Le rattachement branche → produits passe par produit_familles.branches.
 */
export async function produitsActifsBranche(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  branche: string | null,
): Promise<number> {
  if (!branche) return 0;
  const { data: familles, error } = await supabase.from("produit_familles").select("id, branches");
  if (error) return 0;
  const ids = ((familles ?? []) as { id: string; branches: string[] | null }[])
    .filter((f) => (f.branches ?? []).includes(branche))
    .map((f) => f.id);
  if (ids.length === 0) return 0;

  const { data: produits, error: pErr } = await supabase
    .from("produits")
    .select("id")
    .eq("statut", "actif")
    .in("famille_id", ids);
  if (pErr) return 0;
  return (produits ?? []).length;
}

/**
 * Vrai si le catalogue actif ne contient qu'UN SEUL produit pour cette branche
 * (niche à un seul partenaire) : la règle « comparer au moins 3 devis » ne
 * s'applique alors pas et le devoir de conseil bascule sur la mention
 * « offre unique au catalogue ».
 */
export async function catalogueOffreUnique(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  branche: string | null,
): Promise<boolean> {
  return (await produitsActifsBranche(supabase, branche)) === 1;
}
