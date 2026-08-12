import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CompagnieOption = { id: string; nom: string; statut: string };
export type ProduitOption = {
  id: string;
  nom: string;
  compagnie_id: string;
  statut: string;
  famille_id: string;
};
export type FamilleOption = { id: string; code: string; nom: string; branches: string[] };

export type CompagnieProduitSelection = {
  compagnie_id: string | null;
  produit_id: string | null;
  compagnie_nom: string | null;
  produit_nom: string | null;
};

const inp = "mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink";

/**
 * Sélecteur compagnie / produit rattaché au référentiel.
 * - compagnies filtrées sur statut « actif » (celle déjà rattachée reste visible)
 * - produits filtrés par compagnie ET par famille autorisée pour la branche
 */
export function CompagnieProduitPicker({
  branche,
  compagnieId,
  produitId,
  onChange,
  disabled,
}: {
  branche?: string | null;
  compagnieId: string | null;
  produitId: string | null;
  onChange: (sel: CompagnieProduitSelection) => void;
  disabled?: boolean;
}) {
  const [compagnies, setCompagnies] = useState<CompagnieOption[]>([]);
  const [produits, setProduits] = useState<ProduitOption[]>([]);
  const [familles, setFamilles] = useState<FamilleOption[]>([]);

  useEffect(() => {
    (async () => {
      const [cies, prods, fams] = await Promise.all([
        supabase.from("compagnies").select("id,nom,statut").order("nom"),
        supabase.from("produits").select("id,nom,compagnie_id,statut,famille_id").order("nom"),
        supabase.from("produit_familles").select("id,code,nom,branches").order("ordre"),
      ]);
      setCompagnies((cies.data as CompagnieOption[]) ?? []);
      setProduits((prods.data as ProduitOption[]) ?? []);
      setFamilles((fams.data as FamilleOption[]) ?? []);
    })();
  }, []);

  const famillesBranche = useMemo(
    () => (branche ? familles.filter((f) => (f.branches ?? []).includes(branche)) : familles),
    [familles, branche],
  );

  const compagniesVisibles = useMemo(
    () => compagnies.filter((c) => c.statut === "actif" || c.id === compagnieId),
    [compagnies, compagnieId],
  );

  const produitsVisibles = useMemo(() => {
    const famIds = new Set(famillesBranche.map((f) => f.id));
    return produits.filter(
      (p) =>
        p.id === produitId ||
        ((!compagnieId || p.compagnie_id === compagnieId) &&
          famIds.has(p.famille_id) &&
          (p.statut === "actif" || p.statut === "en_test")),
    );
  }, [produits, produitId, compagnieId, famillesBranche]);

  const produit = produits.find((p) => p.id === produitId) ?? null;
  const familleProduit = familles.find((f) => f.id === produit?.famille_id) ?? null;

  const emit = (nextCompagnie: string | null, nextProduit: string | null) => {
    onChange({
      compagnie_id: nextCompagnie,
      produit_id: nextProduit,
      compagnie_nom: compagnies.find((c) => c.id === nextCompagnie)?.nom ?? null,
      produit_nom: produits.find((p) => p.id === nextProduit)?.nom ?? null,
    });
  };

  const aucunProduit = produitsVisibles.length === 0;

  return (
    <>
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Compagnie</span>
        <select
          value={compagnieId ?? ""}
          disabled={disabled}
          onChange={(e) => emit(e.target.value || null, null)}
          className={inp}
        >
          <option value="">— Choisir —</option>
          {compagniesVisibles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
              {c.statut !== "actif" ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Produit référencé</span>
        <select
          value={produitId ?? ""}
          disabled={disabled || (aucunProduit && !produitId)}
          onChange={(e) => emit(compagnieId, e.target.value || null)}
          className={inp}
        >
          <option value="">— Choisir —</option>
          {produitsVisibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </select>
        {familleProduit && <span className="mt-1 block text-xs text-ink-muted">Famille : {familleProduit.nom}</span>}
        {aucunProduit && (
          <span className="mt-1 block text-xs text-amber-700">
            {famillesBranche.length === 0
              ? "Aucune famille de produits n'est rattachée à cette branche. À paramétrer côté référentiel."
              : compagnieId
                ? "Aucun produit actif pour cette compagnie sur cette branche."
                : "Sélectionnez d'abord une compagnie."}
          </span>
        )}
      </label>
    </>
  );
}
