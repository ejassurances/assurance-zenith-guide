import type { SupabaseClient } from "@supabase/supabase-js";
import { grillePourFamille, type ValeursGrille } from "@/lib/garanties-grille";

/** Types de documents exploitables pour standardiser un contrat (hors santé multi-formules). */
const TYPES_ANALYSABLES = ["conditions_generales", "ipid", "fiche_produit", "ccsf", "tableau_garanties"];
/** Les conditions générales font foi : elles passent en tête de la sélection. */
const PRIORITE = ["conditions_generales", "ipid", "tableau_garanties", "ccsf", "fiche_produit"];

export type EtatGrilleProduit = {
  produit_id: string;
  nom: string;
  compagnie_id: string | null;
  compagnie: string | null;
  statut_produit: string;
  documents: { id: string; nom: string; type: string }[];
  grille_statut: string | null;
  grille_version: number | null;
  valide_le: string | null;
  proposition: {
    id: string;
    created_at: string;
    modele_ia: string | null;
    grille_version: number;
    valeurs: ValeursGrille;
    assureur_porteur_propose: string | null;
    reference_contrat_propose: string | null;
  } | null;
};

/** Agrège, pour une famille, l'état de standardisation de chaque produit. */
export async function etatGrillesFamille(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  familleCode: string,
): Promise<{ famille_code: string; grille_version: number | null; produits: EtatGrilleProduit[] }> {
  const grille = grillePourFamille(familleCode);

  const { data: famille } = await supabase
    .from("produit_familles")
    .select("id")
    .eq("code", familleCode)
    .maybeSingle();
  const familleId = (famille as { id: string } | null)?.id ?? null;
  if (!familleId) return { famille_code: familleCode, grille_version: grille?.version ?? null, produits: [] };

  const { data: produits, error } = await supabase
    .from("produits")
    .select("id, nom, statut, compagnie_id, compagnies!produits_compagnie_id_fkey(nom)")
    .eq("famille_id", familleId)
    .order("nom");
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (produits ?? []) as any[];
  const ids = rows.map((p) => p.id as string);
  if (ids.length === 0) return { famille_code: familleCode, grille_version: grille?.version ?? null, produits: [] };

  const [docsRes, grillesRes, propsRes] = await Promise.all([
    supabase
      .from("produit_documents")
      .select("id, produit_id, nom, type")
      .in("produit_id", ids)
      .in("type", TYPES_ANALYSABLES),
    supabase.from("produit_garanties").select("produit_id, statut, grille_version, valide_le").in("produit_id", ids),
    supabase
      .from("produit_garanties_propositions")
      .select(
        "id, produit_id, created_at, modele_ia, grille_version, valeurs, assureur_porteur_propose, reference_contrat_propose",
      )
      .in("produit_id", ids)
      .eq("statut", "proposee")
      .order("created_at", { ascending: false }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs = (docsRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grilles = (grillesRes.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propositions = (propsRes.data ?? []) as any[];

  const produitsEtat: EtatGrilleProduit[] = rows.map((p) => {
    const mesDocs = docs
      .filter((d) => d.produit_id === p.id)
      .sort((a, b) => PRIORITE.indexOf(a.type) - PRIORITE.indexOf(b.type))
      .map((d) => ({ id: d.id as string, nom: (d.nom as string) ?? "document", type: d.type as string }));
    const g = grilles.find((x) => x.produit_id === p.id) ?? null;
    const prop = propositions.find((x) => x.produit_id === p.id) ?? null;
    return {
      produit_id: p.id,
      nom: p.nom ?? "",
      compagnie_id: p.compagnie_id ?? null,
      compagnie: p.compagnies?.nom ?? null,
      statut_produit: p.statut ?? "actif",
      documents: mesDocs,
      grille_statut: g?.statut ?? null,
      grille_version: g?.grille_version ?? null,
      valide_le: g?.valide_le ?? null,
      proposition: prop
        ? {
            id: prop.id,
            created_at: prop.created_at,
            modele_ia: prop.modele_ia ?? null,
            grille_version: prop.grille_version,
            valeurs: (prop.valeurs ?? {}) as ValeursGrille,
            assureur_porteur_propose: prop.assureur_porteur_propose ?? null,
            reference_contrat_propose: prop.reference_contrat_propose ?? null,
          }
        : null,
    };
  });

  return { famille_code: familleCode, grille_version: grille?.version ?? null, produits: produitsEtat };
}
