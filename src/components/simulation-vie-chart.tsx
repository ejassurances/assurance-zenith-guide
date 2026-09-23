import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { simulerAssuranceVie, type SimulationVieEntree } from "@/lib/simulation-assurance-vie";

const eur = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

/**
 * Simulation assurance vie : effort d'épargne, graphique à 3 courbes et
 * tableau année par année. Purement affichage — le calcul vit dans
 * simulation-assurance-vie.ts (fonction pure, testable indépendamment).
 */
export function SimulationVieChart({ entree }: { entree: SimulationVieEntree }) {
  const r = simulerAssuranceVie(entree);
  const data = r.lignes.map((l) => ({
    annee: `An ${l.annee}`,
    "Économie seule": l.economieSeule,
    [`${r.versementMensuelMinimum} € / mois`]: l.versementMinimum,
    "100 € / mois": l.versementSimule100,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="crm-card p-5">
          <p className="crm-eyebrow">Effort d'épargne</p>
          <p className="mt-2 font-serif text-2xl font-medium text-ink">{eur(r.effortEpargne)} / mois</p>
          <p className="mt-1 text-xs text-ink-muted">
            50 € (versement minimum) − {eur(entree.economieMensuelle)} d'économie réalisée
          </p>
        </div>
        <div className="crm-card p-5">
          <p className="crm-eyebrow">Versement mensuel mis en place</p>
          <p className="mt-2 font-serif text-2xl font-medium text-ink">{eur(r.versementMensuelMinimum)} / mois</p>
          <p className="mt-1 text-xs text-ink-muted">Dépôt initial à l'ouverture : {eur(r.depotInitial)}</p>
        </div>
        <div className="crm-card p-5">
          <p className="crm-eyebrow">Aucun frais sur versement</p>
          <p className="mt-2 text-sm text-ink-soft">
            Si vous mettez en place ce contrat avec nous, aucun frais ne sera prélevé sur vos
            versements — 100 % de chaque versement travaille pour vous.
          </p>
        </div>
      </div>

      <div className="crm-card p-6">
        <p className="crm-eyebrow">Évolution simulée sur {r.lignes.length} ans</p>
        <p className="mt-1 text-xs text-ink-muted">
          Simulation à titre indicatif, rendement de {r.rendementAnnuel} % par an, non garanti.
        </p>
        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="annee"
                tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                axisLine={{ stroke: "var(--line)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (v === 0 ? "0" : `${Math.round(v / 1000)}k`)}
                width={40}
              />
              <Tooltip
                formatter={(value: number, name: string) => [eur(value), name]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--line)", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="Économie seule"
                stroke="#9CA3AF"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey={`${r.versementMensuelMinimum} € / mois`}
                stroke="var(--crm-gold)"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="100 € / mois"
                stroke="var(--crm-navy)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="crm-card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Année</th>
              <th className="px-3 py-2 text-right font-medium">Économie seule</th>
              <th className="px-3 py-2 text-right font-medium">{r.versementMensuelMinimum} € / mois</th>
              <th className="px-3 py-2 text-right font-medium">100 € / mois</th>
            </tr>
          </thead>
          <tbody>
            {r.lignes.map((l) => (
              <tr key={l.annee} className="border-t border-line">
                <td className="px-3 py-2">Année {l.annee}</td>
                <td className="px-3 py-2 text-right">{eur(l.economieSeule)}</td>
                <td className="px-3 py-2 text-right font-medium">{eur(l.versementMinimum)}</td>
                <td className="px-3 py-2 text-right">{eur(l.versementSimule100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
