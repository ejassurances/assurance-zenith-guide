/**
 * Gabarit de tableau de bord : grille de cartes KPI/graphiques homogène.
 */
export function DashboardGrid({
  colonnes = 3,
  children,
}: {
  colonnes?: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  const classe =
    colonnes === 2
      ? "sm:grid-cols-2"
      : colonnes === 4
        ? "sm:grid-cols-2 xl:grid-cols-4"
        : "sm:grid-cols-2 xl:grid-cols-3";
  return <div className={"grid min-w-0 gap-4 " + classe}>{children}</div>;
}

/** Carte de tableau de bord (titre, valeur mise en avant, contenu libre). */
export function DashboardCard({
  titre,
  valeur,
  variation,
  children,
  className = "",
}: {
  titre: string;
  valeur?: React.ReactNode;
  variation?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"crm-card min-w-0 p-5 " + className}>
      <p className="crm-eyebrow">{titre}</p>
      {valeur !== undefined && <p className="crm-figure mt-2 text-3xl">{valeur}</p>}
      {variation && <p className="mt-1 text-xs text-ink-muted">{variation}</p>}
      {children && <div className="mt-4 min-w-0">{children}</div>}
    </section>
  );
}
