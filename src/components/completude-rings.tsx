/**
 * Jauges de complétude circulaires (affichage seul).
 * Vert = complet, ambre = partiel, bleu nuit = stade normal / non commencé.
 */

export type CompletudeItem = {
  key: string;
  label: string;
  /** 0 → 100 */
  value: number;
  /** Neutre : étape normale du parcours, ni en retard ni complète. */
  neutre?: boolean;
};

const GOLD = "#D4AF37";
const NAVY = "#0A192F";

function couleur(item: CompletudeItem) {
  if (item.value >= 100) return "#16a34a";
  if (item.neutre) return NAVY;
  if (item.value > 0) return GOLD;
  return NAVY;
}

export function CompletudeRing({ item, size = 72 }: { item: CompletudeItem; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Math.round(item.value)));
  const color = couleur(item);
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-ink/10"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * pct) / 100}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-semibold text-ink"
          style={{ fontSize: size * 0.26 }}
        >
          {pct}%
        </span>
      </div>
      <span className="max-w-[7rem] text-[10px] font-semibold uppercase leading-tight tracking-wide text-ink-muted">
        {item.label}
      </span>
    </div>
  );
}

export function CompletudeRings({
  items,
  size = 72,
  className = "",
}: {
  items: CompletudeItem[];
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start gap-6 ${className}`}>
      {items.map((it) => (
        <CompletudeRing key={it.key} item={it} size={size} />
      ))}
    </div>
  );
}
