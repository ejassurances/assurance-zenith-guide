import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fmtEuros } from "@/lib/commissions-bareme";

/**
 * Commissions du mois en cours : montants réellement versés par les compagnies
 * (table commissions), et non une estimation de barème — pour que le chiffre
 * soit identique à celui de la comptabilité et de la page Commissions.
 */
export function CommissionMoisCard() {
  const { role } = useAuth();
  const staff = role === "admin" || role === "mandataire";
  const [total, setTotal] = useState<number | null>(null);
  const [nb, setNb] = useState(0);

  useEffect(() => {
    if (!staff) return;
    (async () => {
      const now = new Date();
      const debut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("commissions")
        .select("montant")
        .eq("statut", "versee")
        .gte("date_versement", debut)
        .lte("date_versement", fin);
      const rows = (data as { montant: number | null }[]) ?? [];
      setNb(rows.length);
      setTotal(rows.reduce((s, r) => s + Number(r.montant ?? 0), 0));
    })();
  }, [staff]);

  if (!staff || total === null) return null;

  const mois = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="mt-6 crm-card flex flex-wrap items-end justify-between gap-3 p-5">
      <div>
        <p className="crm-eyebrow">Commissions encaissées ce mois</p>
        <p className="mt-1 text-xs text-ink-muted">
          {mois} · {nb} ligne{nb > 1 ? "s" : ""} de bordereau
        </p>
      </div>
      <p className="crm-figure text-2xl text-[color:var(--crm-gold-muted)]">{fmtEuros(total)}</p>
    </div>
  );
}
