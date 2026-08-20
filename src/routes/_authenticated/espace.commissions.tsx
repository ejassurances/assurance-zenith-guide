import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CommissionBaremeConfig } from "@/components/commission-bareme-config";
import { BulletinCommissionsPanel } from "@/components/bulletin-commissions-panel";
import { getSyntheseAnneeCommissions } from "@/lib/dashboard.functions";
import type { SyntheseAnnee } from "@/lib/commission-previsions";

export const Route = createFileRoute("/_authenticated/espace/commissions")({
  component: CommissionsPage,
});

type Row = {
  id: string;
  montant: number;
  statut: "prevue" | "versee" | "annulee";
  date_versement: string | null;
  notes: string | null;
  dossier_id: string | null;
  contrat_id: string | null;
  beneficiaire_id: string;
  ecriture_id: string | null;
  compte_produit: string | null;
  dossiers: { reference: string; client_nom: string } | null;
};

type Compte = { numero: string; libelle: string };
type Exercice = { id: string; date_debut: string; date_fin: string };

const COMPTE_BANQUE = "512000";

function CommissionsPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [loading, setLoading] = useState(true);
  const [synthese, setSynthese] = useState<SyntheseAnnee | null>(null);
  const fetchSynthese = useServerFn(getSyntheseAnneeCommissions);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("commissions")
      .select(
        "id,montant,statut,date_versement,notes,dossier_id,contrat_id,beneficiaire_id,ecriture_id,compte_produit,dossiers(reference,client_nom)",
      )
      .order("created_at", { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    (async () => {
      const [c, e] = await Promise.all([
        supabase.from("plan_comptable").select("numero,libelle").like("numero", "7%").order("numero"),
        supabase.from("exercices").select("id,date_debut,date_fin").order("date_debut", { ascending: false }),
      ]);
      setComptes((c.data as Compte[]) ?? []);
      setExercices((e.data as Exercice[]) ?? []);
    })();
    fetchSynthese().then(setSynthese).catch(() => setSynthese(null));
  }, [fetchSynthese]);

  const total = rows.reduce((s, r) => s + Number(r.montant), 0);
  const verse = rows.filter((r) => r.statut === "versee").reduce((s, r) => s + Number(r.montant), 0);
  const attente = rows.filter((r) => r.statut === "prevue").reduce((s, r) => s + Number(r.montant), 0);
  const aComptabiliser = rows.filter((r) => r.statut === "versee" && !r.ecriture_id).length;

  const majCompte = async (r: Row, compte: string) => {
    await supabase.from("commissions").update({ compte_produit: compte }).eq("id", r.id);
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, compte_produit: compte } : x)));
  };

  /* Comptabilisation d'une commission encaissée : journal Ventes, banque au débit. */
  const comptabiliser = async (r: Row) => {
    if (r.ecriture_id) return;
    const date = r.date_versement ?? new Date().toISOString().slice(0, 10);
    const exercice = exercices.find((e) => date >= e.date_debut && date <= e.date_fin) ?? exercices[0];
    if (!exercice) return toast.error("Aucun exercice comptable disponible pour cette date.");
    const libelle = `Commission ${r.dossiers ? `${r.dossiers.reference} — ${r.dossiers.client_nom}` : (r.notes ?? "").slice(0, 80) || "encaissée"}`;
    const { data: ec, error: eErr } = await supabase
      .from("ecritures")
      .insert({
        exercice_id: exercice.id,
        journal_code: "VE",
        date_ecriture: date,
        libelle: libelle.slice(0, 200),
        statut: "brouillon",
        source: "commission",
      })
      .select("id")
      .single();
    if (eErr || !ec) return toast.error(eErr?.message ?? "Création de l'écriture impossible.");

    const montant = Number(r.montant);
    const { error: lErr } = await supabase.from("ecritures_lignes").insert([
      { ecriture_id: ec.id, numero_ligne: 1, compte_numero: COMPTE_BANQUE, libelle: "Encaissement commission", debit: montant, credit: 0 },
      {
        ecriture_id: ec.id,
        numero_ligne: 2,
        compte_numero: r.compte_produit ?? "706100",
        libelle: libelle.slice(0, 200),
        debit: 0,
        credit: montant,
      },
    ]);
    if (lErr) return toast.error(lErr.message);
    const { error: vErr } = await supabase.from("ecritures").update({ statut: "valide" }).eq("id", ec.id);
    if (vErr) return toast.error(vErr.message);
    await supabase.from("commissions").update({ ecriture_id: ec.id }).eq("id", r.id);
    toast.success("Commission comptabilisée (journal Ventes).");
    load();
  };

  const comptabiliserTout = async () => {
    const cibles = rows.filter((r) => r.statut === "versee" && !r.ecriture_id);
    for (const r of cibles) await comptabiliser(r);
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium text-ink">Commissions</h1>

      {synthese && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card label={`Encaissé ${synthese.annee}`} value={synthese.encaisse} />
          <Card label={`Reste à encaisser ${synthese.annee}`} value={synthese.previsionnelRestant} />
          <Card label={`Total attendu ${synthese.annee}`} value={synthese.totalAttendu} />
        </div>
      )}

      <p className="mt-6 crm-eyebrow">Toutes périodes confondues</p>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        <Card label="Total enregistré" value={total} />
        <Card label="Versées" value={verse} />
        <Card label="À venir (bordereaux)" value={attente} />
      </div>

      {role === "admin" && aComptabiliser > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated p-4">
          <p className="text-sm text-ink-muted">
            {aComptabiliser} commission(s) versée(s) ne sont pas encore passées en comptabilité.
          </p>
          <button
            type="button"
            onClick={comptabiliserTout}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Tout comptabiliser
          </button>
        </div>
      )}

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
          <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Origine</th>
                <th className="px-4 py-3">Montant</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Versement</th>
                {role === "admin" && <th className="px-4 py-3">Comptabilité</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    {r.dossiers
                      ? `${r.dossiers.reference} — ${r.dossiers.client_nom}`
                      : (r.notes ?? "").trim() || (r.contrat_id ? `Contrat ${r.contrat_id.slice(0, 8)}` : "Bulletin de commissions")}
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
                  {role === "admin" && (
                    <td className="px-4 py-3">
                      {r.ecriture_id ? (
                        <span className="text-xs text-emerald-700">Comptabilisée</span>
                      ) : r.statut !== "versee" ? (
                        <span className="text-xs text-ink-muted">À encaisser</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={r.compte_produit ?? "706100"}
                            onChange={(e) => majCompte(r, e.target.value)}
                            className="rounded-md border border-line bg-background px-2 py-1 text-xs"
                          >
                            {comptes.map((c) => (
                              <option key={c.numero} value={c.numero}>
                                {c.numero} — {c.libelle}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => comptabiliser(r)}
                            className="rounded-md border border-line px-3 py-1 text-xs"
                          >
                            Comptabiliser
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {role !== "client" && <BordereauxPanel />}

      {role === "admin" && <BulletinCommissionsPanel onCommissionsCreees={load} />}
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
