import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValeursGrille } from "@/lib/garanties-grille";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "formule";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Accepte une proposition IA de grille de formule : crée la formule si elle n'existe
 * pas encore sous ce nom, puis enregistre sa grille (`formule_garanties`).
 * `statut` = 'valide' exige un administrateur (contrôlé en amont).
 */
export async function traiterPropositionFormule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  propositionId: string,
  statut: "brouillon" | "valide",
  userId: string,
) {
  const { data: prop, error } = await supabase
    .from("formule_garanties_propositions")
    .select("id, produit_id, formule_id, formule_nom, grille_version, valeurs, statut")
    .eq("id", propositionId)
    .maybeSingle();
  if (error || !prop) throw new Error("Proposition introuvable ou accès refusé");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prop as any;
  if (p.statut !== "proposee") throw new Error("Cette proposition a déjà été traitée.");

  let formuleId: string | null = p.formule_id ?? null;

  if (!formuleId) {
    const { data: formules } = await supabase
      .from("produit_formules")
      .select("id, nom")
      .eq("produit_id", p.produit_id);
    const liste = ((formules ?? []) as { id: string; nom: string }[]);
    formuleId = liste.find((f) => norm(f.nom) === norm(p.formule_nom))?.id ?? null;

    if (!formuleId) {
      const { data: creee, error: cErr } = await supabase
        .from("produit_formules")
        .insert({
          produit_id: p.produit_id,
          nom: p.formule_nom,
          code: slug(p.formule_nom),
          ordre: liste.length + 1,
        })
        .select("id")
        .single();
      if (cErr || !creee) throw new Error(cErr?.message ?? "Création de la formule impossible");
      formuleId = (creee as { id: string }).id;
    }
  }

  const payload: Record<string, unknown> = {
    formule_id: formuleId,
    grille_version: p.grille_version,
    valeurs: (p.valeurs ?? {}) as ValeursGrille,
    statut,
    updated_by: userId,
  };
  const { error: gErr } = await supabase
    .from("formule_garanties")
    .upsert(payload, { onConflict: "formule_id" });
  if (gErr) throw new Error(gErr.message);

  await supabase
    .from("formule_garanties_propositions")
    .update({
      statut: "acceptee",
      formule_id: formuleId,
      traite_par: userId,
      traite_le: new Date().toISOString(),
    })
    .eq("id", propositionId);

  await supabase.rpc("log_audit", {
    _action: statut === "valide" ? "valider_grille_formule" : "brouillon_grille_formule",
    _target_type: "formule_garanties",
    _target_id: formuleId,
    _metadata: { proposition_id: propositionId, formule_nom: p.formule_nom },
  });

  return { ok: true, formule_id: formuleId };
}
