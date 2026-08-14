import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Option = { id: string; nom: string; prenom: string | null; reference: string };

/** Sélection facultative du client à l'origine (parrain / recommandeur). */
export function ClientOriginePicker({
  value,
  onChange,
  excludeId,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  excludeId?: string;
}) {
  const [options, setOptions] = useState<Option[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let actif = true;
    supabase
      .from("clients")
      .select("id,nom,prenom,reference")
      .order("nom", { ascending: true })
      .limit(500)
      .then(({ data }) => {
        if (actif) setOptions((data ?? []) as Option[]);
      });
    return () => {
      actif = false;
    };
  }, []);

  const liste = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return options
      .filter((o) => o.id !== excludeId)
      .filter((o) =>
        terme ? `${o.prenom ?? ""} ${o.nom} ${o.reference}`.toLowerCase().includes(terme) : true,
      )
      .slice(0, 50);
  }, [options, q, excludeId]);

  return (
    <div className="space-y-2">
      <span className="text-xs uppercase tracking-wide text-ink-muted">Client à l'origine (optionnel)</span>
      <input
        placeholder="Rechercher un client…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
      >
        <option value="">— Pas encore dans le CRM —</option>
        {liste.map((o) => (
          <option key={o.id} value={o.id}>
            {[o.prenom, o.nom].filter(Boolean).join(" ")} · {o.reference}
          </option>
        ))}
      </select>
    </div>
  );
}
