import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { estimerEconomie } from "@/lib/insurance-rates";
import {
  BRANCHES,
  getBranche,
  labelForBranche,
  type BrancheAssurance,
  type FieldConfig,
} from "@/lib/recueil-besoins-schemas";

export const Route = createFileRoute("/_authenticated/espace/dossiers/")({
  component: DossiersList,
});

type Dossier = {
  id: string;
  reference: string;
  client_nom: string;
  statut: string;
  type_assurance: string;
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
      .select("id,reference,client_nom,statut,type_assurance,capital,duree_mois,economie_estimee,created_at")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Dossier[]);
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
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Capital / valeur</th>
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
                  <td className="px-4 py-3 text-xs text-ink-muted">{labelForBranche(d.type_assurance)}</td>
                  <td className="px-4 py-3">
                    <StatutBadge s={d.statut} />
                  </td>
                  <td className="px-4 py-3">{d.capital ? `${Number(d.capital).toLocaleString("fr-FR")} €` : "—"}</td>
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

type ClientOption = {
  id: string;
  prenom: string | null;
  nom: string;
  email: string | null;
  mobile: string | null;
  telephone: string | null;
  fumeur: boolean | null;
};

export function NewDossierForm({
  onCreated,
  userId,
  presetClient,
}: {
  onCreated: () => void;
  userId: string;
  presetClient?: ClientOption;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<BrancheAssurance>("emprunteur");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState<string>(presetClient?.id ?? "");
  const [clientQuery, setClientQuery] = useState("");
  const [clientNom, setClientNom] = useState(
    presetClient ? [presetClient.prenom, presetClient.nom].filter(Boolean).join(" ") : "",
  );
  const [clientEmail, setClientEmail] = useState(presetClient?.email ?? "");
  const [clientPhone, setClientPhone] = useState(presetClient?.mobile ?? presetClient?.telephone ?? "");
  const [recueil, setRecueil] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id,prenom,nom,email,mobile,telephone,fumeur")
        .order("created_at", { ascending: false })
        .limit(500);
      setClients((data ?? []) as ClientOption[]);
    })();
  }, []);

  const filteredClients = useMemo(() => {
    const t = clientQuery.trim().toLowerCase();
    if (!t) return clients.slice(0, 50);
    return clients.filter((c) => `${c.prenom ?? ""} ${c.nom} ${c.email ?? ""}`.toLowerCase().includes(t)).slice(0, 50);
  }, [clients, clientQuery]);

  const selectClient = (c: ClientOption) => {
    setClientId(c.id);
    setClientNom([c.prenom, c.nom].filter(Boolean).join(" ") || c.nom);
    setClientEmail(c.email ?? "");
    setClientPhone(c.mobile ?? c.telephone ?? "");
    if (type === "emprunteur") setRecueil((r) => ({ ...r, fumeur: !!c.fumeur }));
  };

  const branche = getBranche(type)!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientNom.trim()) {
      setError("Sélectionnez un client ou saisissez un nom.");
      return;
    }
    setSaving(true);
    setError(null);

    // Champs de compat pour emprunteur (pour garder les colonnes existantes utiles)
    let capital: number | null = null;
    let duree_mois: number | null = null;
    let age: number | null = null;
    let fumeur = false;
    let economie: number | null = null;
    if (type === "emprunteur") {
      capital = Number(recueil.capital) || null;
      duree_mois = Number(recueil.duree_mois) || null;
      age = Number(recueil.age) || null;
      fumeur = !!recueil.fumeur;
      if (capital && duree_mois && age) {
        try {
          const est = estimerEconomie({ capital, dureeMois: duree_mois, age, fumeur });
          economie = Math.round(est.economieTotale);
        } catch {
          // pas de tranche
        }
      }
    }

    const { error: insErr } = await supabase.from("dossiers").insert({
      client_id: clientId || null,
      client_nom: clientNom,
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      type_assurance: type,
      recueil_besoins: recueil as never,
      capital,
      duree_mois,
      age,
      fumeur,
      notes: notes || null,
      economie_estimee: economie,
      apporteur_id: userId,
      created_by: userId,
    });
    setSaving(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    onCreated();
  };

  if (step === 1) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-surface-elevated p-6">
        <h2 className="font-serif text-lg">Étape 1 · Type d'assurance</h2>
        <p className="mt-1 text-sm text-ink-muted">Choisissez la branche concernée pour ce dossier.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BRANCHES.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setType(b.value)}
              className={`rounded-2xl border p-4 text-left transition ${
                type === b.value ? "border-ink bg-background" : "border-line bg-background/40 hover:border-ink/40"
              }`}
            >
              <p className="font-medium text-ink">{b.label}</p>
              <p className="mt-1 text-xs text-ink-muted">{b.description}</p>
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setStep(2)}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-primary-foreground"
          >
            Continuer → Recueil des besoins
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-6 rounded-2xl border border-line bg-surface-elevated p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg">Étape 2 · Recueil des besoins</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {branche.label} — {branche.description}
          </p>
        </div>
        <button type="button" onClick={() => setStep(1)} className="text-xs text-ink-muted underline">
          ← Changer de branche
        </button>
      </div>

      {!presetClient && (
        <div className="rounded-xl border border-line bg-background/40 p-4">
          <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Client existant</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              placeholder="Rechercher (nom, prénom, email)…"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              className="flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
            <select
              value={clientId}
              onChange={(e) => {
                const c = clients.find((x) => x.id === e.target.value);
                if (c) selectClient(c);
                else setClientId("");
              }}
              className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:w-72"
            >
              <option value="">— Sélectionner un client —</option>
              {filteredClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.prenom, c.nom].filter(Boolean).join(" ")}
                  {c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <TextInput label="Nom du client" value={clientNom} onChange={setClientNom} />
            <TextInput label="Email" value={clientEmail} onChange={setClientEmail} type="email" />
            <TextInput label="Téléphone" value={clientPhone} onChange={setClientPhone} />
          </div>
        </div>
      )}
      {presetClient && `Client : ${[presetClient.prenom, presetClient.nom].filter(Boolean).join(" ")}`}

      {branche.sections.map((section) => (
        <div key={section.title}>
          <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">{section.title}</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {section.fields.map((f) => (
              <RecueilField
                key={f.key}
                field={f}
                value={recueil[f.key]}
                onChange={(v) => setRecueil({ ...recueil, [f.key]: v })}
              />
            ))}
          </div>
        </div>
      ))}

      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Notes internes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
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

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </label>
  );
}

export function RecueilField({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const cls = "mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink";
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="block sm:col-span-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{field.label}</span>
        <textarea
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cls}
        />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{field.label}</span>
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {field.label}
        {field.suffix ? ` (${field.suffix})` : ""}
      </span>
      <input
        type={field.type === "number" ? "number" : "text"}
        value={(value as string | number | undefined) ?? ""}
        onChange={(e) =>
          onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
        }
        placeholder={field.placeholder}
        className={cls}
      />
    </label>
  );
}
