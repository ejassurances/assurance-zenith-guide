/**
 * Diagnostic contrats & finance — vue de contrôle (lecture seule).
 * Pour chaque contrat : complétude des données, état du devis retenu et
 * raccordement au module finance (commissions comptabilisées). Plus des KPI
 * globaux (devis, bordereaux, équilibre comptable).
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { IconStethoscope } from "@tabler/icons-react";

import { PageHeader } from "@/components/page-header";
import { diagnosticPortefeuilleFn } from "@/lib/diagnostic-portefeuille.functions";
import type { ContratDiag, DiagnosticPortefeuille, VerdictContrat } from "@/lib/diagnostic-portefeuille.server";

export const Route = createFileRoute("/_authenticated/espace/diagnostic")({
  head: () => ({
    meta: [{ title: "Diagnostic contrats & finance — EJ Partners Assurances" }],
  }),
  component: DiagnosticPage,
});

const VERDICT: Record<VerdictContrat, { dot: string; label: string; cls: string }> = {
  ok: { dot: "🟢", label: "Complet & raccordé", cls: "bg-emerald-50 text-emerald-700" },
  finance_absente: { dot: "🟡", label: "Finance non générée", cls: "bg-amber-50 text-amber-800" },
  incomplet: { dot: "🔴", label: "Données incomplètes", cls: "bg-red-50 text-red-700" },
};

function euro(n: number | null): string {
  return n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

function Kpi({ label, value, hint, alert }: { label: string; value: string | number; hint?: string; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${alert ? "border-red-200 bg-red-50" : "border-line bg-surface"}`}>
      <p className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-1 font-serif text-2xl ${alert ? "text-red-700" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}

function Oui({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-emerald-600" : "text-red-500"}>{ok ? "oui" : "non"}</span>;
}

function DiagnosticPage() {
  const charger = useServerFn(diagnosticPortefeuilleFn);
  const [data, setData] = useState<DiagnosticPortefeuille | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = (await charger()) as DiagnosticPortefeuille;
        if (!annule) setData(res);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : String(e));
      } finally {
        if (!annule) setLoading(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [charger]);

  const k = data?.kpis;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contrôle interne"
        title="Diagnostic contrats & finance"
        description="État de complétude des contrats, des devis et du raccordement au module finance. Lecture seule."
        icon={IconStethoscope}
      />

      {loading && <p className="text-sm text-ink-muted">Analyse du portefeuille…</p>}
      {erreur && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Erreur : {erreur}</p>
      )}

      {k && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Contrats OK" value={`${k.ok}/${k.total}`} hint="Complets & raccordés à la compta" />
            <Kpi label="Finance non générée" value={k.finance_absente} hint="Données OK mais 0 commission" alert={k.finance_absente > 0} />
            <Kpi label="Contrats incomplets" value={k.incomplet} hint="Prime / n° / assiette manquants" alert={k.incomplet > 0} />
            <Kpi label="Écritures déséquilibrées" value={k.ecritures_desequilibrees} hint="Contrôle partie double" alert={k.ecritures_desequilibrees > 0} />
            <Kpi label="Commissions comptabilisées" value={`${k.commissions_comptabilisees}/${k.commissions_total}`} />
            <Kpi label="Devis retenus + documentés" value={`${k.devis_retenus}/${k.devis_total}`} hint={`${k.dossiers_sans_devis} dossier(s) sans devis`} alert={k.devis_retenus === 0} />
            <Kpi label="Bordereaux sans lignes" value={`${k.bordereaux_sans_lignes}/${k.bordereaux}`} hint="Bordereaux non rapprochés" alert={k.bordereaux_sans_lignes > 0} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="p-3">État</th>
                  <th className="p-3">Contrat</th>
                  <th className="p-3">Assureur</th>
                  <th className="p-3 text-right">Prime TTC</th>
                  <th className="p-3 text-right">Assiette</th>
                  <th className="p-3 text-center">Éch.</th>
                  <th className="p-3 text-center">Comm.</th>
                  <th className="p-3 text-center">Compta</th>
                  <th className="p-3 text-center">Devis OK</th>
                </tr>
              </thead>
              <tbody>
                {data.contrats.map((c: ContratDiag) => {
                  const v = VERDICT[c.verdict];
                  return (
                    <tr key={c.id} className="border-b border-line/60 last:border-0">
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${v.cls}`}>
                          {v.dot} {v.label}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-ink">{c.numero ?? <span className="text-red-500">n° manquant</span>}</td>
                      <td className="p-3 text-ink-muted">{c.assureur ?? "—"}</td>
                      <td className="p-3 text-right">{euro(c.prime_ttc_annuelle)}</td>
                      <td className="p-3 text-right">{euro(c.assiette_commission_annuelle)}</td>
                      <td className="p-3 text-center">{c.nb_echeances}</td>
                      <td className="p-3 text-center">{c.nb_commissions}</td>
                      <td className="p-3 text-center">
                        {c.finance_raccorde ? c.nb_comm_compta : <span className="text-red-500">0</span>}
                      </td>
                      <td className="p-3 text-center"><Oui ok={c.devis_ok} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-ink-muted">
            « Compta » = commissions rattachées à une écriture comptable. « Devis OK » = un devis retenu et documenté
            est rattaché au dossier. Diagnostic en lecture seule — aucune donnée n'est modifiée.
          </p>
        </>
      )}
    </div>
  );
}
