import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtEuros } from "@/lib/commissions-bareme";
import {
  repartirTresorerie,
  previsionsSynthetiques,
  COLONNES_PREVISION,
  type CommissionPrevision,
  type ContratPourPrevision,
  type CommissionEncaissee,
} from "@/lib/commission-previsions";

/** Trésorerie prévisionnelle : commissions grossiste attendues, réparties par année. */
export function TresoreriePrevisionnelle() {
  const [previsions, setPrevisions] = useState<CommissionPrevision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data }, { data: contrats }, { data: commissions }] = await Promise.all([
        supabase.from("commission_previsions").select(COLONNES_PREVISION),

        supabase
          .from("contrats")
          .select("id,dossier_id,compagnie_id,is_emprunteur,statut,date_effet,duree_mois,prime_annuelle,fractionnement"),
        supabase.from("commissions").select("contrat_id,montant,date_versement,statut"),
      ]);
      const base = (data as unknown as CommissionPrevision[]) ?? [];
      setPrevisions([
        ...base,
        ...previsionsSynthetiques(
          (contrats as unknown as ContratPourPrevision[]) ?? [],
          (commissions as unknown as CommissionEncaissee[]) ?? [],
          base,
        ),
      ]);
      setLoading(false);
    })();
  }, []);

  const lignes = useMemo(() => repartirTresorerie(previsions), [previsions]);

  const total = lignes.reduce((s, l) => s + l.montant, 0);

  return (
    <section className="crm-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-medium text-ink">Trésorerie prévisionnelle</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Commissions attendues des compagnies : montant réel du dernier bordereau si connu, sinon estimation
            issue du devoir de conseil, réparti mois par mois sur les années à venir.
          </p>
        </div>
        <p className="font-serif text-2xl font-medium text-ink">{fmtEuros(total)}</p>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-ink-muted">Chargement…</p>
      ) : lignes.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-line p-4 text-sm text-ink-muted">
          Aucune commission prévisionnelle enregistrée : confirmez l'estimation à la validation d'un devoir de
          conseil.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-left">Année</th>
                <th className="px-3 py-2 text-right">Montant prévisionnel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lignes.map((l) => (
                <tr key={l.annee}>
                  <td className="px-3 py-2">{l.annee}</td>
                  <td className="px-3 py-2 text-right font-medium">{fmtEuros(l.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
