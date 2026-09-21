/**
 * Aperçu de la fiche client : contexte d'en-tête (branche, conseiller) et
 * cartes de synthèse (prime TTC annuelle, contrats actifs). Lecture seule.
 */
import { useEffect, useState } from "react";
import { IconFileEuro, IconFileCheck } from "@tabler/icons-react";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/stat-card";
import { labelForBranche } from "@/lib/recueil-besoins-schemas";

export type ClientContexte = { branche: string | null; conseiller: string | null };
export type ClientPortfolioStats = { primeTtc: number; actifs: number };

export function useClientContexte(clientId: string, commercialId: string | null): ClientContexte {
  const [ctx, setCtx] = useState<ClientContexte>({ branche: null, conseiller: null });

  useEffect(() => {
    let annule = false;
    (async () => {
      const [dossier, profil] = await Promise.all([
        supabase
          .from("dossiers")
          .select("type_assurance")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        commercialId
          ? supabase.from("profiles").select("full_name,email").eq("id", commercialId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const branche = (dossier.data as { type_assurance: string } | null)?.type_assurance ?? null;
      const p = profil.data as { full_name: string | null; email: string | null } | null;
      if (!annule) {
        setCtx({
          branche: branche ? labelForBranche(branche) : null,
          conseiller: p?.full_name || p?.email || null,
        });
      }
    })();
    return () => {
      annule = true;
    };
  }, [clientId, commercialId]);

  return ctx;
}

export function useClientPortfolioStats(clientId: string): ClientPortfolioStats {
  const [stats, setStats] = useState<ClientPortfolioStats>({ primeTtc: 0, actifs: 0 });

  useEffect(() => {
    let annule = false;
    (async () => {
      const { data } = await supabase
        .from("contrats")
        .select("prime_annuelle,statut")
        .eq("client_id", clientId);
      const rows = (data ?? []) as { prime_annuelle: number | null; statut: string }[];
      const enCours = rows.filter((r) => r.statut === "actif");
      if (!annule) {
        setStats({
          actifs: enCours.length,
          primeTtc: enCours.reduce((s, r) => s + Number(r.prime_annuelle ?? 0), 0),
        });
      }
    })();
    return () => {
      annule = true;
    };
  }, [clientId]);

  return stats;
}

export function ClientApercuCards({ clientId }: { clientId: string }) {
  const { primeTtc, actifs } = useClientPortfolioStats(clientId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard
        label="Prime TTC annuelle"
        value={`${primeTtc.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`}
        sub="Somme des contrats actifs"
        accent
        icon={IconFileEuro}
      />
      <StatCard label="Contrats actifs" value={actifs} sub="Portefeuille du client" icon={IconFileCheck} />
    </div>
  );
}
