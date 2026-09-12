import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { majTache } from "@/lib/taches.functions";
import { PRIORITE_TACHE_LABEL, STATUT_TACHE_LABEL } from "@/lib/referentiels";

/**
 * Demandes internes rattachées au dossier (dont les rattachements ambigus
 * « à qualifier » créés par l'agent). Même ligne que le module Demandes :
 * une demande traitée ici est résolue partout.
 */

type Ligne = {
  id: string;
  titre: string;
  description: string | null;
  statut: string;
  priorite: string;
  type: string | null;
  created_at: string;
};

export function DossierTachesPanel({ dossierId }: { dossierId: string }) {
  const [items, setItems] = useState<Ligne[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const changerStatut = useServerFn(majTache);

  const load = async () => {
    const { data } = await supabase
      .from("taches")
      .select("id,titre,description,statut,priorite,type,created_at")
      .eq("dossier_id", dossierId)
      .neq("statut", "annulee")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as unknown as Ligne[]);
  };

  useEffect(() => {
    load();
  }, [dossierId]);

  const resoudre = async (id: string) => {
    setEnCours(id);
    try {
      await changerStatut({ data: { id, statut: "terminee" } });
      toast.success("Demande résolue — elle est aussi marquée résolue dans le module Demandes.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setEnCours(null);
    }
  };

  const aQualifier = items.filter((t) => t.statut === "a_qualifier");
  const autres = items.filter((t) => t.statut !== "a_qualifier");

  return (
    <div className="crm-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-lg font-medium text-ink">Demandes liées au dossier</h3>
        <Link to="/espace/taches" className="text-xs text-ink-muted hover:underline">
          Module Demandes
        </Link>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Les rattachements ambigus de l'agent et les remplacements de référence apparaissent ici et
        dans le module Demandes : traiter la demande à un endroit la résout partout.
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">Aucune demande en cours sur ce dossier.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {[...aQualifier, ...autres].map((t) => (
            <li key={t.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{t.titre}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span
                      className={
                        "rounded-full border px-2 py-0.5 " +
                        (t.statut === "a_qualifier"
                          ? "border-[#B99B3F] text-[#B99B3F]"
                          : "border-line")
                      }
                    >
                      {STATUT_TACHE_LABEL[t.statut as keyof typeof STATUT_TACHE_LABEL] ?? t.statut}
                    </span>
                    <span>
                      {PRIORITE_TACHE_LABEL[t.priorite as keyof typeof PRIORITE_TACHE_LABEL] ??
                        t.priorite}
                    </span>
                    <span>{new Date(t.created_at).toLocaleDateString("fr-FR")}</span>
                  </p>
                  {t.description && (
                    <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-ink-soft">
                      {t.description}
                    </pre>
                  )}
                </div>
                {t.statut !== "terminee" && (
                  <button
                    type="button"
                    onClick={() => resoudre(t.id)}
                    disabled={enCours === t.id}
                    className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:bg-surface disabled:opacity-50"
                  >
                    {enCours === t.id ? "…" : "Marquer résolue"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
