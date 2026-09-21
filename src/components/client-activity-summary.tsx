import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ActivitySummary = {
  id: string;
  type: string;
  titre: string | null;
  contenu: string | null;
  created_at: string;
};

export function ClientActivitySummary({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<ActivitySummary[]>([]);

  useEffect(() => {
    let active = true;
    void supabase
      .from("activites")
      .select("id,type,titre,contenu,created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (active) setItems((data ?? []) as ActivitySummary[]);
      });
    return () => { active = false; };
  }, [clientId]);

  return (
    <aside className="crm-card min-w-0 overflow-hidden xl:sticky xl:top-4 xl:self-start">
      <div className="border-b border-line px-4 py-3">
        <p className="crm-eyebrow">Résumé de la fiche</p>
      </div>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-xs text-ink-muted">Aucune activité enregistrée.</p>
        ) : (
          <ol className="ml-1 space-y-6 border-l-2 border-line pl-5">
            {items.map((item) => (
              <li key={item.id} className="relative">
                <span className="absolute -left-[1.62rem] top-1 size-2.5 rounded-full border-2 border-surface-elevated bg-[color:var(--crm-gold)]" />
                <p className="text-xs font-semibold text-ink">{item.titre || item.type}</p>
                <p className="mt-0.5 text-[10px] text-ink-muted">{new Date(item.created_at).toLocaleDateString("fr-FR")}</p>
                {item.contenu && <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-ink-soft">{item.contenu}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}