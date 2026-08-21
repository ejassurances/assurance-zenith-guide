/**
 * En-tête de page CRM : bandeau bleu nuit, filet doré, titre serif,
 * description et zone d'actions. Affichage uniquement.
 */
import type { Icon } from "@tabler/icons-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: IconCmp,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: Icon;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-[var(--radius)] bg-[#0A192F] p-6 text-white shadow-[0_16px_40px_-24px_rgb(10_25_47/0.8)]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[#D4AF37]"
      />
      {IconCmp && (
        <IconCmp
          size={96}
          stroke={1.2}
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-4 right-4 text-[#D4AF37]/10"
        />
      )}
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D4AF37]">{eyebrow}</p>
          )}
          <h1 className="mt-1 font-serif text-3xl font-semibold text-white">{title}</h1>
          {description && <p className="mt-2 text-sm leading-relaxed text-white/65">{description}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
      </div>
    </header>
  );
}
