import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normaliserRecueilEmprunteur,
  type PersonneSourceEmprunteur,
} from "./recueil-emprunteur-normalisation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export interface ResultatReconstitution {
  dossier: string;
  ajouts: string[];
  manquants: string[];
  modifie: boolean;
}

/**
 * Reconstitue le recueil d'UN dossier emprunteur au format actuel (un prêt,
 * avec le détail de chaque personne assurée). Aucune valeur déjà saisie n'est
 * remplacée.
 */
export async function reconstituerRecueilEmprunteur(
  supabase: Admin,
  dossierId: string,
): Promise<ResultatReconstitution> {
  const { data: dossier, error } = await supabase
    .from("dossiers")
    .select("id, reference, type_assurance, client_id, capital, duree_mois, recueil_besoins")
    .eq("id", dossierId)
    .maybeSingle();
  if (error || !dossier) throw new Error("Dossier introuvable");
  if (dossier.type_assurance !== "emprunteur") throw new Error("Dossier non emprunteur");

  const personnes: PersonneSourceEmprunteur[] = [];
  if (dossier.client_id) {
    const [{ data: client }, { data: conjoint }] = await Promise.all([
      supabase
        .from("clients")
        .select("nom, prenom, date_naissance, fumeur, csp")
        .eq("id", dossier.client_id)
        .maybeSingle(),
      supabase
        .from("client_conjoint")
        .select("nom, prenom, date_naissance, fumeur, profession")
        .eq("client_id", dossier.client_id)
        .maybeSingle(),
    ]);
    if (client) {
      personnes.push({
        lien: "principal",
        nom: [client.nom, client.prenom].filter(Boolean).join(" "),
        date_naissance: client.date_naissance,
        csp: client.csp,
        fumeur: client.fumeur,
      });
    }
    if (conjoint && (conjoint.nom || conjoint.date_naissance)) {
      personnes.push({
        lien: "co_emprunteur",
        nom: [conjoint.nom, conjoint.prenom].filter(Boolean).join(" "),
        date_naissance: conjoint.date_naissance,
        csp: conjoint.profession,
        fumeur: conjoint.fumeur,
      });
    }
  }

  const res = normaliserRecueilEmprunteur(
    (dossier.recueil_besoins as Record<string, unknown> | null) ?? null,
    { capital: dossier.capital, duree_mois: dossier.duree_mois },
    personnes,
  );

  if (res.ajouts.length === 0) {
    return { dossier: dossier.reference, ajouts: [], manquants: res.manquants, modifie: false };
  }

  const { error: majErr } = await supabase
    .from("dossiers")
    .update({ recueil_besoins: res.recueil })
    .eq("id", dossierId);
  if (majErr) throw new Error(majErr.message);

  return { dossier: dossier.reference, ajouts: res.ajouts, manquants: res.manquants, modifie: true };
}

/** Reconstitution de tous les dossiers emprunteur non clôturés. */
export async function reconstituerRecueilsEmprunteurEnCours(supabase: Admin, limite = 200) {
  const { data: dossiers, error } = await supabase
    .from("dossiers")
    .select("id")
    .eq("type_assurance", "emprunteur")
    .neq("statut", "cloture")
    .neq("statut", "perdu")
    .limit(limite);
  if (error) throw new Error(error.message);

  const details: (ResultatReconstitution & { erreur?: string })[] = [];
  for (const d of dossiers ?? []) {
    try {
      details.push(await reconstituerRecueilEmprunteur(supabase, d.id));
    } catch (e) {
      details.push({
        dossier: d.id,
        ajouts: [],
        manquants: [],
        modifie: false,
        erreur: e instanceof Error ? e.message : "erreur inconnue",
      });
    }
  }
  return { ok: true, traites: details.length, modifies: details.filter((d) => d.modifie).length, details };
}
