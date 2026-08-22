import { etapeDef } from "@/lib/pipeline-dossier";
import { PHASES_CLIENT, phaseClient, phaseClientIndex } from "@/lib/pipeline-client";

/**
 * Pipeline en lecture seule pour l'espace client : les statuts internes
 * détaillés sont regroupés en 4 grandes étapes (entrée en relation, étude
 * d'assurance, souscription, contrat actif). Le détail complet reste visible
 * uniquement côté back-office.
 */

export function DossierPipelineClient({ statut }: { statut: string }) {
  const courant = phaseClientIndex(statut);
  const phase = phaseClient(statut);
  const def = etapeDef(statut);

  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-base text-ink">Avancement de votre dossier</h3>
        <span className="rounded-full border border-line bg-background px-3 py-1 text-xs text-ink-soft">
          Étape actuelle : {phase?.label ?? def?.label ?? statut}
        </span>
      </div>

      <div className="-mx-1 mt-5 overflow-x-auto pb-2">
        <ol className="flex min-w-max items-start gap-0 px-1">
          {PHASES_CLIENT.map((p, i) => {
            const active = i === courant;
            const passee = courant >= 0 && i < courant;
            return (
              <li key={p.key} className="relative flex w-[160px] shrink-0 flex-col items-center text-center">
                {i > 0 && (
                  <span
                    className={
                      "absolute left-0 top-[13px] h-[2px] w-1/2 -translate-x-1/2 " +
                      (passee || active ? "bg-ink" : "bg-line")
                    }
                  />
                )}
                {i < PHASES_CLIENT.length - 1 && (
                  <span
                    className={
                      "absolute right-0 top-[13px] h-[2px] w-1/2 translate-x-1/2 " + (passee ? "bg-ink" : "bg-line")
                    }
                  />
                )}
                <span
                  title={p.description}
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
                  {p.label}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="mt-1 text-xs text-ink-muted">
        {phase
          ? phase.description
          : def
            ? `Statut particulier : ${def.label} — ${def.description}`
            : statut}
      </p>
    </div>
  );
}
