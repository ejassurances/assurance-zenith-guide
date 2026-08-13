import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CommissionBaremeConfig } from "@/components/commission-bareme-config";

export const Route = createFileRoute("/_authenticated/espace/commissions")({
  component: CommissionsPage,
});

type Row = {
  id: string;
  montant: number;
  statut: "prevue" | "versee" | "annulee";
  date_versement: string | null;
  notes: string | null;
  dossier_id: string;
  beneficiaire_id: string;
  dossiers: { reference: string; client_nom: string } | null;
};

function CommissionsPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("commissions")
      .select("id,montant,statut,date_versement,notes,dossier_id,beneficiaire_id,dossiers(reference,client_nom)")
      .order("created_at", { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const total = rows.reduce((s, r) => s + Number(r.montant), 0);
  const verse = rows.filter((r) => r.statut === "versee").reduce((s, r) => s + Number(r.montant), 0);
  const attente = rows.filter((r) => r.statut === "prevue").reduce((s, r) => s + Number(r.montant), 0);

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium text-ink">Commissions</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card label="Total" value={total} />
        <Card label="Versées" value={verse} />
        <Card label="À venir" value={attente} />
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface-elevated">
        {loading ? (
          <p className="p-6 text-sm text-ink-muted">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-ink-muted">
            {role === "admin"
              ? "Aucune commission enregistrée. Créez-en depuis un dossier."
              : "Aucune commission attribuée pour l'instant."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Dossier</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Versement</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    {r.dossiers ? `${r.dossiers.reference} — ${r.dossiers.client_nom}` : r.dossier_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">{Number(r.montant).toLocaleString("fr-FR")} €</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                        (r.statut === "versee"
                          ? "bg-emerald-100 text-emerald-900"
                          : r.statut === "annulee"
                            ? "bg-red-100 text-red-900"
                            : "bg-amber-100 text-amber-900")
                      }
                    >
                      {r.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.date_versement ? new Date(r.date_versement).toLocaleDateString("fr-FR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {role === "admin" && <AddCommissionForm onCreated={load} />}
      {role === "admin" && <CommissionBaremeConfig />}
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 font-serif text-2xl font-medium text-ink">{value.toLocaleString("fr-FR")} €</p>
    </div>
  );
}

function AddCommissionForm({ onCreated }: { onCreated: () => void }) {
  const [dossiers, setDossiers] = useState<{ id: string; reference: string; client_nom: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [dossier, setDossier] = useState("");
  const [beneficiaire, setBeneficiaire] = useState("");
  const [montant, setMontant] = useState("");
  const [statut, setStatut] = useState<"prevue" | "versee">("prevue");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([
        supabase.from("dossiers").select("id,reference,client_nom"),
        supabase.from("profiles").select("id,full_name,email"),
      ]);
      setDossiers(d.data ?? []);
      setProfiles(p.data ?? []);
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("commissions").insert({
      dossier_id: dossier,
      beneficiaire_id: beneficiaire,
      montant: Number(montant),
      statut,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMontant("");
    onCreated();
  };

  return (
    <form
      onSubmit={submit}
      className="mt-8 grid gap-3 rounded-2xl border border-line bg-surface-elevated p-6 sm:grid-cols-4"
    >
      <select
        required
        value={dossier}
        onChange={(e) => setDossier(e.target.value)}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      >
        <option value="">Dossier…</option>
        {dossiers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.reference} — {d.client_nom}
          </option>
        ))}
      </select>
      <select
        required
        value={beneficiaire}
        onChange={(e) => setBeneficiaire(e.target.value)}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      >
        <option value="">Bénéficiaire…</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name ?? p.email ?? p.id.slice(0, 8)}
          </option>
        ))}
      </select>
      <input
        required
        type="number"
        min="0"
        step="0.01"
        placeholder="Montant"
        value={montant}
        onChange={(e) => setMontant(e.target.value)}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
      <select
        value={statut}
        onChange={(e) => setStatut(e.target.value as "prevue" | "versee")}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      >
        <option value="prevue">Prévue</option>
        <option value="versee">Versée</option>
      </select>
      <div className="sm:col-span-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Ajout…" : "Ajouter la commission"}
        </button>
        {error && <span className="ml-3 text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
