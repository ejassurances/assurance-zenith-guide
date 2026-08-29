/**
 * Bouton d'action rond utilisé dans les en-têtes d'entité et la barre supérieure.
 */
import { Link } from "@tanstack/react-router";

type Base = {
  label: string;
  children: React.ReactNode;
  badge?: number | null;
};

const CLASSES =
  "relative inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface-elevated text-ink-soft transition-colors hover:border-[color:var(--crm-gold)]/50 hover:text-ink";

function Badge({ badge }: { badge?: number | null }) {
  if (!badge) return null;
  return (
    <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-[color:var(--crm-gold)] px-1 text-[9px] font-bold text-white">
      {badge > 99 ? "99+" : badge}
    </span>
  );
}

export function IconAction({ label, children, badge, onClick }: Base & { onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={CLASSES}>
      {children}
      <Badge badge={badge} />
    </button>
  );
}

export function IconActionLink({ label, children, badge, to }: Base & { to: string }) {
  return (
    <Link to={to} title={label} aria-label={label} className={CLASSES}>
      {children}
      <Badge badge={badge} />
    </Link>
  );
}
