import { useEffect, useMemo, useRef, useState } from "react";
import franceSvg from "@/assets/france-departments.svg?raw";
import type { DepartementPoint } from "@/lib/dashboard.functions";

/** Dégradé bleu clair → bleu foncé selon l'intensité (0 à 1), comme une légende classique de carte choroplèthe. */
function couleurIntensite(t: number): string {
  if (t <= 0) return "#e6ecf5";
  // interpolation simple entre un bleu très clair et le bleu marine du thème
  const r = Math.round(210 - t * (210 - 10));
  const g = Math.round(223 - t * (223 - 26));
  const b = Math.round(240 - t * (240 - 66));
  return `rgb(${r}, ${g}, ${b})`;
}

export function FranceClientsMap({ data }: { data: DepartementPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [noms, setNoms] = useState<Map<string, string>>(new Map());

  const parClient = useMemo(() => new Map(data.map((d) => [d.code, d.valeur])), [data]);
  const total = useMemo(() => data.reduce((acc, d) => acc + d.valeur, 0), [data]);
  const max = useMemo(() => data.reduce((acc, d) => Math.max(acc, d.valeur), 0), [data]);

  const top = useMemo(
    () =>
      [...data]
        .sort((a, b) => b.valeur - a.valeur)
        .slice(0, 5)
        .map((d) => ({ ...d, nom: noms.get(d.code) ?? d.code })),
    [data, noms],
  );

  // Colorie chaque département après insertion du SVG dans le DOM, et récupère
  // les noms (aria-label) portés par le fond de carte pour la liste "Top départements".
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const paths = el.querySelectorAll<SVGPathElement>("path[id]");
    const nomsTrouves = new Map<string, string>();
    paths.forEach((path) => {
      const code = path.id;
      nomsTrouves.set(code, path.getAttribute("aria-label") ?? code);
      const valeur = parClient.get(code) ?? 0;
      const intensite = max > 0 ? valeur / max : 0;
      path.style.fill = couleurIntensite(intensite);
      path.style.stroke = "#ffffff";
      path.style.strokeWidth = "0.6";
      if (valeur > 0) {
        const titre = document.createElementNS("http://www.w3.org/2000/svg", "title");
        titre.textContent = `${nomsTrouves.get(code)} — ${valeur} client${valeur > 1 ? "s" : ""}`;
        path.appendChild(titre);
      }
    });
    setNoms(nomsTrouves);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parClient, max]);

  return (
    <div className="crm-card p-6">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <p className="crm-eyebrow">Carte de vos clients</p>
          <p className="mt-1 text-xs text-ink-muted">Répartition par département</p>
          <div
            ref={containerRef}
            className="mt-4 [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-h-72"
            dangerouslySetInnerHTML={{ __html: franceSvg }}
          />
          <div className="mt-3 flex items-center gap-2 text-[10px] text-ink-muted">
            <span>0</span>
            <span
              className="h-2 flex-1 rounded-full"
              style={{ background: `linear-gradient(to right, ${couleurIntensite(0)}, ${couleurIntensite(1)})` }}
            />
            <span>{max}</span>
          </div>
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
