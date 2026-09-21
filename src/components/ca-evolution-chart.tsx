import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { CaMensuelPoint } from "@/lib/dashboard.functions";

/** Courbe d'évolution du CA mensuel (commissions versées), année en cours. */
export function CaEvolutionChart({ data }: { data: CaMensuelPoint[] }) {
  const total = data.reduce((acc, p) => acc + p.montant, 0);

  return (
    <div className="crm-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="crm-eyebrow">Évolution du CA</p>
          <p className="mt-1 text-xs text-ink-muted">Revenus mensuels réels, {new Date().getFullYear()}</p>
        </div>
        <p className="font-serif text-2xl font-semibold text-ink">
          {total.toLocaleString("fr-FR")} €
        </p>
      </div>

      {total === 0 ? (
        <p className="mt-8 py-10 text-center text-sm text-ink-muted">
          Aucune commission versée enregistrée pour l'instant cette année.
        </p>
      ) : (
        <div className="mt-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                axisLine={{ stroke: "var(--line)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => (v === 0 ? "0" : `${Math.round(v / 1000)}k`)}
                width={36}
              />
              <Tooltip
                formatter={(value: number) => [`${value.toLocaleString("fr-FR")} €`, "CA"]}
                labelFormatter={(label: string) => label}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="montant"
                stroke="var(--crm-gold)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--crm-gold)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
