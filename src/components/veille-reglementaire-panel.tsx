import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* Onglet Veille réglementaire : entrées produites par l'agent de lecture de la newsletter ACPR. */

type Statut = "a_examiner" | "traite" | "non_impacte";

type Veille = {
  id: string;
  source: string;
  sujet: string;
  resume: string | null;
  impact_assurance: boolean;
  document_source_url: string | null;
  date_reception: string;
  statut: Statut;
};

const STATUT_LABEL: Record<Statut, string> = {
  a_examiner: "À examiner",
  traite: "Traité",
  non_impacte: "Non impacté",
};

const STATUT_STYLE: Record<Statut, string> = {
  a_examiner: "bg-amber-100 text-amber-900 border-amber-300",
  traite: "bg-emerald-100 text-emerald-900 border-emerald-300",
  non_impacte: "bg-black/5 text-ink-muted border-line",
};

export function VeilleReglementairePanel({ canManage }: { canManage: boolean }) {
  const [entrees, setEntrees] = useState<Veille[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<"tous" | Statut>("a_examiner");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("veille_reglementaire")
      .select("id,source,sujet,resume,impact_assurance,document_source_url,date_reception,statut")
      .order("date_reception", { ascending: false });
    setEntrees((data as Veille[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const marquerTraite = async (id: string) => {
    await supabase.from("veille_reglementaire").update({ statut: "traite" }).eq("id", id);
    await load();
  };

  const liste = entrees.filter((e) => filtre === "tous" || e.statut === filtre);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-muted">
          Entrées de veille produites automatiquement à partir de la newsletter ACPR : seules celles qui concernent
          l'activité d'assurance et d'intermédiation du cabinet génèrent une tâche d'examen.
        </p>
        <Select value={filtre} onValueChange={(v) => setFiltre(v as typeof filtre)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a_examiner">À examiner</SelectItem>
            <SelectItem value="traite">Traité</SelectItem>
            <SelectItem value="non_impacte">Non impacté</SelectItem>
            <SelectItem value="tous">Tout</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-sm text-ink-muted">Chargement…</p>}
      {!loading && liste.length === 0 && (
        <p className="text-sm text-ink-muted">Aucune entrée de veille pour ce filtre.</p>
      )}

      <div className="space-y-3">
        {liste.map((e) => (
          <div key={e.id} className="crm-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">
                  {new Date(e.date_reception).toLocaleDateString("fr-FR")} · {e.source}
                </p>
                <h3 className="mt-1 font-serif text-lg font-medium text-ink">{e.sujet}</h3>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${STATUT_STYLE[e.statut]}`}>
                {STATUT_LABEL[e.statut]}
              </span>
            </div>

            {e.resume && <p className="mt-3 whitespace-pre-line text-sm text-ink">{e.resume}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {e.document_source_url && (
                <a
                  href={e.document_source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline"
                >
                  Document source
                </a>
              )}
              {canManage && e.statut === "a_examiner" && (
                <Button size="sm" variant="outline" onClick={() => marquerTraite(e.id)}>
                  Marquer comme traité
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
