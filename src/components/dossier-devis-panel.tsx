import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { classerDevisDossierFn, retenirDevisDossierFn } from "@/lib/devis-classement.functions";

export type DossierDevis = {
  id: string;
  dossier_id: string;
  compagnie_id: string | null;
  produit_id: string | null;
  formule_id: string | null;
  cotisation_mensuelle: number | null;
  source: "manuel" | "api" | "pdf";
  garanties_resume: string | null;
  created_at: string;
};

type LigneClassement = { dossier_devis_id: string; rang: number; justification: string };
type Classement = {
  id: string;
  genere_le: string;
  modele_ia: string | null;
  classement: LigneClassement[];
  statut: string;
};

type Ref = { id: string; nom: string };
type ProduitRef = { id: string; nom: string; compagnie_id: string; famille_id: string };
type FormuleRef = { id: string; nom: string; produit_id: string; actif: boolean };

const inp = "w-full rounded-md border border-line bg-background px-3 py-2 text-sm";


/** Devis comparés saisis manuellement par le staff — base du comparatif du devoir de conseil. */
export function DossierDevisPanel({
  dossierId,
  branche,
  userId,
  onChanged,
}: {
  dossierId: string;
  branche?: string | null;
  userId: string;
  onChanged?: () => void;
}) {
  const [devis, setDevis] = useState<DossierDevis[]>([]);
  const [compagnies, setCompagnies] = useState<Ref[]>([]);
  const [produits, setProduits] = useState<ProduitRef[]>([]);
  const [formules, setFormules] = useState<FormuleRef[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [classement, setClassement] = useState<Classement | null>(null);
  const [iaEtat, setIaEtat] = useState<"idle" | "classement" | "selection">("idle");
  const [iaMsg, setIaMsg] = useState<string | null>(null);
  const lancerClassement = useServerFn(classerDevisDossierFn);
  const retenirOffre = useServerFn(retenirDevisDossierFn);

  const [form, setForm] = useState({
    compagnie_id: "",
    produit_id: "",
    formule_id: "",
    cotisation_mensuelle: "",
    garanties_resume: "",
  });

  const load = useCallback(async () => {
    const [d, c, p, cl] = await Promise.all([
      supabase
        .from("dossier_devis")
        .select("id,dossier_id,compagnie_id,produit_id,formule_id,cotisation_mensuelle,source,garanties_resume,created_at")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: true }),
      supabase.from("compagnies").select("id,nom").order("nom"),
      supabase.from("produits").select("id,nom,compagnie_id,famille_id").order("nom"),
      supabase
        .from("dossier_devis_classements")
        .select("id,genere_le,modele_ia,classement,statut")
        .eq("dossier_id", dossierId)
        .eq("statut", "propose")
        .order("genere_le", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (d.error) setErr(d.error.message);
    setDevis((d.data as DossierDevis[]) ?? []);
    setCompagnies((c.data as Ref[]) ?? []);
    setProduits((p.data as ProduitRef[]) ?? []);
    setClassement((cl.data as Classement | null) ?? null);
  }, [dossierId]);


  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      if (!form.produit_id) return setFormules([]);
      const { data } = await supabase
        .from("produit_formules")
        .select("id,nom,produit_id,actif")
        .eq("produit_id", form.produit_id)
        .order("ordre");
      setFormules(((data as FormuleRef[]) ?? []).filter((f) => f.actif));
    })();
  }, [form.produit_id]);

  const nomCompagnie = (id: string | null) => compagnies.find((c) => c.id === id)?.nom ?? "—";
  const nomProduit = (id: string | null) => produits.find((p) => p.id === id)?.nom ?? "—";

  const ajouter = async () => {
    setErr(null);
    if (!form.compagnie_id || !form.produit_id) {
      setErr("Choisissez une compagnie et un produit.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("dossier_devis").insert({
      dossier_id: dossierId,
      compagnie_id: form.compagnie_id,
      produit_id: form.produit_id,
      formule_id: form.formule_id || null,
      cotisation_mensuelle: form.cotisation_mensuelle ? Number(form.cotisation_mensuelle) : null,
      garanties_resume: form.garanties_resume.trim() || null,
      source: "manuel",
      saisi_par: userId,
    });
    setSaving(false);
    if (error) return setErr(error.message);
    setForm({ compagnie_id: "", produit_id: "", formule_id: "", cotisation_mensuelle: "", garanties_resume: "" });
    await load();
    onChanged?.();
  };

  const supprimer = async (d: DossierDevis) => {
    if (!confirm("Supprimer ce devis du comparatif ?")) return;
    const { error } = await supabase.from("dossier_devis").delete().eq("id", d.id);
    if (error) return setErr(error.message);
    await load();
    onChanged?.();
  };

  const produitsVisibles = produits.filter((p) => !form.compagnie_id || p.compagnie_id === form.compagnie_id);

  const demanderClassement = async () => {
    setIaMsg(null);
    setErr(null);
    setIaEtat("classement");
    try {
      await lancerClassement({ data: { dossier_id: dossierId } });
      await load();
      setIaMsg("Classement IA généré — à vous de retenir l'offre.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Classement IA impossible");
    } finally {
      setIaEtat("idle");
    }
  };

  const retenir = async (devisId: string) => {
    if (!classement) return;
    if (!confirm("Retenir cette offre et générer le devoir de conseil en brouillon (sans envoi au client) ?")) return;
    setIaMsg(null);
    setErr(null);
    setIaEtat("selection");
    try {
      await retenirOffre({ data: { classement_id: classement.id, devis_id: devisId } });
      await load();
      setIaMsg(
        "Offre retenue : compagnie et produit reportés sur le dossier, devoir de conseil créé en brouillon. L'envoi au client reste à déclencher manuellement.",
      );
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sélection impossible");
    } finally {
      setIaEtat("idle");
    }
  };


  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <h2 className="font-serif text-lg font-medium text-ink">Devis comparés</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Saisie manuelle des devis étudiés pour ce dossier{branche ? ` (${branche})` : ""}. Ils alimentent le tableau
        des offres comparées du devoir de conseil.
      </p>

      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}

      <div className="mt-4 space-y-2">
        {devis.length === 0 && <p className="text-sm text-ink-muted">Aucun devis saisi pour ce dossier.</p>}
        {devis.map((d) => {
          const formule = d.formule_id;
          return (
            <div key={d.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-ink">
                  {nomCompagnie(d.compagnie_id)} — {nomProduit(d.produit_id)}
                  {formule && <FormuleNom formuleId={formule} />}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-ink-soft">
                    {d.cotisation_mensuelle != null
                      ? `${Number(d.cotisation_mensuelle).toLocaleString("fr-FR")} € / mois`
                      : "Cotisation non renseignée"}
                  </span>
                  <button onClick={() => supprimer(d)} className="text-xs text-red-700 underline underline-offset-4">
                    Supprimer
                  </button>
                </div>
              </div>
              {d.garanties_resume && (
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink-soft">{d.garanties_resume}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Compagnie</span>
          <select
            value={form.compagnie_id}
            onChange={(e) => setForm({ ...form, compagnie_id: e.target.value, produit_id: "", formule_id: "" })}
            className={inp}
          >
            <option value="">— Choisir —</option>
            {compagnies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Produit</span>
          <select
            value={form.produit_id}
            onChange={(e) => setForm({ ...form, produit_id: e.target.value, formule_id: "" })}
            className={inp}
          >
            <option value="">— Choisir —</option>
            {produitsVisibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        </label>
        {formules.length > 0 && (
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Formule</span>
            <select
              value={form.formule_id}
              onChange={(e) => setForm({ ...form, formule_id: e.target.value })}
              className={inp}
            >
              <option value="">— Aucune —</option>
              {formules.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Cotisation (€ / mois)</span>
          <input
            type="number"
            step="0.01"
            value={form.cotisation_mensuelle}
            onChange={(e) => setForm({ ...form, cotisation_mensuelle: e.target.value })}
            className={inp}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Résumé des garanties</span>
          <textarea
            rows={2}
            value={form.garanties_resume}
            onChange={(e) => setForm({ ...form, garanties_resume: e.target.value })}
            className={inp}
          />
        </label>
        <div className="sm:col-span-2">
          <button
            onClick={ajouter}
            disabled={saving}
            className="rounded-full bg-ink px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Ajouter ce devis"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormuleNom({ formuleId }: { formuleId: string }) {
  const [nom, setNom] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("produit_formules").select("nom").eq("id", formuleId).maybeSingle();
      setNom((data as { nom: string } | null)?.nom ?? null);
    })();
  }, [formuleId]);
  return nom ? <span className="text-ink-soft"> · formule {nom}</span> : null;
}
