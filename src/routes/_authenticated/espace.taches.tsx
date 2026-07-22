import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/espace/taches")({
  component: TachesPage,
});

type Tache = {
  id: string;
  client_id: string | null;
  titre: string;
  echeance: string | null;
  priorite: string;
  statut: string;
  created_at: string;
  clients: { reference: string; prenom: string | null; nom: string } | null;
};

function TachesPage() {
  const [items, setItems] = useState<Tache[]>([]);
  const [filter, setFilter] = useState<"all" | "a_faire" | "en_cours" | "terminee">("a_faire");

  const load = async () => {
    let q = supabase
      .from("taches")
      .select("id,client_id,titre,echeance,priorite,statut,created_at,clients(reference,prenom,nom)")
      .order("echeance", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("statut", filter);
    const { data } = await q;
    setItems((data ?? []) as unknown as Tache[]);
  };
  useEffect(() => {
    load();
  }, [filter]);

  const toggle = async (t: Tache) => {
    await supabase
      .from("taches")
      .update({ statut: t.statut === "terminee" ? "a_faire" : "terminee" })
      .eq("id", t.id);
    load();
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium text-ink">Tâches</h1>

      <div className="mt-6 flex gap-2">
        {(
          [
            ["a_faire", "À faire"],
            ["en_cours", "En cours"],
            ["terminee", "Terminées"],
            ["all", "Toutes"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={
              "rounded-full border px-3 py-1 text-xs " +
              (filter === k ? "border-ink bg-ink text-primary-foreground" : "border-line text-ink-soft hover:bg-surface")
            }
          >
            {l}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucune tâche.</p>
        ) : (
          items.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface-elevated p-4">
              <input
                type="checkbox"
                checked={t.statut === "terminee"}
                onChange={() => toggle(t)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={"text-sm font-medium " + (t.statut === "terminee" ? "text-ink-muted line-through" : "text-ink")}>
                    {t.titre}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full border border-line px-2 py-0.5">{t.priorite}</span>
                    {t.echeance && (
                      <span className="text-ink-muted">
                        {new Date(t.echeance).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>
                </div>
                {t.clients && t.client_id && (
                  <Link
                    to="/espace/clients/$id"
                    params={{ id: t.client_id }}
                    className="mt-1 inline-block text-xs text-ink-muted hover:underline"
                  >
                    {[t.clients.prenom, t.clients.nom].filter(Boolean).join(" ")} · {t.clients.reference}
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
