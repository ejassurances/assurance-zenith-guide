import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* Bloc « Risque LCB-FT » de l'onglet Conformité (score de risque, distinct du score KYC). */

type Facteur = { code: string; libelle: string; points: number };

type Risque = {
  score_risque: number;
  niveau_vigilance: "simplifiee" | "standard" | "renforcee";
  facteurs: Facteur[] | null;
  ppe_detecte: boolean;
  justification: string | null;
  decide_le: string | null;
  statut: string;
  prochaine_revue_le: string | null;
};

const NIVEAU_LABEL: Record<Risque["niveau_vigilance"], string> = {
  simplifiee: "Vigilance simplifiée",
  standard: "Vigilance standard",
  renforcee: "Vigilance renforcée",
};

const NIVEAU_STYLE: Record<Risque["niveau_vigilance"], string> = {
  simplifiee: "bg-emerald-100 text-emerald-900 border-emerald-300",
  standard: "bg-amber-100 text-amber-900 border-amber-300",
  renforcee: "bg-red-100 text-red-900 border-red-300",
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export function RisqueLcbftCard({ clientId }: { clientId: string }) {
  const [risque, setRisque] = useState<Risque | null>(null);
  const [validationEnAttente, setValidationEnAttente] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [r, t] = await Promise.all([
        supabase
          .from("client_risque_lcbft")
          .select(
            "score_risque,niveau_vigilance,facteurs,ppe_detecte,justification,decide_le,statut,prochaine_revue_le",
          )
          .eq("client_id", clientId)
          .maybeSingle(),
        supabase
          .from("taches")
          .select("id")
          .eq("client_id", clientId)
          .in("statut", ["a_faire", "en_cours"])
          .ilike("titre", "Vigilance renforcée à valider%")
          .limit(1)
          .maybeSingle(),
      ]);
      setRisque((r.data as unknown as Risque | null) ?? null);
      setValidationEnAttente(Boolean(t.data));
      setLoading(false);
    })();
  }, [clientId]);

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-medium">Risque LCB-FT</h3>
          <p className="text-xs text-ink-muted">
            Score de risque réglementaire (distinct du score de complétude KYC), recalculé à chaque contrôle sanctions
            &amp; PPE.
          </p>
        </div>
        {risque && (
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${NIVEAU_STYLE[risque.niveau_vigilance]}`}
          >
            {risque.score_risque}/100 · {NIVEAU_LABEL[risque.niveau_vigilance]}
          </span>
        )}
      </div>

      {!risque && (
        <p className="mt-4 text-sm text-ink-muted">
          Aucune évaluation de risque : lancez une vérification sanctions &amp; PPE pour la calculer.
        </p>
      )}

      {risque && (
        <>
          {risque.ppe_detecte && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-semibold">Personne politiquement exposée — vigilance renforcée de plein droit</p>
              <p className="mt-1 text-xs">
                Application immédiate, sans seuil de déclenchement : mesures de vigilance renforcée et autorisation d'un
                membre de la direction obligatoires.
              </p>
            </div>
          )}

          {risque.niveau_vigilance === "renforcee" && !risque.decide_le && (
            <div className="mt-4 rounded-xl border-2 border-red-500 bg-red-100 p-4 text-sm text-red-900">
              <p className="font-semibold">⛔ Validation hiérarchique requise avant toute souscription</p>
              <p className="mt-1 text-xs">
                {validationEnAttente
                  ? "Une tâche « Vigilance renforcée à valider » est ouverte : un membre de la direction doit confirmer et documenter sa décision."
                  : "La décision d'un membre de la direction n'est pas encore documentée pour ce client."}
              </p>
            </div>
          )}

          <ul className="mt-4 space-y-2">
            {(risque.facteurs ?? []).length === 0 && (
              <li className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-muted">
                Aucun facteur de risque retenu.
              </li>
            )}
            {(risque.facteurs ?? []).map((f, i) => (
              <li
                key={`${f.code}-${i}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-xs"
              >
                <span>{f.libelle}</span>
                <span className="whitespace-nowrap font-semibold">+{f.points} pts</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 grid gap-2 text-xs text-ink-muted sm:grid-cols-2">
            <p>
              Prochaine revue : <span className="font-semibold text-ink">{fmt(risque.prochaine_revue_le)}</span>
              {risque.statut === "a_reviser" && <span className="ml-1 text-red-800 font-semibold">(à réviser)</span>}
            </p>
            <p>
              Décision direction :{" "}
              <span className="font-semibold text-ink">
                {risque.decide_le ? `documentée le ${fmt(risque.decide_le)}` : "non documentée"}
              </span>
            </p>
          </div>

          {risque.justification && (
            <p className="mt-3 rounded-xl border border-line bg-surface p-3 text-xs">{risque.justification}</p>
          )}

          <p className="mt-3 text-xs text-ink-muted">
            Périodicité de revue : renforcée 1 an · standard 3 ans · simplifiée 5 ans.
          </p>
        </>
      )}
    </div>
  );
}
