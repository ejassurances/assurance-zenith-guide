import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BRANCHES_COMMISSION,
  decrireRegle,
  type BaseCalcul,
  type RegleCommission,
  type TypeCommission,
} from "@/lib/commissions-bareme";

type Form = {
  id?: string;
  branche: string;
  type: TypeCommission;
  montant_fixe: string;
  taux_pourcentage: string;
  base_calcul: BaseCalcul;
  notes: string;
};

const vide = (): Form => ({
  branche: "emprunteur",
  type: "pourcentage",
  montant_fixe: "",
  taux_pourcentage: "",
  base_calcul: "prime",
  notes: "",
});

const inp = "w-full rounded-md border border-line bg-background px-3 py-2 text-sm";

/** Taux de commission propres à une compagnie, éditables depuis sa fiche. */
export function CompagnieTauxCommission({
  compagnieId,
  canEdit,
}: {
  compagnieId: string;
  canEdit: boolean;
}) {
  const [regles, setRegles] = useState<RegleCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("commission_bareme")
      .select("id,niveau,branche,compagnie_id,type,montant_fixe,taux_pourcentage,base_calcul,notes")
      .eq("compagnie_id", compagnieId);
    if (error) setErr(error.message);
    setRegles(((data ?? []) as unknown as RegleCommission[]) ?? []);
    setLoading(false);
  }, [compagnieId]);

  useEffect(() => {
    load();
  }, [load]);

  const editer = (r: RegleCommission) =>
    setForm({
      id: r.id,
      branche: r.branche,
      type: r.type,
      montant_fixe: r.montant_fixe != null ? String(r.montant_fixe) : "",
      taux_pourcentage: r.taux_pourcentage != null ? String(r.taux_pourcentage) : "",
      base_calcul: r.base_calcul,
      notes: r.notes ?? "",
    });

  const enregistrer = async () => {
    if (!form) return;
    setErr(null);
    const payload = {
      niveau: "compagnie",
      branche: form.branche,
      compagnie_id: compagnieId,
      type: form.type,
      montant_fixe: form.type === "fixe" ? Number(form.montant_fixe || 0) : null,
      taux_pourcentage: form.type === "pourcentage" ? Number(form.taux_pourcentage || 0) : null,
      base_calcul: form.base_calcul,
      notes: form.notes.trim() || null,
    };
    const q = form.id
      ? await supabase.from("commission_bareme").update(payload as never).eq("id", form.id)
      : await supabase.from("commission_bareme").insert(payload as never);
    if (q.error) return setErr(q.error.message);
    setForm(null);
    await load();
  };

  const supprimer = async (id: string) => {
    const { error } = await supabase.from("commission_bareme").delete().eq("id", id);
    if (error) return setErr(error.message);
    await load();
  };

  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg">Taux de commission</h3>
          <p className="text-xs text-ink-muted">
            Règles propres à cette compagnie : elles remplacent la règle de branche du barème cabinet.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setForm(vide())}
            className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            + Ajouter une branche
          </button>
        )}
      </div>

      {err && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{err}</p>}

      {loading ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : regles.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-ink-muted">
          Aucun taux spécifique : le barème de branche du cabinet s'applique.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {regles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <strong>
                  {BRANCHES_COMMISSION.find((b) => b.value === r.branche)?.label ?? r.branche}
                </strong>{" "}
                — {decrireRegle(r)}
                {r.notes ? <span className="text-ink-muted"> · {r.notes}</span> : null}
              </span>
              {canEdit && (
                <span className="flex gap-3 text-xs">
                  <button onClick={() => editer(r)} className="underline underline-offset-4">
                    Modifier
                  </button>
                  <button
                    onClick={() => supprimer(r.id!)}
                    className="text-red-700 underline underline-offset-4"
                  >
                    Supprimer
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {form && canEdit && (
        <div className="grid gap-3 rounded-md border border-[color:var(--crm-gold,#D4AF37)] bg-background p-4 md:grid-cols-3">
          <label className="text-xs text-ink-muted">
            Branche
            <select
              value={form.branche}
              onChange={(e) => setForm({ ...form, branche: e.target.value })}
              className={inp}
            >
              {BRANCHES_COMMISSION.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-muted">
            Type
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as TypeCommission })}
              className={inp}
            >
              <option value="pourcentage">Pourcentage</option>
              <option value="fixe">Montant fixe</option>
            </select>
          </label>
          {form.type === "pourcentage" ? (
            <>
              <label className="text-xs text-ink-muted">
                Taux (%)
                <input
                  type="number"
                  step="0.01"
                  value={form.taux_pourcentage}
                  onChange={(e) => setForm({ ...form, taux_pourcentage: e.target.value })}
                  className={inp}
                />
              </label>
              <label className="text-xs text-ink-muted">
                Base de calcul
                <select
                  value={form.base_calcul}
                  onChange={(e) => setForm({ ...form, base_calcul: e.target.value as BaseCalcul })}
                  className={inp}
                >
                  <option value="prime">Prime / cotisation</option>
                  <option value="economie_realisee">Économie réalisée</option>
                </select>
              </label>
            </>
          ) : (
            <label className="text-xs text-ink-muted">
              Montant fixe (€)
              <input
                type="number"
                step="0.01"
                value={form.montant_fixe}
                onChange={(e) => setForm({ ...form, montant_fixe: e.target.value })}
                className={inp}
              />
            </label>
          )}
          <label className="text-xs text-ink-muted md:col-span-3">
            Note interne
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inp}
              placeholder="Commission mensuelle proportionnelle à la cotisation"
            />
          </label>
          <div className="flex gap-3 md:col-span-3">
            <button
              onClick={enregistrer}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setForm(null)}
              className="text-sm text-ink-muted underline underline-offset-4"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
