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
  createdAt,
  dateNaissance,
  contratsActifs = 0,
  primeAnnuelle = 0,
  children,
}: {
  prenom: string | null;
  nom: string;
  fullName: string;
  statut: string;
  reference: string;
  branche?: string | null;
  conseiller?: string | null;
  createdAt?: string | null;
  dateNaissance?: string | null;
  contratsActifs?: number;
  primeAnnuelle?: number;
  children?: React.ReactNode;
}) {
  const badge = STATUT_BADGE[statut] ?? STATUT_BADGE.inactif;
  const contexte = [
    `Dossier ${reference}`,
    branche ? `Branche : ${branche}` : null,
    conseiller ? `Conseiller : ${conseiller}` : "Conseiller : non assigné",
  ].filter(Boolean);
  const age = dateNaissance
    ? Math.max(0, Math.floor((Date.now() - new Date(dateNaissance).getTime()) / 31_557_600_000))
    : null;

  return (
    <header className="crm-card overflow-hidden border-t-2 border-t-[color:var(--crm-gold)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--crm-navy)] text-sm font-bold text-primary-foreground"
            aria-hidden="true"
          >
            {initiales(prenom, nom)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate font-sans text-xl font-bold text-ink">{fullName}</h1>
              {age !== null && <span className="text-xs text-ink-muted">({age} ans)</span>}
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${badge}`}
              >
                {statut}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {contexte.join(" · ")}
              {createdAt ? ` · Ajouté le ${new Date(createdAt).toLocaleDateString("fr-FR")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-4">
          <div className="hidden items-center gap-5 border-r border-line pr-4 sm:flex">
            <div className="text-center"><p className="crm-eyebrow">Contrats</p><p className="text-base font-bold text-ink">{contratsActifs}</p></div>
            <div className="text-center"><p className="crm-eyebrow">Prime annuelle</p><p className="text-base font-bold text-ink">{primeAnnuelle.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €</p></div>
          </div>
          {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
        </div>
      </div>
    </header>
  );
}
