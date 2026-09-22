/**
 * Colonne unique de navigation (fusion de l'ancien rail de domaines et de la
 * colonne des modules) : sélecteur de domaine en haut, puis modules et
 * sous-modules du domaine choisi. Les entrées du périmètre cible non
 * développé sont affichées désactivées.
 */
import { Link } from "@tanstack/react-router";

import type { NavDomain } from "@/lib/navigation";

export function ModuleColumn({
  domaine,
  domaines,
  reglages,
  pathname,
  onSelectDomaine,
  onNavigate,
  header,
  footer,
}: {
  domaine: NavDomain;
  domaines: NavDomain[];
  reglages: NavDomain | null;
  pathname: string;
  onSelectDomaine: (domaine: NavDomain) => void;
  onNavigate?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const estActif = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const toutes = reglages ? [...domaines, reglages] : domaines;

  return (
    <div className="flex h-full w-[min(88vw,17rem)] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface-elevated">
      {header && <div className="flex justify-center px-5 pt-5">{header}</div>}

      <div className="px-5 pb-5 pt-5">
        <label htmlFor="selecteur-domaine" className="crm-eyebrow">
          Domaine
        </label>
        <select
          id="selecteur-domaine"
          value={domaine.key}
          onChange={(e) => {
            const cible = toutes.find((d) => d.key === e.target.value);
            if (cible) onSelectDomaine(cible);
          }}
          className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-2 font-serif text-lg font-semibold text-ink"
        >
          {toutes.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {domaine.modules.map((m) => (
        <section key={m.module} className="pb-5">
          <p className="px-5 pb-1.5 text-sm font-semibold text-ink">{m.module}</p>
          <ul className="space-y-0.5 px-3">
            {m.items.map((item) => {
              if (!item.to || item.soon) {
                return (
                  <li key={item.label}>
                    <span
                      title="Périmètre fonctionnel cible — non encore développé"
                      className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted/45"
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="shrink-0 rounded-full border border-line px-1.5 text-[9px] font-semibold uppercase tracking-wider">
                        cible
                      </span>
                    </span>
                  </li>
                );
              }
              const on = estActif(item.to, item.exact);
              return (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={
                      "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors " +
                      (on
                        ? "bg-surface font-semibold text-ink"
                        : "text-ink-soft hover:bg-surface hover:text-ink")
                    }
                  >
                    <span className="truncate">{item.label}</span>
                    {on && (
                      <span
                        aria-hidden="true"
                        className="h-4 w-0.5 shrink-0 rounded-full bg-[color:var(--crm-gold)]"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {footer && <div className="mt-auto border-t border-line px-5 py-3">{footer}</div>}
    </div>
  );
}
