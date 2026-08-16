/**
 * Anneau de score : valeur client.
 * Le score de valeur client est calculé à la volée en base
 * (fonction SQL `score_valeur_client`), il n'est jamais stocké.
 */
export function ScoreRing({
  value,
  label,
  color,
  size = 56,
}: {
  value: number;
  label: string;
  color: string;
  size?: number;
}) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-black/10" />
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
          style={{ fontSize: size * 0.28 }}
        >
          {Math.round(pct)}
        </span>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">{label}</span>
    </div>
  );
}

/**
 * Valeur client (doré). La conformité n'est plus affichée ici : un seul score
 * de conformité existe désormais, celui du risque LCB-FT (bloc « Risque
 * LCB-FT » de l'onglet Conformité de la fiche client).
 */
export function ScoreRings({ valeur, size = 56 }: { valeur: number; size?: number }) {
  return (
    <div className="flex items-start gap-4">
      <ScoreRing value={valeur} label="Valeur client" color="#D4AF37" size={size} />
    </div>
  );
}
