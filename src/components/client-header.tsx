/**
 * En-tête de fiche client : bandeau bleu nuit, carré doré aux initiales,
 * badges de statut inline et ligne de contexte. Affichage uniquement.
 */

const STATUT_BADGE: Record<string, string> = {
  prospect: "border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#F4E3AE]",
  actif: "border-emerald-400/50 bg-emerald-400/15 text-emerald-200",
  client: "border-emerald-400/50 bg-emerald-400/15 text-emerald-200",
  perdu: "border-red-400/50 bg-red-400/15 text-red-200",
  inactif: "border-white/25 bg-white/10 text-white/70",
};

function initiales(prenom: string | null | undefined, nom: string) {
  const a = (prenom ?? "").trim().charAt(0);
  const b = nom.trim().charAt(0);
  return (a + b || b || "?").toUpperCase();
}

export function ClientHeader({
  prenom,
  nom,
  fullName,
  statut,
  reference,
  branche,
  conseiller,
  children,
}: {
  prenom: string | null;
  nom: string;
  fullName: string;
  statut: string;
  reference: string;
  branche?: string | null;
  conseiller?: string | null;
  children?: React.ReactNode;
}) {
  const badge = STATUT_BADGE[statut] ?? STATUT_BADGE.inactif;
  const contexte = [
    `Dossier ${reference}`,
    branche ? `Branche : ${branche}` : null,
    conseiller ? `Conseiller : ${conseiller}` : "Conseiller : non assigné",
  ].filter(Boolean);

  return (
    <header className="rounded-[var(--radius)] bg-[#0A192F] p-6 text-white shadow-[0_16px_40px_-24px_rgb(10_25_47/0.8)]">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-4">
          <div
            className="flex size-16 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[#D4AF37] font-serif text-2xl font-semibold text-[#0A192F]"
            aria-hidden="true"
          >
            {initiales(prenom, nom)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl font-semibold text-white">{fullName}</h1>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${badge}`}
              >
                {statut}
              </span>
            </div>
            <p className="mt-2 text-xs text-white/60">{contexte.join(" · ")}</p>
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-4">{children}</div>}
      </div>
    </header>
  );
}
