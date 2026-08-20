import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { creerRecommandation } from "@/lib/prescripteurs.functions";

export const Route = createFileRoute("/_authenticated/espace/mes-recommandations")({
  component: MesRecommandationsPage,
});

type Reco = {
  id: string;
  nom_contact: string;
  description: string | null;
  statut: string;
  montant_du: number;
  verse: boolean;
  verse_le: string | null;
  created_at: string;
};

const STATUT_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  dossier_valide: "Dossier validé",
  sans_suite: "Sans suite",
};

const dateFr = (v: string | null) => (v ? new Date(v).toLocaleDateString("fr-FR") : "—");

function MesRecommandationsPage() {
  const envoyer = useServerFn(creerRecommandation);
  const [items, setItems] = useState<Reco[]>([]);
  const [presc, setPresc] = useState<{ nom: string; prenom: string | null; statut: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("prescripteurs").select("nom,prenom,statut").maybeSingle(),
      supabase
        .from("recommandations_prescripteur")
        .select("id,nom_contact,description,statut,montant_du,verse,verse_le,created_at")
        .order("created_at", { ascending: false }),
    ]);
    setPresc((p ?? null) as unknown as { nom: string; prenom: string | null; statut: string } | null);
    setItems((r ?? []) as unknown as Reco[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setMsg(null);
    try {
      const res = await envoyer({
        data: {
          nom_contact: String(fd.get("nom_contact") ?? ""),
          description: String(fd.get("description") ?? ""),
        },
      });
      if (res.ok) {
        setMsg({ type: "ok", text: "Recommandation transmise au cabinet." });
        form.reset();
        await load();
      } else {
        setMsg({ type: "err", text: res.error });
      }
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Erreur inattendue" });
    }
    setBusy(false);
  };

  const totalDu = items
    .filter((r) => r.statut === "dossier_valide" && !r.verse)
    .reduce((s, r) => s + Number(r.montant_du ?? 0), 0);
  const totalVerse = items.filter((r) => r.verse).reduce((s, r) => s + Number(r.montant_du ?? 0), 0);

  const champ = "mt-1 w-full rounded-sm border border-line bg-surface-elevated px-3 py-2 text-sm text-ink";

  return (
    <div>
      <header>
        <p className="crm-eyebrow">Espace prescripteur</p>
        <h1 className="font-serif text-2xl font-medium text-ink">Mes recommandations</h1>
        {presc && (
          <p className="mt-1 text-xs text-ink-muted">
            {`${presc.prenom ?? ""} ${presc.nom}`.trim()} — compte{" "}
            {presc.statut === "actif" ? "actif" : presc.statut === "inactif" ? "inactif" : "en attente de validation"}
          </p>
        )}
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { l: "Recommandations", v: String(items.length) },
          { l: "Dû non versé", v: `${totalDu.toFixed(0)} €` },
          { l: "Déjà versé", v: `${totalVerse.toFixed(0)} €` },
        ].map((k) => (
          <div key={k.l} className="rounded-sm border border-line bg-surface-elevated p-4">
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">{k.l}</p>
            <p className="mt-1 text-xl font-medium text-ink">{k.v}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-sm border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">Nouvelle recommandation</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          Rappel : votre rôle se limite à la mise en relation. Aucun conseil, aucune présentation de produit, aucune
          négociation. 200 € vous sont dus par dossier validé par le cabinet.
        </p>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
            Nom du contact *
            <input name="nom_contact" required maxLength={150} className={champ} />
          </label>
          <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
            Description
            <textarea
              name="description"
              rows={4}
              maxLength={4000}
              placeholder="Contexte de la mise en relation, coordonnées transmises avec l'accord du contact, disponibilités…"
              className={champ}
            />
          </label>
          {msg && (
            <p className={`text-xs ${msg.type === "ok" ? "text-ink-muted" : "text-destructive"}`}>{msg.text}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full border border-line bg-surface-elevated px-5 py-2 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            {busy ? "Envoi…" : "Transmettre au cabinet"}
          </button>
        </form>
      </section>

      <div className="mt-6 overflow-x-auto rounded-sm border border-line">
        <table className="min-w-full text-sm">
          <thead className="bg-surface text-left text-[10px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Envoyée le</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Rémunération</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-3 py-2 text-ink">
                  {r.nom_contact}
                  {r.description && (
                    <span className="mt-1 block max-w-md whitespace-pre-wrap text-[11px] text-ink-muted">
                      {r.description}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-soft">{dateFr(r.created_at)}</td>
                <td className="px-3 py-2 text-ink-soft">{STATUT_LABEL[r.statut] ?? r.statut}</td>
                <td className="px-3 py-2 text-ink-soft">
                  {r.statut === "dossier_valide"
                    ? r.verse
                      ? `${Number(r.montant_du).toFixed(0)} € versés le ${dateFr(r.verse_le)}`
                      : `${Number(r.montant_du).toFixed(0)} € dus`
                    : "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-ink-muted">
                  Aucune recommandation envoyée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
