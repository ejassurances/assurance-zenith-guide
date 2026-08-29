/**
 * D4 — File de souscription : collecte serveur (lecture seule) des dossiers
 * non finalisés avec évaluation de leurs prérequis de transmission.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { prerequisSouscription } from "@/lib/souscription-prerequis.server";
import { STATUTS_FILE, classifierDossier, type LigneFileSouscription } from "@/lib/souscription-file";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

const LIMITE_MAX = 200;

/** Charge et classe la file de souscription. Aucune écriture. */
export async function fileSouscription(
  admin: Admin,
  limite = 100,
): Promise<{ lignes: LigneFileSouscription[]; total: number }> {
  const plafond = Math.min(Math.max(1, Math.floor(limite) || 100), LIMITE_MAX);

  const { data, error } = await admin
    .from("dossiers")
    .select(
      `id, reference, client_nom, client_id, type_assurance, statut,
       souscription_envoyee_le, souscription_relances_nb, souscription_retour_le,
       compagnies:compagnie_id(nom), produits:produit_id(nom)`,
    )
    .in("statut", STATUTS_FILE)
    .order("created_at", { ascending: false })
    .limit(plafond);
  if (error) throw new Error(error.message);

  const lignes = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).map(async (d: any): Promise<LigneFileSouscription> => {
      const dejaTransmis = d.statut === "souscription_envoyee";
      const prerequis = dejaTransmis ? null : await prerequisSouscription(admin, d.id);
      const { etat, etape_reprise } = classifierDossier({
        statut: d.statut,
        envoye_le: d.souscription_envoyee_le ?? null,
        retour_le: d.souscription_retour_le,
        prerequis,
      });
      return {
        dossier_id: d.id,
        reference: d.reference,
        client_nom: d.client_nom,
        client_id: d.client_id,
        branche: d.type_assurance,
        produit_nom: d.produits?.nom ?? null,
        compagnie_nom: d.compagnies?.nom ?? null,
        statut: d.statut,
        etat,
        jalons: prerequis?.jalons ?? [],
        bloquants: prerequis?.bloquants ?? [],
        etape_reprise,
        envoye_le: d.souscription_envoyee_le ?? null,
        relances_nb: d.souscription_relances_nb ?? null,
      };
    }),
  );

  return { lignes, total: lignes.length };
}
