import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { estimerEconomie } from "@/lib/insurance-rates";

export const Route = createFileRoute("/_authenticated/espace/dossiers/")({
  component: DossiersList,
});

type Dossier = {
  id: string;
  reference: string;
  client_nom: string;
  statut: string;
  capital: number | null;
  duree_mois: number | null;
  economie_estimee: number | null;
  created_at: string;
};

function DossiersList() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const canCreate = role === "admin" || role === "mandataire" || role === "prescripteur";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dossiers")
      .select("id,reference,client_nom,statut,capital,duree_mois,economie_estimee,created_at")
      .order("created_at", { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-medium text-ink">Dossiers</h1>
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {showForm ? "Annuler" : "Nouveau dossier"}
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <NewDossierForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
          userId={user!.id}
        />
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface-elevated">
        {loading ? (
          <p className="p-6 text-sm text-ink-muted">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-ink-muted">Aucun dossier pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Capital</th>
                <th className="px-4 py-3">Économie</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-background/50">
                  <td className="px-4 py-3">
                    <Link to="/espace/dossiers/$id" params={{ id: d.id }} className="font-medium hover:underline">
                      {d.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{d.client_nom}</td>
                  <td className="px-4 py-3">
                    <StatutBadge s={d.statut} />
                  </td>
                  <td className="px-4 py-3">{d.capital ? `${Number(d.capital).toLocaleString("fr-FR")} €` : "—"}</td>
                  <td className="px-4 py-3">
                    {d.economie_estimee ? `${Number(d.economie_estimee).toLocaleString("fr-FR")} €` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatutBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    nouveau: "bg-surface text-ink-soft",
    en_cours: "bg-amber-100 text-amber-900",
    signe: "bg-emerald-100 text-emerald-900",
    perdu: "bg-red-100 text-red-900",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[s] ?? "bg-surface"}`}>
      {s.replace("_", " ")}
    </span>
  );
}

function NewDossierForm({ onCreated, userId }: { onCreated: () => void; userId: string }) {
  const [form, setForm] = useState({
    client_nom: "",
    client_email: "",
    client_phone: "",
    capital: "",
    duree_mois: "",
    age: "",
    fumeur: false,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const capital = Number(form.capital) || 0;
    const duree_mois = Number(form.duree_mois) || 0;
    const age = Number(form.age) || 0;
    let economie = 0;
    if (capital && duree_mois && age) {
      try {
        const est = estimerEconomie({ capital, dureeMois: duree_mois, age, fumeur: form.fumeur });
        economie = Math.round(est.economieTotale);
      } catch {
        // pas de tranche → laisse 0
      }
    }
    const { error } = await supabase.from("dossiers").insert({
      client_nom: form.client_nom,
      client_email: form.client_email || null,
      client_phone: form.client_phone || null,
      capital: capital || null,
      duree_mois: duree_mois || null,
      age: age || null,
      fumeur: form.fumeur,
      notes: form.notes || null,
      economie_estimee: economie || null,
      apporteur_id: userId,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onCreated();
  };

  const Field = (label: string, key: keyof typeof form, type = "text") => (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="mt-4 grid gap-4 rounded-2xl border border-line bg-surface-elevated p-6 sm:grid-cols-2">
      {Field("Nom du client", "client_nom")}
      {Field("Email", "client_email", "email")}
      {Field("Téléphone", "client_phone")}
      {Field("Capital emprunté (€)", "capital", "number")}
      {Field("Durée (mois)", "duree_mois", "number")}
      {Field("Âge", "age", "number")}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.fumeur} onChange={(e) => setForm({ ...form, fumeur: e.target.checked })} />
        Fumeur
      </label>
      <div className="sm:col-span-2">
        <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={3}
          className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
      {error && <p className="sm:col-span-2 text-sm text-destructive">{error}</p>}
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "Créer le dossier"}
        </button>
      </div>
    </form>
  );
}
