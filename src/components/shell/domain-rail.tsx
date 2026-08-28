/**
 * Rail vertical des domaines opérationnels (niveau 1 de la navigation).
 * Affichage uniquement : la sélection est pilotée par le parent.
 */
import type { NavDomain } from "@/lib/navigation";

export function DomainRail({
  domaines,
  reglages,
  actif,
  onSelect,
  header,
  footer,
}: {
  domaines: NavDomain[];
  reglages: NavDomain | null;
  actif: string | null;
  onSelect: (domaine: NavDomain) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const bouton = (d: NavDomain) => {
    const on = d.key === actif;
    return (
      <button
        key={d.key}
        type="button"
        onClick={() => onSelect(d)}
        title={d.label}
        aria-current={on ? "true" : undefined}
        className={
          "group flex w-full flex-col items-center gap-1 rounded-sm px-1 py-2.5 transition-colors " +
          (on
            ? "bg-[color:var(--crm-gold)]/15 text-[color:var(--crm-gold)]"
            : "text-white/50 hover:bg-white/5 hover:text-white")
        }
      >
        <d.icon size={20} stroke={1.6} aria-hidden="true" />
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] leading-none">{d.short}</span>
      </button>
    );
  };

  return (
    <div className="flex h-full w-[76px] shrink-0 flex-col border-r border-[color:var(--crm-gold)]/20 bg-[color:var(--crm-navy)]">
      <div className="flex justify-center px-2 py-4">{header}</div>
      <nav aria-label="Domaines opérationnels" className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {domaines.map(bouton)}
      </nav>
      <div className="space-y-2 border-t border-white/10 px-2 py-3">
        {reglages && bouton(reglages)}
        {footer}
      </div>
    </div>
  );
}
