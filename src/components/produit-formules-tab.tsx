import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProduitGarantiesTab, type DocAnalysable } from "@/components/produit-garanties-tab";
import { FormulePropositionsPanel } from "@/components/formule-propositions-panel";

export type Formule = {
  id: string;
  produit_id: string;
  nom: string;
  code: string;
  ordre: number;
  actif: boolean;
  /** Cotisation fixe connue de la formule (mode de tarification « fixe »). */
  tarif_fixe: number | null;
};

export type ProduitOption = {
  id: string;
  produit_id: string;
  nom: string;
  tarif_fixe: number | null;
  description: string | null;
  actif: boolean;
  ordre: number;
};


type Tarif = {
  id: string;
  formule_id: string;
  age_min: number;
  age_max: number;
  regime: "salarie" | "tns" | "general" | null;
  cotisation_mensuelle: number | null;
  notes: string | null;
};

const REGIMES: { value: string; label: string }[] = [
  { value: "", label: "— Tous —" },
  { value: "general", label: "Régime général" },
  { value: "salarie", label: "Salarié" },
  { value: "tns", label: "TNS" },
];

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "formule";

/**
 * Formules d'un produit (ex. Éco / Confort / Premium en complémentaire santé).
 * Chaque formule porte sa propre grille de garanties (formule_garanties, avec
 * validation humaine obligatoire) et sa grille tarifaire indicative.
 */
export function ProduitFormulesTab({
  produitId,
  familleCode,
  familleNom,
  isAdmin,
  docs,
  modeFixe = false,
}: {
  produitId: string;
  familleCode: string | null;
  familleNom?: string;
  isAdmin: boolean;
  docs: DocAnalysable[];
  /** Produit en mode_tarification = 'fixe' : cotisation fixe par formule + options payantes. */
  modeFixe?: boolean;
}) {
  const [formules, setFormules] = useState<Formule[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("produit_formules")
      .select("id,produit_id,nom,code,ordre,actif,tarif_fixe")

      .eq("produit_id", produitId)
      .order("ordre")
      .order("nom");
    if (error) setErr(error.message);
    const list = (data as Formule[]) ?? [];
    setFormules(list);
    setActiveId((cur) => (cur && list.some((f) => f.id === cur) ? cur : (list[0]?.id ?? null)));
  }, [produitId]);

  useEffect(() => {
    load();
  }, [load]);

  const ajouter = async () => {
    const nom = nouveau.trim();
    if (!nom) return;
    setErr(null);
    const { error } = await supabase.from("produit_formules").insert({
      produit_id: produitId,
      nom,
      code: slug(nom),
      ordre: formules.length + 1,
    });
    if (error) return setErr(error.message);
    setNouveau("");
    await load();
  };

  const renommer = async (f: Formule, nom: string) => {
    setErr(null);
    const { error } = await supabase
      .from("produit_formules")
      .update({ nom, code: slug(nom) })
      .eq("id", f.id);
    if (error) return setErr(error.message);
    await load();
  };

  const majTarifFixe = async (f: Formule, tarif: number | null) => {
    if (tarif === (f.tarif_fixe ?? null)) return;
    setErr(null);
    const { error } = await supabase.from("produit_formules").update({ tarif_fixe: tarif }).eq("id", f.id);
    if (error) return setErr(error.message);
    await load();
  };

  const basculerActif = async (f: Formule) => {

    const { error } = await supabase.from("produit_formules").update({ actif: !f.actif }).eq("id", f.id);
    if (error) return setErr(error.message);
    await load();
  };

  const supprimer = async (f: Formule) => {
    if (!confirm(`Supprimer la formule « ${f.nom} » (garanties et tarifs associés) ?`)) return;
    const { error } = await supabase.from("produit_formules").delete().eq("id", f.id);
    if (error) return setErr(error.message);
    await load();
  };

  const active = formules.find((f) => f.id === activeId) ?? null;

  return (
    <section className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <div>
        <h3 className="font-serif text-lg">Formules du produit</h3>
        <p className="text-xs text-ink-muted">
          Une formule = un niveau de garanties et un tarif (ex. Éco / Confort / Premium). Chaque formule a sa propre
          grille de garanties, à valider par l'administrateur avant tout devoir de conseil.
        </p>
      </div>

      {err && <p className="text-xs text-rose-700">{err}</p>}

      <div className="flex flex-wrap gap-2">
        {formules.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveId(f.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              f.id === activeId ? "border-ink bg-ink text-surface" : "border-line bg-background"
            } ${f.actif ? "" : "opacity-60"}`}
          >
            {f.nom}
            {f.actif ? "" : " (inactive)"}
          </button>
        ))}
        {formules.length === 0 && <p className="text-sm text-ink-muted">Aucune formule pour ce produit.</p>}
      </div>

      {familleCode === "sante" && (
        <FormulePropositionsPanel
          produitId={produitId}
          familleCode={familleCode}
          isAdmin={isAdmin}
          docs={docs}
          onChange={load}
        />
      )}


      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            placeholder="Nom de la formule (ex. Confort)"
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={ajouter}
            className="rounded-md bg-ink px-3 py-2 text-sm text-surface disabled:opacity-50"
            disabled={!nouveau.trim()}
          >
            Ajouter une formule
          </button>
        </div>
      )}

      {active && (
        <div className="space-y-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              defaultValue={active.nom}
              key={active.id}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== active.nom) renommer(active, v);
              }}
              readOnly={!isAdmin}
              className="rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
            <span className="text-xs text-ink-muted">code : {active.code}</span>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => basculerActif(active)}
                  className="rounded-md border border-line px-3 py-1.5 text-xs"
                >
                  {active.actif ? "Désactiver" : "Réactiver"}
                </button>
                <button
                  type="button"
                  onClick={() => supprimer(active)}
                  className="text-xs text-red-700 underline underline-offset-4"
                >
                  Supprimer cette formule
                </button>
              </>
            )}
          </div>

          {modeFixe && (
            <div className="space-y-1 rounded-md border border-line bg-background p-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Cotisation fixe de la formule (€ / mois)
              </label>
              <input
                type="number"
                step="0.01"
                defaultValue={active.tarif_fixe ?? ""}
                key={`tf-${active.id}`}
                readOnly={!isAdmin}
                onBlur={(e) =>
                  majTarifFixe(active, e.target.value === "" ? null : Number(e.target.value))
                }
                className="w-40 rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
              />
              <p className="text-[11px] text-ink-muted">
                Tarif connu et stable, réutilisé tel quel sur les dossiers. Prioritaire sur la grille par tranche
                d'âge ci-dessous si les deux sont renseignés.
              </p>
            </div>
          )}

          <ProduitGarantiesTab
            produitId={produitId}
            formuleId={active.id}
            titre={`Grille de garanties — formule ${active.nom}`}
            familleCode={familleCode}
            familleNom={familleNom}
            isAdmin={isAdmin}
            docs={docs}
          />

          <FormuleTarifs formuleId={active.id} isAdmin={isAdmin} />
        </div>
      )}

      {modeFixe && <ProduitOptionsBlock produitId={produitId} isAdmin={isAdmin} />}
    </section>

  );
}

function FormuleTarifs({ formuleId, isAdmin }: { formuleId: string; isAdmin: boolean }) {
  const [tarifs, setTarifs] = useState<Tarif[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("formule_tarifs")
      .select("id,formule_id,age_min,age_max,regime,cotisation_mensuelle,notes")
      .eq("formule_id", formuleId)
      .order("age_min");
    if (error) setErr(error.message);
    setTarifs((data as Tarif[]) ?? []);
  }, [formuleId]);

  useEffect(() => {
    load();
  }, [load]);

  const ajouter = async () => {
    const dernier = tarifs[tarifs.length - 1];
    const { error } = await supabase.from("formule_tarifs").insert({
      formule_id: formuleId,
      age_min: dernier ? dernier.age_max + 1 : 18,
      age_max: dernier ? Math.min(120, dernier.age_max + 10) : 29,
    });
    if (error) return setErr(error.message);
    await load();
  };

  const maj = async (t: Tarif, patch: Partial<Tarif>) => {
    setTarifs((l) => l.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("formule_tarifs").update(patch).eq("id", t.id);
    if (error) setErr(error.message);
  };

  const supprimer = async (t: Tarif) => {
    const { error } = await supabase.from("formule_tarifs").delete().eq("id", t.id);
    if (error) return setErr(error.message);
    await load();
  };

  return (
    <div className="space-y-2 rounded-md border border-line bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        Tarifs indicatifs par tranche d'âge
      </p>
      {err && <p className="text-xs text-rose-700">{err}</p>}
      {tarifs.length === 0 && <p className="text-xs text-ink-muted">Aucune tranche tarifaire renseignée.</p>}

      {tarifs.length > 0 && (
        <div className="space-y-2">
          <div className="hidden gap-2 text-[11px] uppercase tracking-wide text-ink-muted sm:grid sm:grid-cols-12">
            <span className="sm:col-span-2">Âge min</span>
            <span className="sm:col-span-2">Âge max</span>
            <span className="sm:col-span-2">Régime</span>
            <span className="sm:col-span-2">€ / mois</span>
            <span className="sm:col-span-3">Notes</span>
          </div>
          {tarifs.map((t) => (
            <div key={t.id} className="grid gap-2 sm:grid-cols-12">
              <input
                type="number"
                value={t.age_min}
                readOnly={!isAdmin}
                onChange={(e) => maj(t, { age_min: Number(e.target.value) })}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm sm:col-span-2"
              />
              <input
                type="number"
                value={t.age_max}
                readOnly={!isAdmin}
                onChange={(e) => maj(t, { age_max: Number(e.target.value) })}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm sm:col-span-2"
              />
              <select
                value={t.regime ?? ""}
                disabled={!isAdmin}
                onChange={(e) => maj(t, { regime: (e.target.value || null) as Tarif["regime"] })}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm sm:col-span-2"
              >
                {REGIMES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={t.cotisation_mensuelle ?? ""}
                readOnly={!isAdmin}
                onChange={(e) =>
                  maj(t, { cotisation_mensuelle: e.target.value === "" ? null : Number(e.target.value) })
                }
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm sm:col-span-2"
              />
              <input
                value={t.notes ?? ""}
                readOnly={!isAdmin}
                onChange={(e) => maj(t, { notes: e.target.value || null })}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm sm:col-span-3"
              />
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => supprimer(t)}
                  className="text-xs text-red-700 underline underline-offset-4 sm:col-span-1"
                >
                  Suppr.
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <button type="button" onClick={ajouter} className="mt-1 text-xs text-ink-muted underline">
          + Ajouter une tranche d'âge
        </button>
      )}
      <p className="text-[11px] text-ink-muted">
        Tarifs indicatifs, saisis manuellement — ils ne remplacent pas une tarification officielle de la compagnie.
      </p>
    </div>
  );
}

/**
 * Options payantes à tarif fixe d'un produit (ex. « Assistance renforcée »).
 * Reprises telles quelles sur le dossier lors de la génération du devis fixe.
 */
function ProduitOptionsBlock({ produitId, isAdmin }: { produitId: string; isAdmin: boolean }) {
  const [options, setOptions] = useState<ProduitOption[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("produit_options")
      .select("id,produit_id,nom,tarif_fixe,description,actif,ordre")
      .eq("produit_id", produitId)
      .order("ordre")
      .order("nom");
    if (error) setErr(error.message);
    setOptions((data as ProduitOption[]) ?? []);
  }, [produitId]);

  useEffect(() => {
    load();
  }, [load]);

  const ajouter = async () => {
    const nom = nouveau.trim();
    if (!nom) return;
    setErr(null);
    const { error } = await supabase
      .from("produit_options")
      .insert({ produit_id: produitId, nom, ordre: options.length + 1 });
    if (error) return setErr(error.message);
    setNouveau("");
    await load();
  };

  const maj = async (o: ProduitOption, patch: Partial<ProduitOption>) => {
    setOptions((l) => l.map((x) => (x.id === o.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("produit_options").update(patch).eq("id", o.id);
    if (error) setErr(error.message);
  };

  const supprimer = async (o: ProduitOption) => {
    if (!confirm(`Supprimer l'option « ${o.nom} » ?`)) return;
    const { error } = await supabase.from("produit_options").delete().eq("id", o.id);
    if (error) return setErr(error.message);
    await load();
  };

  return (
    <div className="space-y-2 rounded-md border border-line bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Options payantes (tarif fixe)</p>
      {err && <p className="text-xs text-rose-700">{err}</p>}
      {options.length === 0 && <p className="text-xs text-ink-muted">Aucune option pour ce produit.</p>}

      {options.length > 0 && (
        <div className="space-y-2">
          <div className="hidden gap-2 text-[11px] uppercase tracking-wide text-ink-muted sm:grid sm:grid-cols-12">
            <span className="sm:col-span-3">Nom</span>
            <span className="sm:col-span-2">€ / mois</span>
            <span className="sm:col-span-4">Description</span>
            <span className="sm:col-span-2">Active</span>
          </div>
          {options.map((o) => (
            <div key={o.id} className="grid gap-2 sm:grid-cols-12">
              <input
                defaultValue={o.nom}
                readOnly={!isAdmin}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== o.nom) maj(o, { nom: v });
                }}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm sm:col-span-3"
              />
              <input
                type="number"
                step="0.01"
                value={o.tarif_fixe ?? ""}
                readOnly={!isAdmin}
                onChange={(e) => maj(o, { tarif_fixe: e.target.value === "" ? null : Number(e.target.value) })}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm sm:col-span-2"
              />
              <input
                value={o.description ?? ""}
                readOnly={!isAdmin}
                onChange={(e) => maj(o, { description: e.target.value || null })}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm sm:col-span-4"
              />
              <label className="flex items-center gap-2 text-xs text-ink-soft sm:col-span-2">
                <input
                  type="checkbox"
                  checked={o.actif}
                  disabled={!isAdmin}
                  onChange={(e) => maj(o, { actif: e.target.checked })}
                />
                {o.actif ? "Active" : "Inactive"}
              </label>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => supprimer(o)}
                  className="text-xs text-red-700 underline underline-offset-4 sm:col-span-1"
                >
                  Suppr.
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            placeholder="Nom de l'option (ex. Assistance renforcée)"
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={ajouter}
            disabled={!nouveau.trim()}
            className="rounded-md bg-ink px-3 py-2 text-sm text-surface disabled:opacity-50"
          >
            Ajouter une option
          </button>
        </div>
      )}
    </div>
  );
}
