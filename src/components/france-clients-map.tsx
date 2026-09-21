import { useMemo } from "react";
import { DEPARTEMENTS_FORMES, FRANCE_VIEWBOX } from "@/lib/france-departments-data";
import type { DepartementPoint } from "@/lib/dashboard.functions";

/** Dégradé bleu clair → bleu marine selon l'intensité (0 à 1). */
function couleurIntensite(t: number): string {
  if (t <= 0) return "#e6ecf5";
  const r = Math.round(210 - t * (210 - 10));
  const g = Math.round(223 - t * (223 - 26));
  const b = Math.round(240 - t * (240 - 66));
  return `rgb(${r}, ${g}, ${b})`;
}

export function FranceClientsMap({ data }: { data: DepartementPoint[] }) {
  const parClient = useMemo(() => new Map(data.map((d) => [d.code, d.valeur])), [data]);
  const total = useMemo(() => data.reduce((acc, d) => acc + d.valeur, 0), [data]);
  const max = useMemo(() => data.reduce((acc, d) => Math.max(acc, d.valeur), 0), [data]);

  const top = useMemo(
    () =>
      [...data]
        .sort((a, b) => b.valeur - a.valeur)
        .slice(0, 5)
        .map((d) => ({
          ...d,
          nom: DEPARTEMENTS_FORMES.find((f) => f.id === d.code)?.nom ?? d.code,
        })),
    [data],
  );

  return (
    <div className="crm-card p-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <p className="crm-eyebrow">Carte de vos clients</p>
          <p className="mt-1 text-xs text-ink-muted">Répartition par département</p>

          <svg viewBox={FRANCE_VIEWBOX} className="mt-4 h-auto max-h-72 w-full" role="img" aria-label="Carte de France par département">
            {DEPARTEMENTS_FORMES.map((dept) => {
              const valeur = parClient.get(dept.id) ?? 0;
              const intensite = max > 0 ? valeur / max : 0;
              return (
                <path
                  key={dept.id}
                  d={dept.d}
                  fill={couleurIntensite(intensite)}
                  stroke="#ffffff"
                  strokeWidth={0.6}
                >
                  {valeur > 0 && <title>{`${dept.nom} — ${valeur} client${valeur > 1 ? "s" : ""}`}</title>}
                </path>
              );
            })}
          </svg>

          <div className="mt-3 flex items-center gap-2 text-[10px] text-ink-muted">
            <span>0</span>
            <span
              className="h-2 flex-1 rounded-full"
              style={{ background: `linear-gradient(to right, ${couleurIntensite(0)}, ${couleurIntensite(1)})` }}
            />
            <span>{max}</span>
          </div>
          <p className="mt-2 text-[10px] text-ink-muted">Fond de carte : © VictorCazanave (CC-BY-4.0)</p>
        </div>

        <div>
          <p className="text-xs font-medium text-ink">
            {total} client{total > 1 ? "s" : ""} localisé{total > 1 ? "s" : ""}
          </p>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-ink-muted">Top départements</p>
          <ul className="mt-2 space-y-2">
            {top.length === 0 && <li className="text-xs text-ink-muted">Aucun client localisé.</li>}
            {top.map((d, i) => (
              <li key={d.code} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-ink-muted">
                  {i + 1}. {d.nom}
                </span>
                <span className="font-semibold text-ink">{d.valeur}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
