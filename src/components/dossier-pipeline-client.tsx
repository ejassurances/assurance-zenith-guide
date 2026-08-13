import { ETAPES, etapeDef, etapeIndex } from "@/lib/pipeline-dossier";

/**
 * Pipeline en lecture seule pour l'espace client : même affichage horizontal
 * que le back-office, mais les étapes internes au cabinet (étude & devis)
 * sont masquées.
 */

/** Étapes réservées au cabinet, invisibles côté client. */
const ETAPES_INTERNES = ["devis_en_cours"];

export function DossierPipelineClient({ statut }: { statut: string }) {
  const def = etapeDef(statut);
  const courantGlobal = etapeIndex(statut);
  const visibles = ETAPES.filter((e) => !ETAPES_INTERNES.includes(e.key));

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-base text-ink">Avancement de votre dossier</h3>
        <span className="rounded-full border border-line bg-background px-3 py-1 text-xs text-ink-soft">
          Étape actuelle : {def?.label ?? statut}
        </span>
      </div>

      <div className="-mx-1 mt-5 overflow-x-auto pb-2">
        <ol className="flex min-w-max items-start gap-0 px-1">
          {visibles.map((e, i) => {
            const idx = etapeIndex(e.key);
            const active = e.key === statut;
            const passee = courantGlobal >= 0 && idx < courantGlobal;
            return (
              <li key={e.key} className="relative flex w-[124px] shrink-0 flex-col items-center text-center">
                {i > 0 && (
                  <span
                    className={
                      "absolute left-0 top-[13px] h-[2px] w-1/2 -translate-x-1/2 " +
                      (passee || active ? "bg-ink" : "bg-line")
                    }
                  />
                )}
                {i < visibles.length - 1 && (
                  <span
                    className={
                      "absolute right-0 top-[13px] h-[2px] w-1/2 translate-x-1/2 " + (passee ? "bg-ink" : "bg-line")
                    }
                  />
                )}
                <span
                  title={e.description}
                  className={
                    "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-medium " +
                    (active
                      ? "border-ink bg-ink text-primary-foreground ring-4 ring-ink/10"
                      : passee
                        ? "border-ink bg-ink text-primary-foreground"
                        : "border-line bg-background text-ink-muted")
                  }
                >
                  {passee ? "✓" : i + 1}
                </span>
                <p
                  className={
                    "mt-2 px-1 text-[11px] leading-tight " +
                    (active ? "font-medium text-ink" : passee ? "text-ink-soft" : "text-ink-muted")
                  }
                >
                  {e.label}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      {def && (
        <p className="mt-1 text-xs text-ink-muted">
          {def.horsParcours ? `Statut particulier : ${def.label} — ${def.description}` : def.description}
        </p>
      )}
    </div>
  );
}
