/**
 * En-tête de l'espace client (portail) : bandeau bleu nuit, carré doré aux
 * initiales, salutation et ligne de contexte. Affichage uniquement.
 */

function initiales(prenom: string | null | undefined, nom: string | null | undefined, fallback: string) {
  const a = (prenom ?? "").trim().charAt(0);
  const b = (nom ?? "").trim().charAt(0);
  const i = (a + b).trim();
  return (i || fallback.trim().charAt(0) || "?").toUpperCase();
}

export function ClientPortalHeader({
  prenom,
  nom,
  email,
  contexte,
  children,
}: {
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
  /** Éléments de contexte (référence dossier, conseiller, etc.). */
  contexte?: (string | null | undefined)[];
  children?: React.ReactNode;
}) {
  const nomComplet = `${prenom ?? ""} ${nom ?? ""}`.trim() || (email ?? "");
  const lignes = (contexte ?? []).filter(Boolean) as string[];

  return (
    <header className="relative overflow-hidden rounded-[var(--radius)] bg-[#0A192F] p-6 text-white shadow-[0_16px_40px_-24px_rgb(10_25_47/0.8)]">
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[#D4AF37]" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[#D4AF37] font-serif text-2xl font-semibold text-[#0A192F]"
            aria-hidden="true"
          >
            {initiales(prenom, nom, email ?? "?")}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D4AF37]">Espace client</p>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-white">Bonjour {nomComplet}</h1>
            <p className="mt-2 text-sm text-white/65">
              Votre espace personnel : contrats, projets, documents et contact conseiller.
            </p>
            {lignes.length > 0 && <p className="mt-2 text-xs text-white/50">{lignes.join(" · ")}</p>}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
      </div>
    </header>
  );
}
