/**
 * D5 — Portefeuille de contrats : collecte serveur (lecture seule).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STATUTS_PORTEFEUILLE,
  agregerPortefeuille,
  classifierContrat,
  type AgregatsPortefeuille,
  type LigneContrat,
} from "@/lib/portefeuille-contrats";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

const LIMITE_MAX = 300;

/** Charge et classe le portefeuille de contrats. Aucune écriture. */
export async function portefeuilleContrats(
  admin: Admin,
  limite = 300,
): Promise<{ lignes: LigneContrat[]; agregats: AgregatsPortefeuille }> {
  const plafond = Math.min(Math.max(1, Math.floor(limite) || 300), LIMITE_MAX);

  const { data, error } = await admin
    .from("contrats")
    .select(
      `id, numero, client_id, produit, assureur, statut, date_effet, date_echeance,
       prochain_suivi_le, prime_annuelle, is_emprunteur,
       clients:client_id(nom, prenom), compagnies:compagnie_id(nom)`,
    )
    .in("statut", STATUTS_PORTEFEUILLE as unknown as string[])
    .order("date_echeance", { ascending: true, nullsFirst: false })
    .limit(plafond);
  if (error) throw new Error(error.message);

  const maintenant = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lignes: LigneContrat[] = ((data as any[]) ?? []).map((c) => {
    const { etat, jours_avant_echeance } = classifierContrat(
      { date_echeance: c.date_echeance ?? null, prochain_suivi_le: c.prochain_suivi_le ?? null },
      maintenant,
    );
    const nom = [c.clients?.prenom, c.clients?.nom].filter(Boolean).join(" ").trim();
    return {
      contrat_id: c.id,
      numero: c.numero ?? null,
      client_id: c.client_id ?? null,
      client_nom: nom || null,
      produit: c.produit ?? "—",
      assureur: c.assureur ?? "—",
      compagnie_nom: c.compagnies?.nom ?? null,
      statut: c.statut,
      date_effet: c.date_effet ?? null,
      date_echeance: c.date_echeance ?? null,
      prochain_suivi_le: c.prochain_suivi_le ?? null,
      prime_annuelle: c.prime_annuelle ?? null,
      is_emprunteur: !!c.is_emprunteur,
      etat,
      jours_avant_echeance,
    };
  });

  return { lignes, agregats: agregerPortefeuille(lignes) };
}
