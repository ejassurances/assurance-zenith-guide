import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { creerClientManuel } from "@/lib/clients.functions";
import { lancerLcbClientsManquants } from "@/lib/lcb-ft.functions";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { MARQUES, MARQUE_KEYS, besoinLabel, marque } from "@/lib/crm-brands";
import { DeleteClientButton } from "@/components/delete-client-button";
import { niveauFromScore, type NiveauConformite } from "@/lib/conformite-score";
import { ORIGINES, origineAvecClientSource, type OrigineKey } from "@/lib/crm-origines";
import { ClientOriginePicker } from "@/components/client-origine-picker";
import { ScoreRings } from "@/components/score-rings";
import { useScoresValeur } from "@/hooks/use-scores-valeur";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { IconUsers, IconUserCheck, IconShieldCheck, IconUserPlus } from "@tabler/icons-react";



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
  marque: string;
  besoins: string[] | null;
  conformite_score: number | null;
  conformite_niveau: string | null;
  created_at: string;
  client_risque_lcbft: {
    score_risque: number;
    niveau_vigilance: "simplifiee" | "standard" | "renforcee";
  } | null;
};


const STATUTS = ["prospect", "actif", "inactif", "perdu", "ancien"] as const;

const NIVEAU_LABEL: Record<"simplifiee" | "standard" | "renforcee", string> = {
  simplifiee: "Vigilance simplifiée",
  standard: "Vigilance standard",
  renforcee: "Vigilance renforcée",
};

const NIVEAU_STYLE: Record<"simplifiee" | "standard" | "renforcee", string> = {
  simplifiee: "bg-emerald-100 text-emerald-900 border-emerald-300",
  standard: "bg-amber-100 text-amber-900 border-amber-300",
  renforcee: "bg-red-100 text-red-900 border-red-300",
};

function ClientsList() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const scoresValeur = useScoresValeur();
  const [items, setItems] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statutFilter, setStatutFilter] = useState<string>("");
  const [marqueFilter, setMarqueFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const canCreate = role === "admin" || role === "mandataire" || role === "prescripteur";
  const canDelete = role === "admin";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select(
        "id,reference,civilite,prenom,nom,email,mobile,ville,statut,origine,marque,besoins,conformite_score,conformite_niveau,created_at,client_risque_lcbft(score_risque,niveau_vigilance)",
      )
      // Les fiches techniques (compagnies, fournisseurs, adresses de service)
      // n'ont pas leur place dans la liste des clients.
      .not("etiquettes", "cs", '{"non-client"}')
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
      if (marqueFilter && c.marque !== marqueFilter) return false;
      if (!term) return true;
      const hay = `${c.reference} ${c.prenom ?? ""} ${c.nom} ${c.email ?? ""} ${c.mobile ?? ""} ${c.ville ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [items, q, statutFilter, marqueFilter]);


  const actifs = items.filter((c) => c.statut === "actif").length;
  const prospects = items.filter((c) => c.statut === "prospect").length;
  const evalues = items.filter((c) => c.client_risque_lcbft).length;

  return (
    <div>
      <PageHeader
        eyebrow="Portefeuille"
        title="Clients"
        description="Fiches clients, conformité et suivi commercial du cabinet."
        icon={IconUsers}
      >
        {canCreate && <LcbRattrapageButton onDone={load} />}
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0A192F] transition hover:brightness-95"
          >
            {showForm ? "Annuler" : "Nouveau client"}
          </button>
        )}
      </PageHeader>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total clients" value={items.length} icon={IconUsers} accent />
        <StatCard label="Clients actifs" value={actifs} icon={IconUserCheck} />
        <StatCard label="Prospects" value={prospects} icon={IconUserPlus} />
        <StatCard label="LCB-FT évalués" value={evalues} icon={IconShieldCheck} />
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

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setMarqueFilter("")}
          className={
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
            (marqueFilter === "" ? "border-transparent bg-[#0A192F] text-white" : "border-line text-ink-soft hover:bg-surface")
          }
        >
          Toutes les marques ({items.length})
        </button>
        {MARQUE_KEYS.map((k) => {
          const count = items.filter((c) => c.marque === k).length;
          const active = marqueFilter === k;
          return (
            <button
              key={k}
              onClick={() => setMarqueFilter(active ? "" : k)}
              className={
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                (active ? "border-transparent bg-[#D4AF37]/20 text-[#0A192F] ring-1 ring-[#D4AF37]" : "border-line text-ink-soft hover:bg-surface")
              }
            >
              <span className={`size-1.5 rounded-full ${MARQUES[k].dot}`} />
              {MARQUES[k].label} ({count})
            </button>
          );
        })}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface-elevated">
        {loading ? (
          <p className="p-6 text-sm text-ink-muted">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-ink-muted">Aucun client.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Marque</th>
                <th className="px-4 py-3">Besoins</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Scores</th>
                <th className="px-4 py-3">Statut</th>

                {canDelete && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const m = marque(c.marque);
                return (
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
                    <div className="text-xs text-ink-muted">{c.ville ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.badge}`}>
                      <span className={`size-1.5 rounded-full ${m.dot}`} />
                      {m.short}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.besoins ?? []).length === 0 ? (
                        <span className="text-xs text-ink-muted">—</span>
                      ) : (
                        (c.besoins ?? []).slice(0, 3).map((b) => (
                          <span key={b} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-soft">
                            {besoinLabel(b)}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    <div>{c.email ?? "—"}</div>
                    <div className="text-xs text-ink-muted">{c.mobile ?? ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ScoreRings size={48} valeur={scoresValeur[c.id] ?? 0} />
                      {c.client_risque_lcbft ? (
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${NIVEAU_STYLE[c.client_risque_lcbft.niveau_vigilance]}`}
                        >
                          {c.client_risque_lcbft.score_risque}/100 · {NIVEAU_LABEL[c.client_risque_lcbft.niveau_vigilance]}
                        </span>
                      ) : (
                        <span className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted">
                          Non évalué
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">

                    <span className="rounded-full border border-line bg-background px-2 py-0.5 text-xs">{c.statut}</span>
                  </td>
                  {canDelete && (
                    <td className="px-4 py-3 text-right">
                      <DeleteClientButton
                        variant="icon"
                        clientId={c.id}
                        clientLabel={[c.prenom, c.nom].filter(Boolean).join(" ")}
                        onDeleted={() => setItems((prev) => prev.filter((x) => x.id !== c.id))}
                      />
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NewClientForm({ onCreated }: { onCreated: (id: string) => void }) {
  const creerClient = useServerFn(creerClientManuel);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    civilite: "M.",
    prenom: "",
    nom: "",
    email: "",
    mobile: "",
    ville: "",
    origine: "internet" as OrigineKey,
    client_origine_id: null as string | null,
    marque: "ej_assurances",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    setSaving(true);
    try {
      // Passe par le server fn : insert + contrôle LCB-FT automatique.
      const res = await creerClient({
        data: {
          civilite: form.civilite,
          prenom: form.prenom || null,
          nom: form.nom,
          email: form.email || null,
          mobile: form.mobile || null,
          ville: form.ville || null,
          origine: form.origine,
          client_origine_id: origineAvecClientSource(form.origine) ? form.client_origine_id : null,
          marque: form.marque,
        },
      });
      onCreated(res.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Création impossible");
    } finally {
      setSaving(false);
    }
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
        onChange={(e) => setForm({ ...form, origine: e.target.value as OrigineKey })}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      >
        {ORIGINES.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {origineAvecClientSource(form.origine) && (
        <div className="sm:col-span-3">
          <ClientOriginePicker
            value={form.client_origine_id}
            onChange={(id) => setForm({ ...form, client_origine_id: id })}
          />
        </div>
      )}

      <select
        value={form.marque}
        onChange={(e) => setForm({ ...form, marque: e.target.value })}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:col-span-2"
      >
        {MARQUE_KEYS.map((k) => (
          <option key={k} value={k}>
            {MARQUES[k].label}
          </option>
        ))}
      </select>
      <div className="sm:col-span-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#0A192F] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Création…" : "Créer la fiche"}
        </button>
      </div>
    </form>
  );
}

/** Rattrapage du contrôle LCB-FT (sanctions / PPE) sur les fiches non contrôlées. */
function LcbRattrapageButton({ onDone }: { onDone: () => void }) {
  const lancer = useServerFn(lancerLcbClientsManquants);
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await lancer({});
          if (res.traites === 0) toast.success("Toutes les fiches ont déjà un contrôle LCB-FT.");
          else
            toast.success(
              `LCB-FT : ${res.traites} fiche(s) contrôlée(s)${res.a_verifier > 0 ? ` · ${res.a_verifier} à vérifier` : ""}.`,
            );
          if (res.erreurs.length > 0) toast.error(res.erreurs.slice(0, 3).join(" · "));
          onDone();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Contrôle LCB-FT impossible");
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
    >
      {busy ? "Contrôle en cours…" : "Contrôle LCB-FT manquant"}
    </button>
  );
}
