import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { changerEtapeDossier } from "@/lib/devoir-conseil.functions";
import { ETAPES, ETAPES_HORS_PARCOURS, etapeDef, etapeIndex, etapeSuivante, type EtapeKey } from "@/lib/pipeline-dossier";

type HistoRow = {
  id: string;
  ancienne_etape: string | null;
  nouvelle_etape: string;
  commentaire: string | null;
  created_at: string;
};

export function DossierPipeline({
  dossierId,
  statut,
  canEdit,
  onChanged,
  onStepClick,
}: {
  dossierId: string;
  statut: string;
  canEdit: boolean;
  onChanged: () => void;
  onStepClick?: (key: EtapeKey) => void;
}) {
  const changer = useServerFn(changerEtapeDossier);
  const [histo, setHisto] = useState<HistoRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState("");

  const loadHisto = async () => {
    const { data } = await supabase
      .from("dossier_etapes_historique")
      .select("id, ancienne_etape, nouvelle_etape, commentaire, created_at")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false });
    setHisto((data ?? []) as HistoRow[]);
  };

  useEffect(() => {
    loadHisto();
  }, [dossierId, statut]);

  const courant = etapeIndex(statut);
  const def = etapeDef(statut);
  const suivante = etapeSuivante(statut);

  const appliquer = async (etape: string) => {
    setBusy(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await changer({ data: { dossier_id: dossierId, etape: etape as any, commentaire: commentaire || undefined } });
      setCommentaire("");
      await loadHisto();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-medium text-ink">Pipeline du projet</h2>
        <span className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft">
          Étape actuelle : {def?.label ?? statut}
        </span>
      </div>

      <div className="-mx-1 mt-5 overflow-x-auto pb-2">
        <ol className="flex min-w-max items-start gap-0 px-1">
          {ETAPES.map((e, i) => {
            const passee = courant >= 0 && i < courant;
            const active = e.key === statut;
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
                {i < ETAPES.length - 1 && (
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

      {def && !def.horsParcours && (
        <p className="mt-1 text-xs text-ink-muted">{def.description}</p>
      )}

      {def?.horsParcours && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Statut hors parcours nominal : {def.label} — {def.description}
        </p>
      )}

      {canEdit && (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          <input
            value={commentaire}
            onChange={(ev) => setCommentaire(ev.target.value)}
            placeholder="Commentaire (tracé dans l'historique, facultatif)"
            className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <div className="flex flex-wrap gap-2">
            {suivante && (
              <button
                onClick={() => appliquer(suivante.key)}
                disabled={busy}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Passer à « {suivante.label} »
              </button>
            )}
            <select
              value=""
              disabled={busy}
              onChange={(ev) => ev.target.value && appliquer(ev.target.value)}
              className="rounded-full border border-line bg-background px-3 py-2 text-sm"
            >
              <option value="">Forcer une autre étape…</option>
              {[...ETAPES, ...ETAPES_HORS_PARCOURS]
                .filter((e) => e.key !== "signe")
                .map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.label}
                  </option>
                ))}
            </select>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Historique (traçabilité ACPR)</p>
        <ul className="mt-2 space-y-1 text-xs text-ink-soft">
          {histo.length === 0 && <li className="text-ink-muted">Aucun changement d'étape enregistré.</li>}
          {histo.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-2 border-b border-line py-1">
              <span className="text-ink-muted">{new Date(h.created_at).toLocaleString("fr-FR")}</span>
              <span className="font-medium text-ink">
                {h.ancienne_etape ? `${etapeDef(h.ancienne_etape)?.label ?? h.ancienne_etape} → ` : ""}
                {etapeDef(h.nouvelle_etape)?.label ?? h.nouvelle_etape}
              </span>
              {h.commentaire && <span>· {h.commentaire}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
