import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { RepartitionPoint } from "@/lib/dashboard.functions";

const PALETTE = [
  "var(--crm-gold)",
  "#5B6B8C",
  "#8A5A2A",
  "#5C8067",
  "#9A742A",
  "#737C92",
];

export function DonutRepartition({
  titre,
  sousTitre,
  data,
}: {
  titre: string;
  sousTitre?: string;
  data: RepartitionPoint[];
}) {
  const total = data.reduce((acc, d) => acc + d.valeur, 0);

  return (
    <div className="crm-card p-6">
      <p className="crm-eyebrow">{titre}</p>
      {sousTitre && <p className="mt-1 text-xs text-ink-muted">{sousTitre}</p>}

      {total === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-ink-muted">Aucun contrat enregistré.</p>
        </div>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="valeur"
                nameKey="nom"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [`${value} (${Math.round((value / total) * 100)}%)`, name]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--line)", fontSize: 12 }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ fontSize: 11, color: "var(--ink-muted)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
