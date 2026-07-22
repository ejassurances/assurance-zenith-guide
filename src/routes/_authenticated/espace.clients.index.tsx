import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/espace/clients/")({
  component: ClientsList,
});

type ClientRow = {
  id: string;
  reference: string;
  civilite: string | null;
  prenom: string | null;
  nom: string;
  email: string | null;
  mobile: string | null;
  ville: string | null;
  statut: string;
  origine: string | null;
  created_at: string;
};

const STATUTS = ["prospect", "actif", "inactif", "perdu", "ancien"] as const;

function ClientsList() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statutFilter, setStatutFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const canCreate = role === "admin" || role === "mandataire" || role === "prescripteur";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("id,reference,civilite,prenom,nom,email,mobile,ville,statut,origine,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setItems((data ?? []) as ClientRow[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((c) => {
      if (statutFilter && c.statut !== statutFilter) return false;
      if (!term) return true;
      const hay = `${c.reference} ${c.prenom ?? ""} ${c.nom} ${c.email ?? ""} ${c.mobile ?? ""} ${c.ville ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [items, q, statutFilter]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-ink">Clients</h1>
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {showForm ? "Annuler" : "Nouveau client"}
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <NewClientForm
          onCreated={(id) => {
            setShowForm(false);
            navigate({ to: "/espace/clients/$id", params: { id } });
          }}
        />
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher nom, email, ville, référence…"
          className="flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
        <select
          value={statutFilter}
          onChange={(e) => setStatutFilter(e.target.value)}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        >
          <option value="">Tous statuts</option>
          {STATUTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface-elevated">
        {loading ? (
          <p className="p-6 text-sm text-ink-muted">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-ink-muted">Aucun client.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Ville</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Origine</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-background/40">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link to="/espace/clients/$id" params={{ id: c.id }} className="text-ink hover:underline">
                      {c.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/espace/clients/$id" params={{ id: c.id }} className="font-medium text-ink hover:underline">
                      {[c.civilite, c.prenom, c.nom].filter(Boolean).join(" ")}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    <div>{c.email ?? "—"}</div>
                    <div className="text-xs text-ink-muted">{c.mobile ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{c.ville ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-line bg-background px-2 py-0.5 text-xs">{c.statut}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{c.origine ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewClientForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    civilite: "M.",
    prenom: "",
    nom: "",
    email: "",
    mobile: "",
    ville: "",
    origine: "internet" as const,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("clients")
      .insert({
        civilite: form.civilite,
        prenom: form.prenom || null,
        nom: form.nom,
        email: form.email || null,
        mobile: form.mobile || null,
        ville: form.ville || null,
        origine: form.origine,
      })
      .select("id")
      .single();
    setSaving(false);
    if (!error && data) onCreated(data.id);
  };

  return (
    <form onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl border border-line bg-surface-elevated p-5 sm:grid-cols-3">
      <select
        value={form.civilite}
        onChange={(e) => setForm({ ...form, civilite: e.target.value })}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      >
        <option>M.</option>
        <option>Mme</option>
        <option>Autre</option>
      </select>
      <input
        placeholder="Prénom"
        value={form.prenom}
        onChange={(e) => setForm({ ...form, prenom: e.target.value })}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
      <input
        required
        placeholder="Nom *"
        value={form.nom}
        onChange={(e) => setForm({ ...form, nom: e.target.value })}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
      <input
        type="email"
        placeholder="Email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
      <input
        placeholder="Mobile"
        value={form.mobile}
        onChange={(e) => setForm({ ...form, mobile: e.target.value })}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
      <input
        placeholder="Ville"
        value={form.ville}
        onChange={(e) => setForm({ ...form, ville: e.target.value })}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
      <select
        value={form.origine}
        onChange={(e) => setForm({ ...form, origine: e.target.value as typeof form.origine })}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      >
        <option value="internet">Internet</option>
        <option value="assurlead">Assurlead</option>
        <option value="telephone">Téléphone</option>
        <option value="apporteur">Apporteur</option>
        <option value="reseau">Réseau</option>
        <option value="autre">Autre</option>
      </select>
      <div className="sm:col-span-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Création…" : "Créer la fiche"}
        </button>
      </div>
    </form>
  );
}
