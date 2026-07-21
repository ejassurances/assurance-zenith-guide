import { useMemo, useState } from "react";

function formatEuros(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(
    Math.max(0, Math.round(n)),
  ) + " €";
}

/**
 * Estimation simplifiée : économie = capital × (taux_actuel − taux_marché) × durée_restante / 2
 * (approximation linéaire du capital moyen restant dû).
 */
function estimateSavings(capital: number, currentRate: number, marketRate: number, years: number) {
  const delta = Math.max(0, currentRate - marketRate) / 100;
  return (capital * delta * years) / 2;
}

export function Simulator() {
  const [capital, setCapital] = useState(250000);
  const [rate, setRate] = useState(0.36);
  const [years, setYears] = useState(18);
  const marketRate = 0.1;

  const savings = useMemo(
    () => estimateSavings(capital, rate, marketRate, years),
    [capital, rate, years],
  );

  return (
    <div className="rounded-2xl bg-surface-elevated p-6 shadow-sm ring-1 ring-black/5 md:p-10">
      <div className="mb-8 flex items-center gap-2">
        <span className="size-2 rounded-full bg-ink" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink">
          Simulateur — assurance emprunteur
        </h2>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Field
            label="Capital restant dû"
            suffix="€"
            value={capital}
            step={5000}
            min={10000}
            max={2000000}
            onChange={setCapital}
          />
          <Field
            label="Taux d'assurance actuel"
            suffix="%"
            value={rate}
            step={0.01}
            min={0.05}
            max={1.5}
            decimals={2}
            onChange={setRate}
          />
          <Field
            label="Durée restante du prêt"
            suffix="ans"
            value={years}
            step={1}
            min={1}
            max={30}
            onChange={setYears}
          />
        </div>
        <div className="flex flex-col justify-center rounded-xl bg-surface p-8 text-center">
          <p className="text-sm text-ink-muted">Économie potentielle estimée</p>
          <p className="mt-2 font-serif text-5xl font-medium text-ink tabular-nums">
            {formatEuros(savings)}
          </p>
          <p className="mt-4 text-xs italic text-ink-muted">
            Estimation indicative, basée sur un taux marché de référence de {marketRate.toFixed(2)} %.
            Résultat non contractuel — un devis personnalisé sera établi après étude de votre dossier.
          </p>
          <a
            href="/contact"
            className="mt-6 inline-flex h-11 items-center justify-center self-center rounded-full bg-ink px-6 text-sm font-medium text-primary-foreground transition-transform active:scale-95"
          >
            Recevoir mon analyse gratuite
          </a>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  suffix,
  value,
  onChange,
  step,
  min,
  max,
  decimals = 0,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  decimals?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-ink-soft">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full rounded-md border border-line bg-background px-4 py-2.5 pr-14 text-base tabular-nums ring-1 ring-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ink"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-ink"
        aria-label={`${label} (curseur)`}
      />
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-widest text-ink-muted">
        <span>{min.toFixed(decimals)}</span>
        <span>{max.toFixed(decimals)}</span>
      </div>
    </label>
  );
}
