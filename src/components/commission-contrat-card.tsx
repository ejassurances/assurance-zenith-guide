import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCommissionBareme } from "@/hooks/use-commission-bareme";
import { BRANCHES_COMMISSION, decrireRegle, fmtEuros, LIBELLE_SOURCE } from "@/lib/commissions-bareme";

/** Commission cabinet calculée pour un contrat — visible staff uniquement. */
export function CommissionContratCard({
  dossierId,
  isEmprunteur,
  compagnieId,
  primeAnnuelle,
  primeNetteAnnuelle,
  economieRealisee,
}: {
  dossierId: string | null;
  isEmprunteur: boolean;
  compagnieId: string | null;
  primeAnnuelle: number | null;
  primeNetteAnnuelle: number | null;
  economieRealisee: number | null;
}) {
  const { staff, loading, commissionContrat } = useCommissionBareme();
  const [typeAssurance, setTypeAssurance] = useState<string | null>(null);
  const [economieDossier, setEconomieDossier] = useState<number | null>(null);

  useEffect(() => {
    if (!staff || !dossierId) return;
    (async () => {
      const { data } = await supabase
        .from("dossiers")
        .select("type_assurance, economie_estimee")
        .eq("id", dossierId)
        .maybeSingle();
      setTypeAssurance((data?.type_assurance as string | null) ?? null);
      setEconomieDossier(data?.economie_estimee != null ? Number(data.economie_estimee) : null);
    })();
  }, [staff, dossierId]);

  if (!staff || loading) return null;

  const { branche, regle, source, montant } = commissionContrat({
    is_emprunteur: isEmprunteur,
    type_assurance: typeAssurance,
    compagnie_id: compagnieId,
    prime_annuelle: primeAnnuelle,
    prime_nette_annuelle: primeNetteAnnuelle,
    economie_realisee: economieRealisee,
    economie_estimee: economieDossier,
  });
  const labelBranche = BRANCHES_COMMISSION.find((b) => b.value === branche)?.label ?? branche;

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-ink">Commission cabinet</h2>
          <p className="mt-1 text-xs text-ink-muted">
            {labelBranche} · {decrireRegle(regle)} ·{" "}
            <span className="rounded-full bg-background px-2 py-0.5">{LIBELLE_SOURCE[source]}</span>
          </p>
          {regle.notes && <p className="mt-1 text-xs text-ink-muted">{regle.notes}</p>}
          {regle.base_calcul === "prime" && (
            <p className="mt-1 text-[11px] text-ink-muted">
              Assiette : prime nette annuelle {primeNetteAnnuelle != null ? fmtEuros(primeNetteAnnuelle) : "non renseignée"}
              {regle.assiette_mensuelle ? " (soit la prime nette mensuelle pour une règle mensuelle)" : ""}.
            </p>
          )}
        </div>
        <p className="font-serif text-2xl font-medium text-ink">{fmtEuros(montant)}</p>
      </div>
      <p className="mt-3 text-[11px] text-ink-muted">Information interne — jamais visible par le client.</p>
    </section>
  );
}