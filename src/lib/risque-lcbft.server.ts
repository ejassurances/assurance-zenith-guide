import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { creerTacheAdmin } from "@/lib/agent-taches.server";

/**
 * Score de risque LCB-FT (distinct du score de complétude KYC).
 * Le calcul est fait en base par `calculer_risque_lcbft` (rejouable).
 * Une vigilance renforcée (par PPE ou par score) exige la validation
 * documentée d'un membre de la direction avant toute souscription.
 */

type Admin = SupabaseClient<Database>;

export type RisqueLcbft = {
  id: string;
  client_id: string;
  score_risque: number;
  niveau_vigilance: "simplifiee" | "standard" | "renforcee";
  facteurs: { code: string; libelle: string; points: number }[];
  ppe_detecte: boolean;
  justification: string | null;
  decide_par: string | null;
  decide_le: string | null;
  statut: "a_evaluer" | "evalue" | "a_reviser";
  prochaine_revue_le: string | null;
};

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

/** Recalcule le risque et crée la tâche de validation hiérarchique si nécessaire. */
export async function evaluerRisqueLcbft(admin: Admin, clientId: string): Promise<RisqueLcbft | null> {
  const { data, error } = await (admin.rpc as unknown as Rpc)("calculer_risque_lcbft", {
    _client_id: clientId,
  });
  if (error) {
    console.error("[risque-lcbft] calcul impossible", clientId, error);
    return null;
  }
  const ligne = (Array.isArray(data) ? data[0] : data) as RisqueLcbft | null;
  if (!ligne) return null;

  const identite = (ligne.facteurs ?? []).find((f) => f.code === "kyc_identite");

  // Identité non vérifiée : alerte de conformité dédiée, indépendante de la
  // validation hiérarchique (aucun score ne peut être considéré comme fiable).
  if (identite) {
    const { data: dejaAlerte } = await admin
      .from("taches")
      .select("id")
      .eq("client_id", clientId)
      .in("statut", ["a_faire", "en_cours"])
      .ilike("titre", "Pièces KYC manquantes%")
      .limit(1)
      .maybeSingle();
    if (!dejaAlerte) {
      const { data: client } = await admin
        .from("clients")
        .select("nom, prenom")
        .eq("id", clientId)
        .maybeSingle();
      const c = client as { nom: string; prenom: string | null } | null;
      const nom = [c?.prenom, c?.nom].filter(Boolean).join(" ") || "Client";
      await creerTacheAdmin(admin, {
        titre: `Pièces KYC manquantes — ${nom}`,
        description: [
          identite.libelle,
          "",
          "L'évaluation du risque LCB-FT ne peut pas être considérée comme concluante : le client est placé en vigilance renforcée et son évaluation est marquée « à réviser ».",
          "Collectez la pièce d'identité en cours de validité (et les justificatifs manquants) avant toute souscription.",
          `Fiche client : /espace/clients/${clientId}`,
        ].join("\n"),
        client_id: clientId,
        priorite: "urgente",
      });
    }
  }

  if (ligne.niveau_vigilance === "renforcee" && !ligne.decide_le && !identite) {
    const { data: client } = await admin
      .from("clients")
      .select("nom, prenom")
      .eq("id", clientId)
      .maybeSingle();
    const c = client as { nom: string; prenom: string | null } | null;
    const nom = [c?.prenom, c?.nom].filter(Boolean).join(" ") || "Client";

    const { data: dejaOuverte } = await admin
      .from("taches")
      .select("id")
      .eq("client_id", clientId)
      .in("statut", ["a_faire", "en_cours"])
      .ilike("titre", "Vigilance renforcée à valider%")
      .limit(1)
      .maybeSingle();

    if (!dejaOuverte) {
      const facteurs = (ligne.facteurs ?? [])
        .map((f) => `• ${f.libelle} (+${f.points})`)
        .join("\n");
      await creerTacheAdmin(admin, {
        titre: `Vigilance renforcée à valider — ${nom}`,
        description: [
          `Score de risque LCB-FT : ${ligne.score_risque}/100`,
          ligne.ppe_detecte
            ? "Personne politiquement exposée : vigilance renforcée de plein droit (pas de seuil de déclenchement)."
            : "Vigilance renforcée déclenchée par le score de risque.",
          "",
          "Facteurs retenus :",
          facteurs || "—",
          "",
          "Un membre de la direction doit autoriser et documenter la décision de nouer/poursuivre la relation avant toute souscription.",
          `Fiche client : /espace/clients/${clientId}`,
        ].join("\n"),
        client_id: clientId,
        priorite: "urgente",
      });
    }
  }

  return ligne;
}
