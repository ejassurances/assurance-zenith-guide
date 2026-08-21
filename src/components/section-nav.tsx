/**
 * Sous-navigation en liste verticale compacte (fiche client / fiche dossier).
 * Élément actif : fond doré clair, texte bleu nuit. Affichage uniquement.
 */
import { ChevronRight } from "lucide-react";

export type SectionNavItem<T extends string> = {
  key: T;
  label: string;
  /** Étape/section hors parcours nominal ou désactivée visuellement. */
  atone?: boolean;
};

export function SectionNav<T extends string>({
  title,
  items,
  active,
  onSelect,
}: {
  title?: string;
  items: SectionNavItem<T>[];
  active: string;
  onSelect: (key: T) => void;
}) {
  return (
    <nav aria-label={title ?? "Sections"} className="crm-card p-2">
      {title && <p className="crm-eyebrow px-3 pb-2 pt-2">{title}</p>}
      <ul className="space-y-0.5">
        {items.map((it) => {
          const on = it.key === active;
          return (
            <li key={it.key}>
              <button
                type="button"
                onClick={() => onSelect(it.key)}
                aria-current={on ? "true" : undefined}
                className={
                  "flex w-full items-center justify-between gap-2 rounded-[var(--radius)] px-3 py-2 text-left text-sm transition-colors " +
                  (on
                    ? "bg-[#D4AF37]/25 font-semibold text-[#0A192F]"
                    : it.atone
                      ? "text-ink-muted/70 hover:bg-surface"
                      : "text-ink-muted hover:bg-surface hover:text-ink")
                }
              >
                <span className="truncate">{it.label}</span>
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className={on ? "text-[#0A192F]/60" : "text-ink-muted/40"}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
