/**
 * Barre d'étapes horizontale du parcours emprunteur (0 → 11).
 * Présentation seule : aucun statut métier n'est modifié ici. Une étape
 * réglementaire n'est cochée que si son acte existe réellement.
 */
import {
  PARCOURS_EMPRUNTEUR,
  etapeAtteinte,
  etatEtape,
  parcoursEtape,
  type ParcoursKey,
  type PreuvesParcours,
} from "@/lib/parcours-emprunteur";

export function ParcoursEmprunteurNav({
  statut,
  active,
  onSelect,
  preuves,
  gele,
}: {
  statut: string;
  active: ParcoursKey;
  onSelect: (key: ParcoursKey) => void;
  preuves?: PreuvesParcours | null;
  gele?: boolean;
}) {
  const def = parcoursEtape(active);

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <h2 className="min-w-0 truncate font-serif text-lg font-medium text-ink">
          Parcours assurance emprunteur
        </h2>
        <span className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-soft">
          Étape {def?.numero ?? 0} / 11
        </span>
      </div>

      {gele && (
        <p className="mt-3 rounded-md border border-destructive/60 bg-destructive/10 px-3 py-2 text-xs text-ink">
          Dossier gelé — les étapes réglementaires restent bloquées.
        </p>
      )}

      <ol className="mt-4 flex flex-wrap gap-2">
        {PARCOURS_EMPRUNTEUR.map((e) => {
          const etat = etatEtape(e.key, statut, preuves);
          const courante = e.key === active;
          const reprise = etat === "reprise";
          const terminee = etat === "terminee";
          return (
            <li key={e.key} className="shrink-0">
              <button
                type="button"
                title={
                  reprise
                    ? `${e.description} — dossier repris de l'existant : acte non produit dans le logiciel.`
                    : e.description
                }
                onClick={() => onSelect(e.key)}
                className={
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition " +
                  (courante
                    ? "border-ink bg-ink text-primary-foreground"
                    : terminee
                      ? "border-accent/60 bg-accent/10 text-ink hover:bg-accent/20"
                      : reprise
                        ? "border-line bg-background text-ink-soft hover:border-ink/40"
                        : "border-line bg-background text-ink-muted hover:border-ink/40")
                }
              >
                <span
                  className={
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium " +
                    (courante
                      ? "border-primary-foreground/50"
                      : terminee
                        ? "border-accent text-ink"
                        : "border-line")
                  }
                >
                  {terminee && !courante ? "✓" : reprise && !courante ? "–" : e.numero}
                </span>
                <span className="whitespace-nowrap">{e.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {def && <p className="mt-1 text-xs text-ink-muted">{def.description}</p>}
      {preuves && def && etatEtape(def.key, statut, preuves) === "reprise" && (
        <p className="mt-3 rounded-md border border-line bg-background px-3 py-2 text-xs text-ink-soft">
          Dossier repris de l'existant : cette étape n'a pas d'acte archivé dans le logiciel
          (lettre de mission, devis ou devoir de conseil). Elle n'est donc pas comptée comme
          réalisée.
        </p>
      )}
      {def && !etapeAtteinte(def.key, statut) && (
        <p className="mt-3 rounded-md border border-accent/50 bg-accent/10 px-3 py-2 text-xs text-ink">
          Étape non encore atteinte : consultation possible, mais les étapes réglementaires
          (lettre de mission, devoir de conseil, signature) restent validées manuellement.
        </p>
      )}
    </div>
  );
}
