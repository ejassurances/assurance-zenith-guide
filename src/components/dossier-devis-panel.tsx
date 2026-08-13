import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  classerDevisDossierFn,
  retenirDevisDossierFn,
  creerDevisTarifFixeFn,
} from "@/lib/devis-classement.functions";

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
type FormuleFixe = { id: string; nom: string; tarif_fixe: number | null; actif: boolean };
type OptionFixe = { id: string; nom: string; tarif_fixe: number | null; description: string | null };

const inp = "w-full rounded-md border border-line bg-background px-3 py-2 text-sm";
const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € / mois`;



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
  const creerFixe = useServerFn(creerDevisTarifFixeFn);

  /** Produit du dossier en tarification fixe : formules et options à cotisation connue. */
  const [produitFixe, setProduitFixe] = useState<{ id: string; nom: string } | null>(null);
  const [formulesFixes, setFormulesFixes] = useState<FormuleFixe[]>([]);
  const [optionsFixes, setOptionsFixes] = useState<OptionFixe[]>([]);
  const [fixeFormuleId, setFixeFormuleId] = useState("");
  const [fixeOptionIds, setFixeOptionIds] = useState<string[]>([]);
  const [fixeEtat, setFixeEtat] = useState<"idle" | "envoi">("idle");

  const [form, setForm] = useState({
    compagnie_id: "",
    produit_id: "",
    formule_id: "",
    cotisation_mensuelle: "",
    garanties_resume: "",
  });

  const load = useCallback(async () => {
    const [d, c, p, cl, dos] = await Promise.all([
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
      supabase.from("dossiers").select("produit_id").eq("id", dossierId).maybeSingle(),
    ]);
    if (d.error) setErr(d.error.message);
    setDevis((d.data as DossierDevis[]) ?? []);
    setCompagnies((c.data as Ref[]) ?? []);
    setProduits((p.data as ProduitRef[]) ?? []);
    setClassement((cl.data as Classement | null) ?? null);

    const produitDossierId = (dos.data as { produit_id: string | null } | null)?.produit_id ?? null;
    if (!produitDossierId) {
      setProduitFixe(null);
      setFormulesFixes([]);
      setOptionsFixes([]);
      return;
    }
    const { data: prod } = await supabase
      .from("produits")
      .select("id,nom,mode_tarification")
      .eq("id", produitDossierId)
      .maybeSingle();
    const pr = prod as { id: string; nom: string; mode_tarification: string } | null;
    if (!pr || pr.mode_tarification !== "fixe") {
      setProduitFixe(null);
      setFormulesFixes([]);
      setOptionsFixes([]);
      return;
    }
    setProduitFixe({ id: pr.id, nom: pr.nom });
    const [fm, op] = await Promise.all([
      supabase
        .from("produit_formules")
        .select("id,nom,tarif_fixe,actif")
        .eq("produit_id", pr.id)
        .eq("actif", true)
        .order("ordre"),
      supabase
        .from("produit_options")
        .select("id,nom,tarif_fixe,description")
        .eq("produit_id", pr.id)
        .eq("actif", true)
        .order("ordre"),
    ]);
    setFormulesFixes((fm.data as FormuleFixe[]) ?? []);
    setOptionsFixes((op.data as OptionFixe[]) ?? []);
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


  const formuleFixeChoisie = formulesFixes.find((f) => f.id === fixeFormuleId) ?? null;
  const totalFixe =
    (formuleFixeChoisie?.tarif_fixe == null ? 0 : Number(formuleFixeChoisie.tarif_fixe)) +
    optionsFixes
      .filter((o) => fixeOptionIds.includes(o.id))
      .reduce((s, o) => s + (o.tarif_fixe == null ? 0 : Number(o.tarif_fixe)), 0);

  const genererDepuisTarifFixe = async () => {
    if (!fixeFormuleId) return;
    if (
      !confirm(
        "Créer ce devis comme seule offre du dossier et générer le devoir de conseil en brouillon (sans envoi au client) ?",
      )
    )
      return;
    setErr(null);
    setIaMsg(null);
    setFixeEtat("envoi");
    try {
      await creerFixe({ data: { dossier_id: dossierId, formule_id: fixeFormuleId, option_ids: fixeOptionIds } });
      await load();
      setIaMsg(
        "Devis créé depuis le tarif fixe du produit et devoir de conseil généré en brouillon. L'envoi au client reste à déclencher manuellement.",
      );
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Génération impossible");
    } finally {
      setFixeEtat("idle");
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <h2 className="font-serif text-lg font-medium text-ink">Devis comparés</h2>
      <p className="mt-1 text-xs text-ink-muted">
        {produitFixe
          ? `Produit à tarification fixe (${produitFixe.nom}) : le devis est repris directement du tarif renseigné sur la fiche produit, sans ressaisie ni classement IA.`
          : `Saisie manuelle des devis étudiés pour ce dossier${branche ? ` (${branche})` : ""}. Ils alimentent le tableau des offres comparées du devoir de conseil.`}
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

      {produitFixe && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <h3 className="text-sm font-medium text-ink">Tarif fixe du produit</h3>
            <p className="mt-1 text-xs text-ink-muted">
              Choisissez la formule et les options souhaitées : le total est calculé automatiquement et devient la
              seule offre du dossier. Aucun classement IA n'est nécessaire.
            </p>
          </div>

          {formulesFixes.length === 0 && (
            <p className="text-sm text-ink-muted">
              Aucune formule active avec tarif fixe sur ce produit — renseignez-les sur la fiche produit.
            </p>
          )}

          {formulesFixes.length > 0 && (
            <>
              <label className="block sm:max-w-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Formule</span>
                <select value={fixeFormuleId} onChange={(e) => setFixeFormuleId(e.target.value)} className={inp}>
                  <option value="">— Choisir —</option>
                  {formulesFixes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                      {f.tarif_fixe == null ? " (tarif non renseigné)" : ` — ${eur(Number(f.tarif_fixe))}`}
                    </option>
                  ))}
                </select>
              </label>

              {optionsFixes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Options</p>
                  {optionsFixes.map((o) => (
                    <label key={o.id} className="flex items-start gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={fixeOptionIds.includes(o.id)}
                        onChange={(e) =>
                          setFixeOptionIds((l) => (e.target.checked ? [...l, o.id] : l.filter((x) => x !== o.id)))
                        }
                      />
                      <span>
                        {o.nom}
                        <span className="text-ink-soft">
                          {" "}
                          — {o.tarif_fixe == null ? "tarif non renseigné" : eur(Number(o.tarif_fixe))}
                        </span>
                        {o.description && <span className="block text-xs text-ink-muted">{o.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <p className="text-sm font-medium text-ink">
                Total calculé : <span className="text-ink-soft">{eur(totalFixe)}</span>
              </p>

              <button
                onClick={genererDepuisTarifFixe}
                disabled={!fixeFormuleId || fixeEtat !== "idle"}
                className="rounded-full bg-ink px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
              >
                {fixeEtat === "envoi" ? "Génération…" : "Créer ce devis et générer le devoir de conseil"}
              </button>
              {iaMsg && <p className="text-sm text-emerald-700">{iaMsg}</p>}
            </>
          )}
        </div>
      )}

      {!produitFixe && (
      <div className="mt-4 border-t border-line pt-4">

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-ink">Classement IA des devis</h3>
            <p className="mt-1 text-xs text-ink-muted">
              L'IA classe les devis saisis au regard du recueil des besoins et justifie chaque rang. Elle ne décide
              pas : vous retenez l'offre, ce qui génère le devoir de conseil en brouillon (aucun envoi au client).
            </p>
          </div>
          <button
            onClick={demanderClassement}
            disabled={devis.length < 2 || iaEtat !== "idle"}
            className="rounded-full border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
          >
            {iaEtat === "classement" ? "Analyse en cours…" : "Lancer le classement IA"}
          </button>
        </div>
        {devis.length < 2 && (
          <p className="mt-2 text-xs text-ink-muted">Saisissez au moins 2 devis pour activer le classement.</p>
        )}
        {iaMsg && <p className="mt-2 text-sm text-emerald-700">{iaMsg}</p>}

        {classement && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-ink-muted">
              Généré le {new Date(classement.genere_le).toLocaleString("fr-FR")}
              {classement.modele_ia ? ` · ${classement.modele_ia}` : ""}
            </p>
            {[...classement.classement]
              .sort((a, b) => a.rang - b.rang)
              .map((l) => {
                const d = devis.find((x) => x.id === l.dossier_devis_id);
                return (
                  <div
                    key={l.dossier_devis_id}
                    className="rounded-xl border border-[color:var(--crm-gold)]/40 bg-[color:var(--crm-gold)]/5 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-ink">
                        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-primary-foreground">
                          {l.rang}
                        </span>
                        {d ? `${nomCompagnie(d.compagnie_id)} — ${nomProduit(d.produit_id)}` : "Devis supprimé"}
                        {d?.formule_id && <FormuleNom formuleId={d.formule_id} />}
                        {d?.cotisation_mensuelle != null && (
                          <span className="ml-2 text-ink-soft">
                            {Number(d.cotisation_mensuelle).toLocaleString("fr-FR")} € / mois
                          </span>
                        )}
                      </p>
                      {d && (
                        <button
                          onClick={() => retenir(d.id)}
                          disabled={iaEtat !== "idle"}
                          className="rounded-full bg-ink px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-60"
                        >
                          {iaEtat === "selection" ? "Traitement…" : "Retenir cette offre"}
                        </button>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-ink-soft">{l.justification}</p>
                  </div>
                );
              })}
          </div>
        )}
      </div>
      )}

      {!produitFixe && (
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
      )}

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
