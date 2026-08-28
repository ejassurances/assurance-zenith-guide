/**
 * Gabarit d'espace de travail d'une entité : en-tête + sous-navigation
 * verticale + contenu. Réutilise `SectionNav` (sélecteur compact sur mobile).
 */
import { SectionNav, type SectionNavItem } from "@/components/section-nav";

export function EntityWorkspace<T extends string>({
  header,
  sections,
  active,
  onSelect,
  navTitle,
  children,
}: {
  header?: React.ReactNode;
  sections: SectionNavItem<T>[];
  active: T;
  onSelect: (key: T) => void;
  navTitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      {header}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <SectionNav title={navTitle} items={sections} active={active} onSelect={onSelect} />
        </div>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
