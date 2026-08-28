/**
 * Gabarit d'en-tête d'entité (client, dossier, contrat, sinistre, compagnie).
 * Affichage uniquement : identité, état, complétude, méta en colonnes, actions.
 */
export type EntityMeta = { label: string; value: React.ReactNode };

export function EntityHeader({
  retour,
  visuel,
  titre,
  sousTitre,
  badge,
  completude,
  meta,
  actions,
}: {
  retour?: React.ReactNode;
  visuel?: React.ReactNode;
  titre: string;
  sousTitre?: React.ReactNode;
  badge?: React.ReactNode;
  /** Pourcentage de complétude (0–100). */
  completude?: number | null;
  meta?: EntityMeta[];
  actions?: React.ReactNode;
}) {
  return (
    <section className="crm-card overflow-hidden">
      <span aria-hidden="true" className="block h-0.5 bg-[color:var(--crm-gold)]" />
      {retour && <div className="px-5 pt-4 text-sm">{retour}</div>}

      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 p-5 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {visuel && <div className="shrink-0">{visuel}</div>}
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="truncate font-serif text-2xl font-semibold text-ink">{titre}</h1>
              {badge}
            </div>
            {sousTitre && <p className="mt-1 text-sm text-ink-muted">{sousTitre}</p>}
            {typeof completude === "number" && (
              <p className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full bg-[color:var(--crm-gold)]"
                    style={{ width: `${Math.min(100, Math.max(0, completude))}%` }}
                  />
                </span>
                Complété à {Math.round(completude)} %
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {meta && meta.length > 0 && (
        <dl className="grid gap-4 border-t border-line px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="crm-eyebrow">{m.label}</dt>
              <dd className="mt-1 truncate text-sm text-ink">{m.value ?? "Non renseigné"}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
