import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCommissionBareme } from "@/hooks/use-commission-bareme";
import { fmtEuros } from "@/lib/commissions-bareme";

type Row = {
  id: string;
  numero: string | null;
  assureur: string;
  produit: string;
  date_effet: string | null;
  duree_mois: number | null;
  prime_annuelle: number | null;
  is_emprunteur: boolean;
  capital_initial: number | null;
  taux_assurance_annuel: number | null;
  statut: string;
  economie_realisee: number | null;
  compagnie_id: string | null;
};

export function ContratsTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("contrats")
      .select(
        "id,numero,assureur,produit,date_effet,duree_mois,prime_annuelle,is_emprunteur,capital_initial,taux_assurance_annuel,statut,economie_realisee",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [clientId]);

  async function createContrat(kind: "emprunteur" | "standard") {
    setCreating(true);
    const { data, error } = await supabase
      .from("contrats")
      .insert({
        client_id: clientId,
        assureur: "À définir",
        produit: kind === "emprunteur" ? "Assurance emprunteur" : "Nouveau contrat",
        is_emprunteur: kind === "emprunteur",
      } as never)
      .select("id")
      .single();
    setCreating(false);
    if (error) return alert(error.message);
    if (data) window.location.href = `/espace/contrats/${data.id}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl">Contrats</h2>
          <p className="text-xs text-ink-muted">
            Chaque contrat génère automatiquement son tableau de primes et commissions année par année.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={() => createContrat("emprunteur")}
              disabled={creating}
              className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              + Contrat emprunteur
            </button>
            <button
              onClick={() => createContrat("standard")}
              disabled={creating}
              className="rounded-md border border-line px-3 py-1.5 text-xs font-medium"
            >
              + Contrat standard
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-muted">
          Aucun contrat pour ce client.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2 text-left">Produit</th>
                <th className="px-3 py-2 text-left">Assureur</th>
                <th className="px-3 py-2 text-left">N° / Effet</th>
                <th className="px-3 py-2 text-right">Prime annuelle</th>
                <th className="px-3 py-2 text-right">Économie réalisée</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface/40">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.produit}</div>
                    {r.is_emprunteur && (
                      <div className="text-xs text-ink-muted">Emprunteur · {formatEuro(r.capital_initial)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{r.assureur}</td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    {r.numero ?? "—"}
                    <br />
                    {r.date_effet ? new Date(r.date_effet).toLocaleDateString("fr-FR") : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{formatEuro(r.prime_annuelle)}</td>
                  <td className="px-3 py-2 text-right">
                    {r.is_emprunteur && r.economie_realisee !== null ? (
                      <span className="font-medium text-[color:var(--crm-gold)]">{formatEuro(r.economie_realisee)}</span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs">{r.statut}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/espace/contrats/$id"
                      params={{ id: r.id }}
                      className="text-xs font-medium underline underline-offset-4"
                    >
                      Ouvrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatEuro(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
