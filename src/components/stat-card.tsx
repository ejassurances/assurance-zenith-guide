/**
 * Carte d'aperçu avec icône Tabler en filigrane (bas droite, faible opacité).
 * Affichage uniquement.
 */
import type { Icon } from "@tabler/icons-react";

export function StatCard({
  label,
  value,
  sub,
  accent,
  icon: IconCmp,
  className = "",
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
  icon?: Icon;
  className?: string;
}) {
  return (
    <div className={`crm-card relative overflow-hidden p-6 ${accent ? "crm-card-accent" : ""} ${className}`}>
      {IconCmp && (
        <IconCmp
          size={48}
          stroke={1.4}
          aria-hidden="true"
          className={
            "pointer-events-none absolute bottom-3 right-3 " +
            (accent ? "text-[color:var(--crm-gold)]/15" : "text-ink/10")
          }
        />
      )}
      <p className="crm-eyebrow relative">{label}</p>
      <p
        className={
          "crm-figure relative mt-3 text-3xl " + (accent ? "text-[color:var(--crm-gold-muted)]" : "text-ink")
        }
      >
        {value}
      </p>
      {sub && <p className="relative mt-2 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}
