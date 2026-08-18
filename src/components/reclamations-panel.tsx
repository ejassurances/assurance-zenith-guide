import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listeReclamations,
  envoyerSolutionReclamation,
  transmettreReclamationCompagnie,
  cloturerReclamation,
} from "@/lib/reclamations.functions";

/* Onglet Réclamations : circuit conformité, distinct du module sinistres.
   Toute solution ou escalade est validée par le cabinet avant envoi. */

type Reclamation = {
  id: string;
  client_id: string;
  statut: string;
  concerne: string;
  resume: string | null;
  solution_proposee: string | null;
  date_ouverture: string;
  date_accuse_reception: string | null;
  date_cloture: string | null;
  clients?: { nom: string | null; prenom: string | null; email: string | null } | null;
  contrats?: { numero: string | null; assureur: string | null; compagnie_id: string | null } | null;
};

const STATUT_LABEL: Record<string, string> = {
  ouvert: "Ouvert",
  analyse: "En analyse",
  accuse_reception_envoye: "Accusé de réception envoyé",
  en_attente_reponse: "En attente de réponse",
  clos: "Clos",
};

const STATUT_STYLE: Record<string, string> = {
  ouvert: "bg-amber-100 text-amber-900 border-amber-300",
  analyse: "bg-amber-100 text-amber-900 border-amber-300",
  accuse_reception_envoye: "bg-sky-100 text-sky-900 border-sky-300",
  en_attente_reponse: "bg-sky-100 text-sky-900 border-sky-300",
  clos: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

const CONCERNE_LABEL: Record<string, string> = {
  cabinet: "Concerne le cabinet",
  compagnie: "Concerne la compagnie",
  incertain: "Périmètre à déterminer",
};

export function ReclamationsPanel({ canManage }: { canManage: boolean }) {
  const lister = useServerFn(listeReclamations);
  const envoyerSolution = useServerFn(envoyerSolutionReclamation);
  const transmettre = useServerFn(transmettreReclamationCompagnie);
  const cloturer = useServerFn(cloturerReclamation);

  const [rows, setRows] = useState<Reclamation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<string>("tous");
  const [textes, setTextes] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);

  const load = async (statut: string) => {
    setLoading(true);
    try {
      const res = await lister({ data: { statut: statut === "tous" ? null : statut } });
      const liste = (res.reclamations ?? []) as Reclamation[];
      setRows(liste);
      setTextes(Object.fromEntries(liste.map((r) => [r.id, r.solution_proposee ?? ""])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(filtre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre]);

  const action = async (id: string, fn: () => Promise<unknown>, succes: string) => {
    setEnCours(id);
    try {
      await fn();
      toast.success(succes);
      await load(filtre);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-muted">
          Réclamations clients, distinctes des sinistres : l'analyse détermine si la réclamation concerne le cabinet ou
          la compagnie et propose une solution. Rien n'est envoyé sans validation du cabinet ; seul l'accusé de
          réception à J+4 est automatique.
        </p>
        <Select value={filtre} onValueChange={setFiltre}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les statuts</SelectItem>
            {Object.entries(STATUT_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-sm text-ink-muted">Chargement…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-ink-muted">Aucune réclamation pour ce filtre.</p>}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border border-line bg-surface-elevated p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">
                  {new Date(r.date_ouverture).toLocaleDateString("fr-FR")} · {CONCERNE_LABEL[r.concerne] ?? r.concerne}
                  {r.contrats?.numero ? ` · contrat ${r.contrats.numero}` : ""}
                </p>
                <h3 className="mt-1 font-serif text-lg font-medium text-ink">
                  <Link to="/espace/clients/$id" params={{ id: r.client_id }} className="underline">
                    {[r.clients?.prenom, r.clients?.nom].filter(Boolean).join(" ") || "Client"}
                  </Link>
                </h3>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${STATUT_STYLE[r.statut] ?? ""}`}
              >
                {STATUT_LABEL[r.statut] ?? r.statut}
              </span>
            </div>

            {r.resume && <p className="mt-3 whitespace-pre-line text-sm text-ink">{r.resume}</p>}
            {r.date_accuse_reception && (
              <p className="mt-2 text-xs text-ink-muted">
                Accusé de réception envoyé le {new Date(r.date_accuse_reception).toLocaleDateString("fr-FR")}
              </p>
            )}

            {canManage && r.statut !== "clos" && (
              <div className="mt-4 space-y-3">
                <Textarea
                  rows={5}
                  value={textes[r.id] ?? ""}
                  onChange={(e) => setTextes((t) => ({ ...t, [r.id]: e.target.value }))}
                  placeholder={
                    r.concerne === "compagnie"
                      ? "Message à transmettre à la compagnie (client en copie) — à relire avant envoi."
                      : "Solution proposée au client (refus motivé ou geste commercial) — à relire avant envoi."
                  }
                />
                <div className="flex flex-wrap items-center gap-3">
                  {r.concerne === "cabinet" && (
                    <Button
                      size="sm"
                      disabled={enCours === r.id}
                      onClick={() =>
                        action(
                          r.id,
                          () => envoyerSolution({ data: { id: r.id, solution: textes[r.id] ?? "" } }),
                          "Solution envoyée au client.",
                        )
                      }
                    >
                      Valider et envoyer la solution proposée
                    </Button>
                  )}
                  {r.concerne === "compagnie" && (
                    <Button
                      size="sm"
                      disabled={enCours === r.id}
                      onClick={() =>
                        action(
                          r.id,
                          () => transmettre({ data: { id: r.id, message: textes[r.id] ?? "" } }),
                          "Réclamation transmise à la compagnie.",
                        )
                      }
                    >
                      Valider et transmettre à la compagnie
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={enCours === r.id}
                    onClick={() => action(r.id, () => cloturer({ data: { id: r.id } }), "Dossier clôturé.")}
                  >
                    Clôturer le dossier
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
