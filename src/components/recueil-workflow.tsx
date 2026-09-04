import { useMemo, useState } from "react";
import {
  isFieldVisible,
  missingRequired,
  personnesAssurees,
  assuresEmprunteur,
  LIENS_EMPRUNTEUR,
  CSP_EMPRUNTEUR,
  type PersonneEmprunteur,
  ageDepuisDateNaissance,
  valorisationEmprunteur,

  LIENS_ASSURE,
  REGIMES_OBLIGATOIRES,
  type BrancheConfig,
  type FieldConfig,
  type PersonneAssuree,
  type SectionConfig,
} from "@/lib/recueil-besoins-schemas";

import { ContratActuelCgField, lireCgActuel } from "@/components/contrat-actuel-cg-field";

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
  dossierId,
  children,
  aside,
  asideSection,
  pleineLargeurSection,
  contexte,


}: {
  branche: BrancheConfig;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  onComplete?: () => void;
  onBack?: () => void;
  completeLabel?: string;
  /** Dossier d'origine, quand il existe déjà (traçabilité des CG déposées) */
  dossierId?: string | null;
  /** Contenu affiché sur la dernière étape (récapitulatif) */
  children?: React.ReactNode;
  /** Bloc affiché sous les questions à chaque étape (dépôt de documents…) */
  aside?: React.ReactNode;
  /** Bloc propre à une étape (ex. tarification : devis API / catalogue). */
  asideSection?: (section: SectionConfig, index: number) => React.ReactNode;
  /** Bloc pleine largeur sous l'étape (ex. devis d'assurance, colonnes par assuré). */
  pleineLargeurSection?: (section: SectionConfig, index: number) => React.ReactNode;
  /** Rappel permanent du contexte (client, dossier) en tête de colonne latérale. */
  contexte?: React.ReactNode;

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
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
                  branche={branche.value}
                  values={values}
                  dossierId={dossierId ?? null}
                />
              ))}

              {showErrors && missing.length > 0 && (
                <p className="text-sm text-destructive">
                  Merci de répondre aux questions obligatoires avant de continuer.
                </p>
              )}
            </div>

            {(contexte || asideSection) && (
              <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
                {contexte}
                {asideSection?.(section, index)}
              </aside>
            )}
            </div>
            {pleineLargeurSection?.(section, index)}
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
            {branche.value === "emprunteur" && <ValorisationCard values={values} />}
            {aside}
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

const fmtEur = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Emprunteur : tarif retenu et valorisation du contrat dans le portefeuille. */
function ValorisationCard({ values }: { values: Record<string, unknown> }) {
  const v = valorisationEmprunteur(values);
  if (v.montantTotal === null && v.cotisationAnnuelle === null && v.nbAnnees === null) return null;
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
      <p className="text-sm font-medium text-ink">Tarification & valorisation du contrat</p>
      <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div className="flex justify-between gap-3 text-sm">
          <dt className="text-ink-muted">Montant total de l'assurance</dt>
          <dd className="text-ink">{fmtEur(v.montantTotal)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <dt className="text-ink-muted">Cotisation mensuelle</dt>
          <dd className="text-ink">{fmtEur(v.cotisationMensuelle)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <dt className="text-ink-muted">Cotisation annuelle</dt>
          <dd className="text-ink">{fmtEur(v.cotisationAnnuelle)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <dt className="text-ink-muted">Durée de commissionnement</dt>
          <dd className="text-ink">{v.nbAnnees === null ? "—" : `${v.nbAnnees} ans`}</dd>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <dt className="text-ink-muted">Commission annuelle ({v.tauxCommission} %)</dt>
          <dd className="text-ink">{fmtEur(v.commissionAnnuelle)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-sm font-medium">
          <dt className="text-ink">Valorisation portefeuille</dt>
          <dd className="text-ink">{fmtEur(v.valorisation)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-ink-muted">
        Valorisation = commission annuelle × nombre d'années de commissionnement.
      </p>
    </div>
  );
}

function shortLabel(f: FieldConfig) {
  return f.label.length > 60 ? `${f.label.slice(0, 57)}…` : f.label;
}


function formatValue(f: FieldConfig, v: unknown) {
  if (f.type === "cg_actuel") {
    const cg = lireCgActuel(v);
    return cg ? `${cg.nom_fichier ?? "Conditions générales"} (${cg.compagnie_nom})` : "Non fourni";
  }
  if (f.type === "yesno") return v === true ? "Oui" : v === false ? "Non" : "—";
  if (f.type === "checkbox") return v === true ? "Oui" : "Non";
  if (f.type === "personnes") {
    const list = personnesAssurees(v);
    if (list.length === 0) return "—";
    return list.map((p) => resumePersonne(p)).join(" · ");
  }
  if (f.type === "assures_emprunteur") {
    const list = assuresEmprunteur(v);
    if (list.length === 0) return "—";
    return list.map((p) => resumeAssureEmprunteur(p)).join(" · ");
  }
  if (v === undefined || v === null || v === "") return "—";
  const opt = f.options?.find((o) => o.value === v);
  return `${opt?.label ?? String(v)}${f.suffix ? ` ${f.suffix}` : ""}`;
}

/** Résumé lisible d'un assuré : « Conjoint, 42 ans (Salarié) ». */
export function resumePersonne(p: PersonneAssuree) {
  const lien = LIENS_ASSURE.find((l) => l.value === p.lien)?.label ?? "Assuré";
  const age = ageDepuisDateNaissance(p.date_naissance);
  const regime = REGIMES_OBLIGATOIRES.find((r) => r.value === p.regime)?.label;
  return [lien, age !== null ? `${age} ans` : null, regime ? `(${regime})` : null].filter(Boolean).join(", ");
}

/** Résumé lisible d'un assuré emprunteur : « Co-emprunteur, 38 ans, 40 % ». */
export function resumeAssureEmprunteur(p: PersonneEmprunteur) {
  const lien = LIENS_EMPRUNTEUR.find((l) => l.value === p.lien)?.label ?? "Assuré";
  const identite = [p.prenom, p.nom].map((v) => v.trim()).filter(Boolean).join(" ");
  const age = ageDepuisDateNaissance(p.date_naissance);
  return [identite || null, lien, age !== null ? `${age} ans` : null, p.quotite_pct != null ? `${p.quotite_pct} %` : null]
    .filter(Boolean)
    .join(", ");
}

const ASSURE_EMPRUNTEUR_VIDE = (lien: string): PersonneEmprunteur => ({
  lien,
  prenom: "",
  nom: "",
  date_naissance: "",
  quotite_pct: null,
  csp: "",
  fumeur: false,
});

function AssuresEmprunteurField({
  value,
  onChange,
  error,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  error?: boolean;
}) {
  const list = assuresEmprunteur(value);
  const rows: PersonneEmprunteur[] = list.length > 0 ? list : [ASSURE_EMPRUNTEUR_VIDE("principal")];

  const update = (i: number, patch: Partial<PersonneEmprunteur>) =>
    onChange(rows.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const invalide = (p: PersonneEmprunteur) =>
    !p.date_naissance || p.quotite_pct == null || p.quotite_pct <= 0 || p.quotite_pct > 100;

  return (
    <div className="space-y-3">
      {rows.map((p, i) => {
        const age = ageDepuisDateNaissance(p.date_naissance);
        return (
          <div
            key={i}
            className={`rounded-xl border p-4 ${error && invalide(p) ? "border-destructive" : "border-line"} bg-background/40`}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Lien</span>
                <select value={p.lien} onChange={(e) => update(i, { lien: e.target.value })} className={inputCls}>
                  {LIENS_EMPRUNTEUR.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Prénom</span>
                <input
                  type="text"
                  value={p.prenom}
                  onChange={(e) => update(i, { prenom: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Nom</span>
                <input
                  type="text"
                  value={p.nom}
                  onChange={(e) => update(i, { nom: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Date de naissance <span className="text-accent">*</span>
                </span>
                <input
                  type="date"
                  value={p.date_naissance}
                  onChange={(e) => update(i, { date_naissance: e.target.value })}
                  className={inputCls}
                />
                {age !== null && <span className="text-xs text-ink-muted">{age} ans</span>}
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Quotité assurée <span className="text-accent">*</span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={p.quotite_pct ?? ""}
                    onChange={(e) => update(i, { quotite_pct: e.target.value ? Number(e.target.value) : null })}
                    className={inputCls}
                    placeholder="100"
                  />
                  <span className="text-sm text-ink-muted">%</span>
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Catégorie socio-professionnelle
                </span>
                <select value={p.csp} onChange={(e) => update(i, { csp: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {CSP_EMPRUNTEUR.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  checked={p.fumeur}
                  onChange={(e) => update(i, { fumeur: e.target.checked })}
                  className="h-4 w-4 rounded border-line"
                />
                <span className="text-sm text-ink">Fumeur (ou vapoteur)</span>
              </label>
            </div>
            <p className="mt-3 rounded-lg border border-line bg-background/60 px-3 py-2 text-xs text-ink-muted">
              Conformément à la loi Lemoine et à la politique du cabinet, aucun questionnaire médical
              n'est recueilli : antécédents de santé, pathologies et sports à risque ne sont ni demandés
              ni conservés.
            </p>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                className="mt-2 text-xs text-destructive underline"
              >
                Retirer cet assuré
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...rows, ASSURE_EMPRUNTEUR_VIDE("co_emprunteur")])}
        className="rounded-full border border-line px-4 py-2 text-sm text-ink hover:bg-background"
      >
        + Ajouter un co-emprunteur
      </button>
    </div>
  );
}

function PersonnesField({
  value,
  onChange,
  error,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  error?: boolean;
}) {
  const list = personnesAssurees(value);
  const rows: PersonneAssuree[] =
    list.length > 0 ? list : [{ lien: "soi_meme", date_naissance: "", regime: "" }];

  const update = (i: number, patch: Partial<PersonneAssuree>) =>
    onChange(rows.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-3">
      {rows.map((p, i) => {
        const age = ageDepuisDateNaissance(p.date_naissance);
        return (
          <div
            key={i}
            className={`rounded-xl border p-4 ${error && !p.date_naissance ? "border-destructive" : "border-line"} bg-background/40`}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Lien</span>
                <select
                  value={p.lien}
                  onChange={(e) => update(i, { lien: e.target.value })}
                  className={inputCls}
                >
                  {LIENS_ASSURE.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Date de naissance <span className="text-accent">*</span>
                </span>
                <input
                  type="date"
                  value={p.date_naissance}
                  onChange={(e) => update(i, { date_naissance: e.target.value })}
                  className={inputCls}
                />
                {age !== null && <span className="text-xs text-ink-muted">{age} ans</span>}
              </label>
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Régime obligatoire
                </span>
                <select
                  value={p.regime}
                  onChange={(e) => update(i, { regime: e.target.value })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {REGIMES_OBLIGATOIRES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                className="mt-2 text-xs text-destructive underline"
              >
                Retirer cette personne
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...rows, { lien: "conjoint", date_naissance: "", regime: "" }])}
        className="rounded-full border border-line px-4 py-2 text-sm text-ink hover:bg-background"
      >
        + Ajouter une personne
      </button>
    </div>
  );
}


export function WorkflowField({
  field,
  value,
  onChange,
  error,
  branche,
  values,
  dossierId,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: boolean;
  /** Branche du recueil : nécessaire au dépôt des CG du contrat actuel */
  branche?: string;
  /** Autres réponses du recueil (compagnie actuelle notamment) */
  values?: Record<string, unknown>;
  dossierId?: string | null;
}) {
  const heading = field.question ?? field.label;
  const isChoice = field.type === "cg_actuel" || field.type === "cards" || field.type === "yesno" || field.type === "personnes" || field.type === "assures_emprunteur";

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

      {field.type === "cg_actuel" && (
        <ContratActuelCgField
          branche={branche ?? ""}
          compagnieNom={String(values?.["contrat_actuel_compagnie"] ?? "")}
          dossierId={dossierId ?? null}
          value={value}
          onChange={onChange}
        />
      )}

      {field.type === "personnes" && <PersonnesField value={value} onChange={onChange} error={error} />}

      {field.type === "assures_emprunteur" && (
        <AssuresEmprunteurField value={value} onChange={onChange} error={error} />
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
