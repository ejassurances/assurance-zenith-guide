/**
 * Rapprochement mensuel « attendu vs reçu » des commissions.
 * Lecture seule : aucune écriture, l'écart est présenté à l'humain.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  rapprocherMois,
  totauxRapprochement,
  type CommissionRecue,
  type ContratRapprochement,
  type EcartCategorie,
  type PrevisionRapprochement,
} from "@/lib/commission-rapprochement";

const LIBELLE: Record<EcartCategorie, string> = {
  manquante: "Non perçue",
  sous_percue: "Sous-perçue",
  sur_percue: "Sur-perçue / hors prévisionnel",
  conforme: "Conforme",
};

const STYLE: Record<EcartCategorie, string> = {
  manquante: "bg-red-100 text-red-900",
  sous_percue: "bg-amber-100 text-amber-900",
  sur_percue: "bg-sky-100 text-sky-900",
  conforme: "bg-emerald-100 text-emerald-900",
};

const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function moisCourant() {
  return new Date().toISOString().slice(0, 7);
}

/** 12 derniers mois, du plus récent au plus ancien. */
function derniersMois(): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  }
  return out;
}

export function CommissionRapprochementPanel() {
  const [mois, setMois] = useState(moisCourant());
  const [previsions, setPrevisions] = useState<PrevisionRapprochement[]>([]);
  const [commissions, setCommissions] = useState<CommissionRecue[]>([]);
  const [contrats, setContrats] = useState<ContratRapprochement[]>([]);
  const [loading, setLoading] = useState(true);
  const [masquerConformes, setMasquerConformes] = useState(true);

  useEffect(() => {
    let annule = false;
    setLoading(true);
    (async () => {
      const [p, c, k] = await Promise.all([
        supabase
          .from("commission_previsions")
          .select(
            "contrat_id,branche,montant_mensuel_estime,montant_mensuel_reel,periodicite,reduction_courtage_pct,statut",
          )
          .not("contrat_id", "is", null),
        supabase.from("commissions").select("contrat_id,montant,statut,date_versement").not("contrat_id", "is", null),
        supabase
          .from("contrats")
          .select("id,numero,assureur,produit,statut,date_effet,clients(nom,prenom)")
          .order("date_effet", { ascending: false }),
      ]);
      if (annule) return;
      setPrevisions((p.data as unknown as PrevisionRapprochement[]) ?? []);
      setCommissions((c.data as unknown as CommissionRecue[]) ?? []);
      const rows = (k.data ?? []) as unknown as (ContratRapprochement & {
        clients: { nom: string | null; prenom: string | null } | null;
      })[];
      setContrats(
        rows.map((r) => ({
          ...r,
          client_nom: [r.clients?.nom, r.clients?.prenom].filter(Boolean).join(" ") || null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      annule = true;
    };
  }, []);

  const lignes = useMemo(
    () => rapprocherMois({ mois, previsions, commissions, contrats }),
    [mois, previsions, commissions, contrats],
  );
  const totaux = useMemo(() => totauxRapprochement(lignes), [lignes]);
  const visibles = masquerConformes ? lignes.filter((l) => l.categorie !== "conforme") : lignes;

  return (
    <section className="mt-8 crm-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="crm-eyebrow">Contrôle des encaissements</p>
          <h2 className="mt-1 font-serif text-lg text-ink">Rapprochement attendu / reçu</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Commissions prévues sur les contrats comparées à celles enregistrées sur le mois choisi.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={masquerConformes}
              onChange={(e) => setMasquerConformes(e.target.checked)}
            />
            Masquer les lignes conformes
          </label>
          <select
            value={mois}
            onChange={(e) => setMois(e.target.value)}
            className="rounded-sm border border-line bg-background px-3 py-2 text-sm"
            aria-label="Mois de rapprochement"
          >
            {derniersMois().map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-sm border border-line p-3">
          <p className="text-xs text-ink-muted">Attendu</p>
          <p className="text-sm font-semibold text-ink">{euros(totaux.attendu)}</p>
        </div>
        <div className="rounded-sm border border-line p-3">
          <p className="text-xs text-ink-muted">Reçu</p>
          <p className="text-sm font-semibold text-ink">{euros(totaux.recu)}</p>
        </div>
        <div className="rounded-sm border border-line p-3">
          <p className="text-xs text-ink-muted">Manque à encaisser</p>
          <p className="text-sm font-semibold text-ink">{euros(totaux.manquant)}</p>
        </div>
        <div className="rounded-sm border border-line p-3">
          <p className="text-xs text-ink-muted">À vérifier</p>
          <p className="text-sm font-semibold text-ink">
            {totaux.nbManquantes} non perçue(s) · {totaux.nbEcarts} écart(s)
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-ink-muted">Chargement…</p>
      ) : visibles.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          Aucun écart sur {mois} : toutes les commissions attendues correspondent aux commissions enregistrées.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2">Contrat</th>
                <th className="px-3 py-2">Compagnie</th>
                <th className="px-3 py-2">Attendu</th>
                <th className="px-3 py-2">Reçu</th>
                <th className="px-3 py-2">Écart</th>
                <th className="px-3 py-2">Situation</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((l) => (
                <tr key={l.contrat_id} className="border-b border-line/60">
                  <td className="px-3 py-2 text-ink">{l.libelle}</td>
                  <td className="px-3 py-2 text-ink-muted">{l.assureur ?? "—"}</td>
                  <td className="px-3 py-2">{euros(l.attendu)}</td>
                  <td className="px-3 py-2">{euros(l.recu)}</td>
                  <td className={"px-3 py-2 font-medium " + (l.ecart < 0 ? "text-red-700" : "text-ink")}>
                    {euros(l.ecart)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={"rounded-full px-2 py-0.5 text-xs " + STYLE[l.categorie]}>
                      {LIBELLE[l.categorie]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
