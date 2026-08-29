import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { IconChecklist } from "@tabler/icons-react";
import { majTache } from "@/lib/taches.functions";
import { PRIORITE_TACHE_LABEL, STATUT_TACHE_LABEL, STATUTS_TACHE, type StatutTache } from "@/lib/referentiels";


export const Route = createFileRoute("/_authenticated/espace/taches")({
  component: TachesPage,
});

type Tache = {
  id: string;
  client_id: string | null;
  titre: string;
  description: string | null;
  echeance: string | null;
  priorite: string;
  statut: string;
  created_at: string;
  clients: { reference: string; prenom: string | null; nom: string } | null;
};

const SELECT =
  "id,client_id,titre,description,echeance,priorite,statut,created_at,clients(reference,prenom,nom)";

function TachesPage() {
  const [items, setItems] = useState<Tache[]>([]);
  const [filter, setFilter] = useState<"all" | "a_faire" | "en_cours" | "terminee">("a_faire");
  const [selected, setSelected] = useState<Tache | null>(null);
  const changerStatut = useServerFn(majTache);

  const load = async () => {
    let q = supabase
      .from("taches")
      .select(SELECT)
      .order("echeance", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("statut", filter);
    const { data } = await q;
    const rows = (data ?? []) as unknown as Tache[];
    setItems(rows);
    setSelected((cur) => (cur ? rows.find((r) => r.id === cur.id) ?? cur : cur));
  };
  useEffect(() => {
    load();
  }, [filter]);

  const setStatut = async (t: Tache, statut: StatutTache) => {
    try {
      await changerStatut({ data: { id: t.id, statut } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    }
  };


  return (
    <div>
      <PageHeader
        eyebrow="Suivi opérationnel"
        title="Tâches"
        description="Cliquez sur une tâche pour voir l'analyse complète de l'agent IA."
        icon={IconChecklist}
      />

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
              (filter === k ? "border-[#0A192F] bg-[#0A192F] text-white" : "border-line text-ink-soft hover:bg-surface")
            }
          >
            {l}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucune tâche.</p>
          ) : (
            items.map((t) => (
              <div
                key={t.id}
                className={
                  "crm-card flex items-start gap-3 p-4 " +
                  (selected?.id === t.id ? "crm-card-accent" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={t.statut === "terminee"}
                  onChange={() => setStatut(t, t.statut === "terminee" ? "a_faire" : "terminee")}
                  className="mt-1"
                  aria-label="Marquer comme terminée"
                />
                <button
                  type="button"
                  onClick={() => setSelected(t)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={
                        "text-sm font-medium " +
                        (t.statut === "terminee" ? "text-ink-muted line-through" : "text-ink")
                      }
                    >
                      {t.titre}
                    </p>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <span className="rounded-full border border-line px-2 py-0.5">{t.priorite}</span>
                      {t.echeance && (
                        <span className="text-ink-muted">
                          {new Date(t.echeance).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                  </div>
                  {t.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{t.description}</p>
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          {!selected ? (
            <div className="crm-card border-dashed p-6 text-sm text-ink-muted">
              Sélectionnez une tâche pour afficher le détail de l'analyse.
            </div>
          ) : (
            <div className="crm-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-medium text-ink">{selected.titre}</h2>
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs text-ink-muted hover:underline"
                >
                  Fermer
                </button>
              </div>

              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Statut</dt>
                  <dd className="text-ink">{selected.statut}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Priorité</dt>
                  <dd className="text-ink">{selected.priorite}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Créée le</dt>
                  <dd className="text-ink">
                    {new Date(selected.created_at).toLocaleString("fr-FR")}
                  </dd>
                </div>
                {selected.echeance && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Échéance</dt>
                    <dd className="text-ink">
                      {new Date(selected.echeance).toLocaleDateString("fr-FR")}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Client</dt>
                  <dd className="text-right text-ink">
                    {selected.clients && selected.client_id ? (
                      <Link
                        to="/espace/clients/$id"
                        params={{ id: selected.client_id }}
                        className="hover:underline"
                      >
                        {[selected.clients.prenom, selected.clients.nom].filter(Boolean).join(" ")} ·{" "}
                        {selected.clients.reference}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 border-t border-line pt-4">
                <p className="crm-eyebrow">
                  Analyse de l'agent
                </p>
                {selected.description ? (
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-ink">
                    {selected.description}
                  </pre>
                ) : (
                  <p className="mt-2 text-xs text-ink-muted">
                    Aucun détail enregistré pour cette tâche.
                  </p>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {(
                  [
                    ["a_faire", "À faire"],
                    ["en_cours", "En cours"],
                    ["terminee", "Terminée"],
                    ["annulee", "Annulée"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setStatut(selected, k)}
                    className={
                      "rounded-full border px-3 py-1 text-xs " +
                      (selected.statut === k
                        ? "border-[#0A192F] bg-[#0A192F] text-white"
                        : "border-line text-ink-soft hover:bg-surface")
                    }
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
