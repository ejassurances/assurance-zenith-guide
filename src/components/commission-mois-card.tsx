import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCommissionBareme } from "@/hooks/use-commission-bareme";
import { fmtEuros } from "@/lib/commissions-bareme";

type Ligne = {
  id: string;
  is_emprunteur: boolean;
  compagnie_id: string | null;
  prime_annuelle: number | null;
  economie_realisee: number | null;
  statut: string;
};

/** Commissions du mois en cours (barème cabinet) — staff uniquement. */
export function CommissionMoisCard() {
  const { staff, loading, commissionContrat } = useCommissionBareme();
  const [rows, setRows] = useState<Ligne[]>([]);

  useEffect(() => {
    if (!staff) return;
    (async () => {
      const now = new Date();
      const debut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("contrats")
        .select("id,is_emprunteur,compagnie_id,prime_annuelle,economie_realisee,statut")
        .gte("date_effet", debut)
        .lte("date_effet", fin);
      setRows(((data ?? []) as Ligne[]).filter((r) => r.statut !== "annule" && r.statut !== "resilie"));
    })();
  }, [staff]);

  if (!staff || loading) return null;

  const total = rows.reduce((s, r) => s + commissionContrat(r).montant, 0);
  const mois = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="mt-6 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-line bg-surface-elevated p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Commissions du mois</p>
        <p className="mt-1 text-xs text-ink-muted">
          {mois} · {rows.length} contrat{rows.length > 1 ? "s" : ""} pris en compte (barème cabinet)
        </p>
      </div>
      <p className="font-serif text-2xl font-medium text-[color:var(--crm-gold,#D4AF37)]">{fmtEuros(total)}</p>
    </div>
  );
}
