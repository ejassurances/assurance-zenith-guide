import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { analyserRecueil } from "@/lib/analyse-recueil.functions";

type Analyse = {
  synthese: string;
  besoins_prioritaires: string[];
  points_de_vigilance: string[];
  garanties_recommandees: string[];
  prochaine_action: string;
  recueil_complet: boolean;
  informations_manquantes: string[];
};

function Liste({ titre, items }: { titre: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{titre}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">
        {items.map((i, k) => (
          <li key={k}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Analyse Gemini du recueil des besoins : synthèse, besoins prioritaires,
 * points de vigilance et garanties à étudier. Aide à la décision, relue par
 * le conseiller avant toute production de devoir de conseil.
 */
export function AnalyseRecueilPanel({
  dossierId,
  analyseInitiale,
  analyseLe,
  onAnalyse,
}: {
  dossierId: string;
  analyseInitiale?: Analyse | null;
  analyseLe?: string | null;
  onAnalyse?: () => void;
}) {
  const lancerAnalyse = useServerFn(analyserRecueil);
  const [analyse, setAnalyse] = useState<Analyse | null>(analyseInitiale ?? null);
  const [date, setDate] = useState<string | null>(analyseLe ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lancer = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = (await lancerAnalyse({ data: { dossier_id: dossierId } })) as {
        analyse: Analyse;
      };
      setAnalyse(res.analyse);
      setDate(new Date().toISOString());
      onAnalyse?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'analyse n'a pas pu être réalisée");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="crm-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="crm-eyebrow text-base">Analyse IA du recueil</h2>
          <p className="text-sm text-ink-muted">
            {date
              ? `Dernière analyse le ${new Date(date).toLocaleString("fr-FR")}.`
              : "Aucune analyse produite pour ce recueil."}
          </p>
        </div>
        <button
          type="button"
          onClick={lancer}
          disabled={busy}
          className="rounded-lg bg-[#0A192F] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0A192F]/90 disabled:opacity-50"
        >
          {busy ? "Analyse en cours…" : analyse ? "Relancer l'analyse" : "Analyser le recueil"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {analyse && (
        <div className="mt-4 rounded-lg bg-surface-elevated p-4">
          <p className="whitespace-pre-wrap text-sm text-ink">{analyse.synthese}</p>
          <Liste titre="Besoins prioritaires" items={analyse.besoins_prioritaires} />
          <Liste titre="Points de vigilance" items={analyse.points_de_vigilance} />
          <Liste titre="Garanties à étudier" items={analyse.garanties_recommandees} />
          <Liste titre="Informations manquantes" items={analyse.informations_manquantes} />
          {analyse.prochaine_action && (
            <p className="mt-3 text-sm font-medium text-ink">
              Prochaine action : {analyse.prochaine_action}
            </p>
          )}
          {!analyse.recueil_complet && (
            <p className="mt-2 text-xs text-amber-700">
              Recueil jugé incomplet : le statut du dossier n'a pas été avancé.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
