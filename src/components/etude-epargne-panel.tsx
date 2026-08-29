import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { derniereEtudeEpargne, lancerEtudeEpargne } from "@/lib/etudes.functions";

type Projection = {
  annees: number;
  valeur_actuel: number | null;
  valeur_cabinet: number;
  ecart_euros: number | null;
  ecart_pct: number | null;
};

type Comparatif = {
  disponible?: boolean;
  motif?: string | null;
  rendement_brut_pct?: number | null;
  rendement_net_actuel_pct?: number | null;
  rendement_net_cabinet_pct?: number | null;
  gain_annuel_points?: number | null;
  retrospective?: {
    annees: number;
    valeur_constatee: number;
    valeur_avec_nos_frais: number;
    gain_euros: number;
    gain_pct: number;
  } | null;
  projections?: Projection[];
};

type Etude = {
  id: string;
  statut: string;
  motif_indisponibilite: string | null;
  profil_risque: string | null;
  contrat_actuel: Record<string, unknown> | null;
  offre_cabinet: Record<string, unknown> | null;
  hypotheses: Record<string, unknown> | null;
  comparatif: Comparatif | null;
  created_at: string;
};

const euro = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`;
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v.toLocaleString("fr-FR")} %`;

/**
 * Étude épargne (assurance-vie / PER) : comparatif de frais à rendement
 * constaté identique et projections 3 / 8 / 10 ans. Aide à la décision : le
 * devoir de conseil reste rédigé et validé par le conseiller.
 */
export function EtudeEpargnePanel({ dossierId }: { dossierId: string }) {
  const lire = useServerFn(derniereEtudeEpargne);
  const lancer = useServerFn(lancerEtudeEpargne);
  const [etude, setEtude] = useState<Etude | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charger = async () => {
    try {
      const res = (await lire({ data: { dossier_id: dossierId } })) as { etude: Etude | null };
      setEtude(res.etude);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture impossible");
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId]);

  const produire = async () => {
    setBusy(true);
    setError(null);
    try {
      await lancer({ data: { dossier_id: dossierId } });
      await charger();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Étude impossible");
    } finally {
      setBusy(false);
    }
  };

  const c = etude?.comparatif ?? null;
  const projections = c?.projections ?? [];

  return (
    <section className="crm-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="crm-eyebrow text-base">Étude épargne (assurance-vie / PER)</h2>
          <p className="text-sm text-ink-muted">
            {etude
              ? `Dernière étude le ${new Date(etude.created_at).toLocaleString("fr-FR")}.`
              : "Aucune étude produite pour ce dossier."}
          </p>
        </div>
        <button
          type="button"
          onClick={produire}
          disabled={busy}
          className="rounded-lg bg-[#0A192F] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#0A192F]/90 disabled:opacity-50"
        >
          {busy ? "Étude en cours…" : etude ? "Relancer l'étude" : "Produire l'étude"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {etude && etude.statut !== "produite" && (
        <p className="mt-3 text-sm text-amber-700">
          {etude.motif_indisponibilite ?? "Étude non disponible en l'état."}
        </p>
      )}

      {c?.disponible && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Info label="Rendement brut constaté" valeur={pct(c.rendement_brut_pct)} />
            <Info label="Net contrat actuel" valeur={pct(c.rendement_net_actuel_pct)} />
            <Info label="Net avec notre offre" valeur={pct(c.rendement_net_cabinet_pct)} />
          </div>

          {c.retrospective && (
            <p className="rounded-lg bg-surface-elevated p-4 text-sm text-ink">
              Sur les {c.retrospective.annees} dernière(s) année(s), avec nos frais votre épargne
              aurait atteint <strong>{euro(c.retrospective.valeur_avec_nos_frais)}</strong> au lieu de{" "}
              {euro(c.retrospective.valeur_constatee)}, soit{" "}
              <strong>
                {euro(c.retrospective.gain_euros)} ({pct(c.retrospective.gain_pct)})
              </strong>{" "}
              de plus.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-[0.12em] text-ink-muted">
                  <th className="py-2">Horizon</th>
                  <th className="py-2">Contrat actuel</th>
                  <th className="py-2">Notre offre</th>
                  <th className="py-2">Écart</th>
                </tr>
              </thead>
              <tbody>
                {projections.map((p) => (
                  <tr key={p.annees} className="border-b border-line/60">
                    <td className="py-2">{p.annees} ans</td>
                    <td className="py-2">{euro(p.valeur_actuel)}</td>
                    <td className="py-2 font-medium text-ink">{euro(p.valeur_cabinet)}</td>
                    <td className="py-2">
                      {euro(p.ecart_euros)}
                      {p.ecart_pct !== null && p.ecart_pct !== undefined ? ` (${pct(p.ecart_pct)})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-ink-muted">
            Hypothèses : rendement brut réellement constaté sur le contrat actuel, frais issus du
            catalogue produits du cabinet. Aucune performance n'est garantie ; les unités de compte
            présentent un risque de perte en capital.
          </p>
        </div>
      )}
    </section>
  );
}

function Info({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="rounded-lg bg-surface-elevated p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{valeur}</p>
    </div>
  );
}
