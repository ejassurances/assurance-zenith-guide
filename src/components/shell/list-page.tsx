/**
 * Gabarit de page liste : en-tête, barre de recherche/filtres en ligne,
 * panneau latéral de filtres repliable, zone de tableau et pied de liste.
 */
import { useState } from "react";
import { IconFilter, IconX } from "@tabler/icons-react";

export function ListPage({
  header,
  barre,
  filtres,
  compteur,
  children,
  pied,
}: {
  header?: React.ReactNode;
  /** Contrôles toujours visibles (recherche, tris rapides). */
  barre?: React.ReactNode;
  /** Contenu du panneau latéral « Filtrer » ; masqué s'il est absent. */
  filtres?: React.ReactNode;
  compteur?: React.ReactNode;
  children: React.ReactNode;
  pied?: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="space-y-6">
      {header}

      {(barre || filtres || compteur) && (
        <div className="crm-card flex flex-wrap items-center gap-3 p-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{barre}</div>
          {compteur && <span className="shrink-0 text-xs text-ink-muted">{compteur}</span>}
          {filtres && (
            <button
              type="button"
              onClick={() => setOuvert((v) => !v)}
              aria-expanded={ouvert}
              className="flex shrink-0 items-center gap-2 rounded-sm border border-line px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-soft transition-colors hover:border-[color:var(--crm-gold)]/50 hover:text-ink"
            >
              {ouvert ? <IconX size={14} aria-hidden="true" /> : <IconFilter size={14} aria-hidden="true" />}
              Filtrer
            </button>
          )}
        </div>
      )}

      <div className={"grid min-w-0 gap-6 " + (filtres && ouvert ? "lg:grid-cols-[minmax(0,1fr)_18rem]" : "")}>
        <div className="min-w-0 space-y-4">
          {children}
          {pied}
        </div>
        {filtres && ouvert && (
          <aside className="crm-card min-w-0 space-y-4 p-4">
            <p className="crm-eyebrow">Filtrer</p>
            {filtres}
          </aside>
        )}
      </div>
    </div>
  );
}
