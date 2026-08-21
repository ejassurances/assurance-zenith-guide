import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { declencherLettreMissionAuto } from "@/lib/lettres-mission.functions";
import { useAuth } from "@/lib/auth-context";
import { estimerEconomie } from "@/lib/insurance-rates";
import { CompagnieProduitPicker } from "@/components/compagnie-produit-picker";
import { ProduitDocumentsLink } from "@/components/produit-documents-link";
import { RecueilWorkflow } from "@/components/recueil-workflow";
import {
  BRANCHES_CREATION,
  getBranche,
  labelForBranche,
  assuresEmprunteur,
  assurePrincipalEmprunteur,
  ageDepuisDateNaissance,
  type BrancheAssurance,
  type FieldConfig,
} from "@/lib/recueil-besoins-schemas";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { IconFolders, IconClockHour4, IconCircleCheck, IconAlertTriangle } from "@tabler/icons-react";

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

  const enCours = items.filter((d) => d.statut === "en_cours").length;
  const signes = items.filter((d) => d.statut === "signe").length;
  const perdus = items.filter((d) => d.statut === "perdu").length;

  return (
    <div>
      <PageHeader
        eyebrow="Activité commerciale"
        title="Dossiers"
        description="Suivi des dossiers de souscription, de leur recueil à la signature."
        icon={IconFolders}
      >
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0A192F] transition hover:brightness-95"
          >
            {showForm ? "Annuler" : "Nouveau dossier"}
          </button>
        )}
      </PageHeader>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total dossiers" value={items.length} icon={IconFolders} accent />
        <StatCard label="En cours" value={enCours} icon={IconClockHour4} />
        <StatCard label="Signés" value={signes} icon={IconCircleCheck} />
        <StatCard label="Perdus" value={perdus} icon={IconAlertTriangle} />
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
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Prime d'assurances</th>
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
          </div>
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
  const [compagnieId, setCompagnieId] = useState<string | null>(null);
  const [produitId, setProduitId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lancerLettreMission = useServerFn(declencherLettreMissionAuto);

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
    if (type === "emprunteur") {
      // Préremplissage du statut fumeur sur l'assuré principal de la liste.
      setRecueil((r) => {
        const list = assuresEmprunteur(r["assures"]);
        const rows = list.length > 0 ? list : [{ lien: "principal", date_naissance: "", quotite_pct: null, csp: "", fumeur: false }];
        return { ...r, assures: rows.map((p, i) => (i === 0 ? { ...p, fumeur: !!c.fumeur } : p)) };
      });
    }
  };

  const branche = getBranche(type)!;

  const submit = async () => {
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
      // Assuré principal de la liste « assures » : base de l'estimation d'économie.
      const principal = assurePrincipalEmprunteur(recueil["assures"]);
      age = principal ? ageDepuisDateNaissance(principal.date_naissance) : null;
      fumeur = principal?.fumeur === true;
      if (capital && duree_mois && age) {
        try {
          const est = estimerEconomie({ capital, dureeMois: duree_mois, age, fumeur });
          economie = Math.round(est.economieTotale);
        } catch {
          // pas de tranche
        }
      }
    }

    const { data: created, error: insErr } = await supabase.from("dossiers").insert({
      client_id: clientId || null,
      client_nom: clientNom,
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      type_assurance: type,
      compagnie_id: compagnieId,
      produit_id: produitId,
      recueil_besoins: recueil as never,
      capital,
      duree_mois,
      age,
      fumeur,
      notes: notes || null,
      economie_estimee: economie,
      apporteur_id: userId,
      created_by: userId,
    }).select("id").single();
    if (insErr || !created) {
      setSaving(false);
      setError(insErr?.message ?? "Erreur de création");
      return;
    }

    // Recueil validé → lettre de mission générée et envoyée automatiquement
    const res = await lancerLettreMission({ data: { dossier_id: created.id } });
    setSaving(false);
    if (!res.ok && res.raison) setError(res.raison);
    onCreated();
  };

  if (step === 1) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-surface-elevated p-6">
        <h2 className="font-serif text-lg">Étape 1 · Type d'assurance</h2>
        <p className="mt-1 text-sm text-ink-muted">Choisissez la branche concernée pour ce dossier.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BRANCHES_CREATION.map((b) => (
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
            className="rounded-full bg-[#0A192F] px-5 py-2 text-sm font-medium text-white"
          >
            Continuer → Recueil des besoins
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <RecueilWorkflow
        branche={branche}
        values={recueil}
        onChange={setRecueil}
        onBack={() => setStep(1)}
        onComplete={() => submit()}
        completeLabel={saving ? "Enregistrement…" : "Créer le dossier"}
      >
        <div className="space-y-6">
          {!presetClient ? (
            <div className="rounded-xl border border-line bg-background/40 p-4">
              <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Client</label>
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
          ) : (
            <p className="text-sm text-ink-muted">
              Client : {[presetClient.prenom, presetClient.nom].filter(Boolean).join(" ")}
            </p>
          )}

          <div className="rounded-xl border border-line bg-background/40 p-4">
            <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
              Compagnie et produit (optionnel)
            </h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <CompagnieProduitPicker
                branche={type}
                compagnieId={compagnieId}
                produitId={produitId}
                onChange={(sel) => {
                  setCompagnieId(sel.compagnie_id);
                  setProduitId(sel.produit_id);
                }}
              />
            </div>
            <div className="mt-3">
              <ProduitDocumentsLink produitId={produitId} compagnieId={compagnieId} />
            </div>
          </div>

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
        </div>
      </RecueilWorkflow>
    </div>
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
