import { SITE } from "@/lib/site";

export function Simulator() {
  return (
    <div className="rounded-2xl bg-surface-elevated p-4 shadow-sm ring-1 ring-black/5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-ink" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-ink">
            Simulateur — assurance emprunteur
          </h2>
        </div>
        <a
          href={SITE.simulatorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden text-xs font-medium text-ink-soft underline-offset-4 hover:underline sm:inline"
        >
          Ouvrir en plein écran ↗
        </a>
      </div>
      <div className="overflow-hidden rounded-xl bg-white ring-1 ring-line">
        <iframe
          src={SITE.simulatorUrl}
          title="Simulateur assurance emprunteur"
          loading="lazy"
          className="h-[900px] w-full border-0 md:h-[820px]"
        />
      </div>
      <p className="mt-4 text-xs italic text-ink-muted">
        Comparateur fourni via notre partenaire agréé. Un conseiller {SITE.shortName} vous rappelle
        ensuite pour finaliser votre dossier — étude et devis gratuits, sans engagement.
      </p>
    </div>
  );
}
