import { useMemo, useState } from "react";
import {
  isFieldVisible,
  missingRequired,
  type BrancheConfig,
  type FieldConfig,
} from "@/lib/recueil-besoins-schemas";
import imgTrottinette from "@/assets/edpm-trottinette.png";
import imgGyroroue from "@/assets/edpm-gyroroue.png";
import imgMonoroue from "@/assets/edpm-monoroue.png";
import imgHoverboard from "@/assets/edpm-hoverboard.png";
import imgGyropode from "@/assets/edpm-gyropode.png";
import imgAutre from "@/assets/edpm-autre.png";

const IMAGES: Record<string, string> = {
  trottinette: imgTrottinette,
  gyroroue: imgGyroroue,
  monoroue: imgMonoroue,
  hoverboard: imgHoverboard,
  gyropode: imgGyropode,
  autre: imgAutre,
};

const inputCls =
  "mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink";

/**
 * Devoir de conseil sous forme de parcours guidé : une étape par section,
 * questions mises en avant, blocs pédagogiques et choix illustrés.
 */
export function RecueilWorkflow({
  branche,
  values,
  onChange,
  onComplete,
  onBack,
  completeLabel = "Terminer le recueil",
  children,
}: {
  branche: BrancheConfig;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  onComplete?: () => void;
  onBack?: () => void;
  completeLabel?: string;
  /** Contenu affiché sur la dernière étape (récapitulatif) */
  children?: React.ReactNode;
}) {
  const steps = branche.sections;
  const total = steps.length + 1; // + récapitulatif
  const [index, setIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  const isRecap = index === steps.length;
  const section = steps[index];
  const missing = useMemo(
    () => (section ? missingRequired(section, values) : []),
    [section, values],
  );

  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v });

  const next = () => {
    if (missing.length > 0) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setIndex((i) => Math.min(i + 1, steps.length));
  };

  const prev = () => {
    setShowErrors(false);
    if (index === 0) onBack?.();
    else setIndex((i) => i - 1);
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated">
      {/* En-tête + progression */}
      <div className="border-b border-line px-6 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg text-ink">Devoir de conseil · {branche.label}</h2>
          <span className="text-xs text-ink-muted">
            Étape {index + 1} / {total}
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => {
                setShowErrors(false);
                setIndex(i);
              }}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                i === index
                  ? "border-ink bg-ink text-primary-foreground"
                  : i < index
                    ? "border-line bg-background text-ink"
                    : "border-line bg-background/40 text-ink-muted"
              }`}
            >
              {i < index ? "✓ " : ""}
              {s.title}
            </button>
          ))}
          <span
            className={`rounded-full border px-3 py-1 text-xs ${
              isRecap ? "border-ink bg-ink text-primary-foreground" : "border-line bg-background/40 text-ink-muted"
            }`}
          >
            Récapitulatif
          </span>
        </div>
      </div>

      <div className="px-6 py-6">
        {!isRecap && section && (
          <div className="space-y-8">
            <div>
              <h3 className="font-serif text-xl text-ink">{section.title}</h3>
              {section.intro && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{section.intro}</p>}
            </div>

            {section.fields.filter((f) => isFieldVisible(f, values)).map((f) => (
              <WorkflowField
                key={f.key}
                field={f}
                value={values[f.key]}
                onChange={(v) => set(f.key, v)}
                error={showErrors && missing.some((m) => m.key === f.key)}
              />
            ))}

            {showErrors && missing.length > 0 && (
              <p className="text-sm text-destructive">
                Merci de répondre aux questions obligatoires avant de continuer.
              </p>
            )}
          </div>
        )}

        {isRecap && (
          <div className="space-y-6">
            <div>
              <h3 className="font-serif text-xl text-ink">Récapitulatif du recueil</h3>
              <p className="mt-1 text-sm text-ink-muted">
                Vérifiez les réponses : elles constituent la trace du devoir de conseil et alimentent la lettre de
                mission.
              </p>
            </div>
            <div className="space-y-4">
              {steps.map((s, i) => (
                <div key={s.title} className="rounded-xl border border-line bg-background/40 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink">{s.title}</p>
                    <button
                      type="button"
                      onClick={() => setIndex(i)}
                      className="text-xs text-ink-muted underline"
                    >
                      Modifier
                    </button>
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {s.fields
                      .filter((f) => isFieldVisible(f, values))
                      .map((f) => (
                        <div key={f.key} className="flex justify-between gap-3 text-sm">
                          <dt className="text-ink-muted">{shortLabel(f)}</dt>
                          <dd className="text-right text-ink">{formatValue(f, values[f.key])}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              ))}
            </div>
            {children}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line px-6 py-4">
        <button type="button" onClick={prev} className="text-sm text-ink-muted underline">
          ← {index === 0 ? "Changer de branche" : "Précédent"}
        </button>
        {isRecap ? (
          onComplete && (
            <button
              type="button"
              onClick={onComplete}
              className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-primary-foreground"
            >
              {completeLabel}
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={next}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-primary-foreground"
          >
            Continuer →
          </button>
        )}
      </div>
    </div>
  );
}

function shortLabel(f: FieldConfig) {
  return f.label.length > 60 ? `${f.label.slice(0, 57)}…` : f.label;
}

function formatValue(f: FieldConfig, v: unknown) {
  if (f.type === "checkbox") return v === true ? "Oui" : "Non";
  if (v === undefined || v === null || v === "") return "—";
  const opt = f.options?.find((o) => o.value === v);
  return `${opt?.label ?? String(v)}${f.suffix ? ` ${f.suffix}` : ""}`;
}

export function WorkflowField({
  field,
  value,
  onChange,
  error,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: boolean;
}) {
  const heading = field.question ?? field.label;
  const isChoice = field.type === "cards" || field.type === "yesno";

  return (
    <div className={isChoice ? "space-y-3" : "max-w-xl space-y-2"}>
      {isChoice && (
        <h4 className={`font-serif text-lg ${error ? "text-destructive" : "text-ink"}`}>
          {heading}
          {field.required && <span className="text-accent"> *</span>}
        </h4>
      )}

      {field.info && (
        <div className="flex gap-3 rounded-xl border border-line bg-background/60 p-4">
          <span aria-hidden className="text-lg">
            💡
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{field.infoTitle ?? "Bon à savoir"}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{field.info}</p>
          </div>
        </div>
      )}

      {field.type === "cards" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {field.options?.map((o) => {
            const img = o.imageKey ? IMAGES[o.imageKey] : undefined;
            const active = value === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition ${
                  active
                    ? "border-accent bg-accent/10 ring-1 ring-accent"
                    : "border-line bg-background/40 hover:border-ink/40"
                }`}
              >
                {img && (
                  <img
                    src={img}
                    alt={o.label}
                    loading="lazy"
                    width={512}
                    height={512}
                    className="h-24 w-auto object-contain"
                  />
                )}
                <span className="text-sm font-medium text-ink">{o.label}</span>
                {o.description && <span className="text-xs text-ink-muted">{o.description}</span>}
              </button>
            );
          })}
        </div>
      )}

      {field.type === "yesno" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(field.options ?? [
            { value: "oui", label: "Oui" },
            { value: "non", label: "Non" },
          ]).map((o) => {
            const active = value === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                className={`rounded-2xl border px-4 py-6 text-center transition ${
                  active
                    ? "border-accent bg-accent/10 ring-1 ring-accent"
                    : "border-line bg-background/40 hover:border-ink/40"
                }`}
              >
                <span className="text-sm font-medium text-ink">{o.label}</span>
                {o.description && <span className="mt-1 block text-xs text-ink-muted">{o.description}</span>}
              </button>
            );
          })}
        </div>
      )}

      {field.type === "checkbox" && (
        <label
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
            error ? "border-destructive" : "border-line"
          } bg-background/40`}
        >
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-ink">
            {field.label}
            {field.required && <span className="text-accent"> *</span>}
          </span>
        </label>
      )}

      {field.type === "textarea" && (
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{heading}</span>
          <textarea
            rows={3}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={inputCls}
          />
        </label>
      )}

      {field.type === "select" && (
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {field.label}
            {field.required && <span className="text-accent"> *</span>}
          </span>
          <select
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputCls} ${error ? "border-destructive" : ""}`}
          >
            <option value="">—</option>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {(field.type === "text" || field.type === "number") && (
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {field.label}
            {field.suffix ? ` (${field.suffix})` : ""}
            {field.required && <span className="text-accent"> *</span>}
          </span>
          <input
            type={field.type === "number" ? "number" : "text"}
            value={(value as string | number | undefined) ?? ""}
            onChange={(e) =>
              onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
            }
            placeholder={field.placeholder}
            className={`${inputCls} ${error ? "border-destructive" : ""}`}
          />
        </label>
      )}

      {field.help && <p className="text-xs text-ink-muted">{field.help}</p>}
    </div>
  );
}
