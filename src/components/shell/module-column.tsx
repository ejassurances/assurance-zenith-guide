/**
 * Colonne des modules et sous-modules du domaine sélectionné (niveaux 2 et 3).
 * Les entrées du périmètre cible non développé sont affichées désactivées.
 */
import { Link } from "@tanstack/react-router";

import type { NavDomain } from "@/lib/navigation";

export function ModuleColumn({
  domaine,
  pathname,
  onNavigate,
}: {
  domaine: NavDomain;
  pathname: string;
  onNavigate?: () => void;
}) {
  const estActif = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface-elevated">
      <p className="crm-eyebrow px-5 pb-1 pt-5">Domaine</p>
      <h2 className="px-5 pb-5 font-serif text-lg font-semibold leading-snug text-ink">{domaine.label}</h2>

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
    </div>
  );
}
