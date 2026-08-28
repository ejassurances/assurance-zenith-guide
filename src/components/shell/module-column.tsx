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
    <div className="flex h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface">
      <p className="crm-eyebrow px-5 pb-1 pt-5">Domaine</p>
      <h2 className="px-5 pb-4 font-serif text-base font-semibold leading-snug text-ink">{domaine.label}</h2>

      {domaine.modules.map((m) => (
        <section key={m.module} className="pb-5">
          <p className="crm-eyebrow px-5 pb-2 text-ink-muted">{m.module}</p>
          <ul className="space-y-px px-2">
            {m.items.map((item) => {
              if (!item.to || item.soon) {
                return (
                  <li key={item.label}>
                    <span
                      title="Périmètre fonctionnel cible — non encore développé"
                      className="flex cursor-not-allowed items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm text-ink-muted/45"
                    >
                      <span className="truncate">{item.label}</span>
                      <span className="shrink-0 rounded-sm border border-line px-1 text-[9px] font-semibold uppercase tracking-wider">
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
                      "block truncate rounded-sm border-l-2 px-3 py-2 text-sm transition-colors " +
                      (on
                        ? "border-[color:var(--crm-gold)] bg-[color:var(--crm-gold)]/12 font-medium text-ink"
                        : "border-transparent text-ink-soft hover:bg-surface-elevated hover:text-ink")
                    }
                  >
                    {item.label}
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
