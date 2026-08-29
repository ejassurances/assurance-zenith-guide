/**
 * AVANCEMENT AUTONOME DES PROJETS CLIENTS.
 *
 * À chaque événement entrant (email traité, pièce classée, devis saisi), les
 * dossiers du client sont réévalués et avancés automatiquement — uniquement sur
 * les transitions NON réglementaires.
 *
 * Règles :
 *  - `nouveau` → `en_cours` dès qu'un élément concret existe (pièce reçue,
 *    document rattaché, devis saisi) ;
 *  - jamais de passage vers `signe` ni `perdu` : ce sont des actes de
 *    distribution / d'arbitrage réservés à l'humain (ACPR / DDA) ;
 *  - idempotent : aucune écriture si l'étape est déjà correcte ;
 *  - isolé : une erreur sur un dossier n'interrompt pas les autres.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export interface ResultatAvancement {
  examines: number;
  avances: { dossier_id: string; reference: string; de: string; vers: string; motif: string }[];
  erreurs: number;
}

/** Un élément concret existe-t-il sur le dossier ? */
async function dossierDemarre(admin: Admin, dossierId: string): Promise<string | null> {
  const [pieces, docs, devis] = await Promise.all([
    admin
      .from("dossier_pieces_requises")
      .select("code")
      .eq("dossier_id", dossierId)
      .in("statut", ["recu", "valide"])
      .limit(1),
    admin.from("documents").select("id").eq("dossier_id", dossierId).limit(1),
    admin.from("dossier_devis").select("id").eq("dossier_id", dossierId).is("archive_le", null).limit(1),
  ]);
  if ((devis.data ?? []).length) return "un devis a été enregistré";
  if ((pieces.data ?? []).length) return "une pièce justificative a été reçue";
  if ((docs.data ?? []).length) return "un document a été rattaché au dossier";
  return null;
}

/**
 * Réévalue et avance les dossiers d'un client (ou un dossier précis).
 * Ne lève jamais.
 */
export async function avancerProjetsClient(
  admin: Admin,
  params: { client_id?: string | null; dossier_id?: string | null; par?: string | null },
): Promise<ResultatAvancement> {
  const resultat: ResultatAvancement = { examines: 0, avances: [], erreurs: 0 };
  try {
    let requete = admin.from("dossiers").select("id, reference, statut, client_id").in("statut", ["nouveau"]);
    if (params.dossier_id) requete = requete.eq("id", params.dossier_id);
    else if (params.client_id) requete = requete.eq("client_id", params.client_id);
    else return resultat;

    const { data: dossiers, error } = await requete.limit(50);
    if (error) {
      console.error("[projet-avancement] lecture des dossiers impossible", error.message);
      resultat.erreurs++;
      return resultat;
    }

    for (const d of dossiers ?? []) {
      resultat.examines++;
      try {
        const motif = await dossierDemarre(admin, d.id);
        if (!motif) continue;

        const { error: majErreur } = await admin
          .from("dossiers")
          .update({ statut: "en_cours" })
          .eq("id", d.id)
          .eq("statut", "nouveau"); // garde optimiste : pas d'écrasement d'une décision humaine
        if (majErreur) {
          resultat.erreurs++;
          console.error("[projet-avancement] mise à jour impossible", d.id, majErreur.message);
          continue;
        }

        await admin.from("dossier_etapes_historique").insert({
          dossier_id: d.id,
          ancienne_etape: "nouveau",
          nouvelle_etape: "en_cours",
          par: params.par ?? null,
          commentaire: `Avancement automatique : ${motif}`,
        });

        if (d.client_id) {
          await admin.from("activites").insert({
            client_id: d.client_id,
            type: "systeme",
            titre: `Projet ${d.reference} passé en cours`,
            contenu: `Avancement automatique du projet : ${motif}. Les étapes réglementaires (conseil, souscription) restent validées par un gestionnaire.`,
          });
        }

        resultat.avances.push({
          dossier_id: d.id,
          reference: d.reference,
          de: "nouveau",
          vers: "en_cours",
          motif,
        });
      } catch (e) {
        resultat.erreurs++;
        console.error("[projet-avancement] échec sur le dossier", d.id, e);
      }
    }
  } catch (e) {
    resultat.erreurs++;
    console.error("[projet-avancement] échec global", e);
  }
  return resultat;
}
