/**
 * Rapprochement automatique des factures d'achat avec la fiche fournisseur.
 * Aucune fiche n'est créée en douce : on rapproche par domaine e-mail puis par
 * nom, et on renvoie null si le fournisseur n'est pas encore référencé.
 */

function normaliser(valeur: string) {
  return valeur
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export type FournisseurRapproche = {
  id: string;
  nom: string;
  compte_charge_defaut: string | null;
  echeance_jours: number | null;
  moyen_paiement_habituel: string | null;
};

export async function rapprocherFournisseur(params: {
  nom?: string | null;
  email?: string | null;
}): Promise<FournisseurRapproche | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("fournisseurs")
    .select("id,nom,domaines_email,compte_charge_defaut,echeance_jours,moyen_paiement_habituel")
    .eq("statut", "actif");

  const fiches = (data ?? []) as (FournisseurRapproche & { domaines_email: string[] | null })[];
  if (fiches.length === 0) return null;

  const domaine = params.email?.split("@")[1]?.toLowerCase().trim() ?? null;
  if (domaine) {
    const parDomaine = fiches.find((f) =>
      (f.domaines_email ?? []).some((d) => {
        const dom = d.toLowerCase().trim();
        return dom && (domaine === dom || domaine.endsWith(`.${dom}`));
      }),
    );
    if (parDomaine) return extraire(parDomaine);
  }

  const nom = params.nom ? normaliser(params.nom) : "";
  if (nom.length >= 3) {
    const parNom = fiches.find((f) => {
      const cible = normaliser(f.nom);
      return cible.length >= 3 && (nom === cible || nom.includes(cible) || cible.includes(nom));
    });
    if (parNom) return extraire(parNom);
  }

  return null;
}

function extraire(f: FournisseurRapproche): FournisseurRapproche {
  return {
    id: f.id,
    nom: f.nom,
    compte_charge_defaut: f.compte_charge_defaut,
    echeance_jours: f.echeance_jours,
    moyen_paiement_habituel: f.moyen_paiement_habituel,
  };
}
