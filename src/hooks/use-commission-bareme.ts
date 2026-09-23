import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  brancheContrat,
  calculerCommission,
  resoudreRegle,
  type RegleCommission,
} from "@/lib/commissions-bareme";

/**
 * Barème de commissions — lecture réservée au staff (RLS : admin / mandataire
 * uniquement, aucun accès client ou prescripteur).
 */
export function useCommissionBareme() {
  const { role } = useAuth();
  const staff = role === "admin" || role === "mandataire";
  const [regles, setRegles] = useState<RegleCommission[]>([]);
  const [loading, setLoading] = useState(staff);

  const reload = useCallback(async () => {
    if (!staff) {
      setRegles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("commission_bareme")
      .select("id,niveau,branche,compagnie_id,type,montant_fixe,taux_pourcentage,base_calcul,notes,periodicite");
    setRegles(((data ?? []) as unknown as RegleCommission[]).map((r) => ({ ...r })));
    setLoading(false);
  }, [staff]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Commission d'un contrat selon la règle applicable (branche + compagnie). */
  const commissionContrat = useCallback(
    (c: {
      is_emprunteur?: boolean | null;
      type_assurance?: string | null;
      compagnie_id?: string | null;
      prime_annuelle?: number | null;
      prime_nette_annuelle?: number | null;
      economie_realisee?: number | null;
      economie_estimee?: number | null;
    }) => {
      const branche = brancheContrat(c);
      const { regle, source } = resoudreRegle(regles, branche, c.compagnie_id ?? null);
      const primeNette = c.prime_nette_annuelle ?? null;
      const montant = calculerCommission(regle, {
        // Les commissions sont calculées sur la prime nette, jamais sur la prime totale.
        prime: primeNette,
        primeMensuelle: primeNette != null ? Number(primeNette) / 12 : null,
        economie: c.economie_realisee ?? c.economie_estimee ?? null,
      });
      return { branche, regle, source, montant };
    },
    [regles],
  );

  return { staff, regles, loading, reload, commissionContrat };
}
