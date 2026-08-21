import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IconAlertTriangle } from "@tabler/icons-react";

import { listeSinistres } from "@/lib/sinistres.functions";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/espace/sinistres")({
  head: () => ({
    meta: [
      { title: "Sinistres — EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Suivi des dossiers sinistres du cabinet : analyse de couverture, action recommandée et clôture.",
      },
      { property: "og:title", content: "Sinistres — EJ Partners Assurances" },
      {
        property: "og:description",
        content: "Dossiers sinistres, analyse de couverture et actions du cabinet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SinistresPage,
});

export const STATUT_LABEL: Record<string, string> = {
  ouvert: "Ouvert",
  en_analyse: "En analyse",
  transmis_compagnie: "Transmis compagnie",
  reponse_envoyee: "Réponse envoyée",
  clos: "Clos",
  refuse: "Refusé",
};

export const ACTION_LABEL: Record<string, string> = {
  reponse_non_couvert: "Réponse « non couvert »",
  transmission_compagnie: "Transmission compagnie",
  escalade_humaine: "Escalade humaine",
};

type Ligne = {
  id: string;
  client_id: string;
  statut: string;
  resume: string | null;
  action_recommandee: string | null;
  date_ouverture: string;
  clos_le: string | null;
  clients?: { nom: string | null; prenom: string | null } | null;
};

function SinistresPage() {
  const lister = useServerFn(listeSinistres);
  const [rows, setRows] = useState<Ligne[]>([]);
  const [filtre, setFiltre] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await lister({ data: { statut: filtre || null } });
        setRows((res.sinistres ?? []) as Ligne[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Chargement impossible");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtre]);

  const counts = useMemo(() => {
    const total = rows.length;
    const ouverts = rows.filter((r) => r.statut !== "clos" && r.statut !== "refuse").length;
    const clos = rows.filter((r) => r.statut === "clos").length;
    return { total, ouverts, clos };
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Suivi des dossiers"
        title="Sinistres"
        description="Dossiers ouverts par l'agent relation client. L'analyse de couverture est une aide à la décision : aucun email n'est envoyé automatiquement."
        icon={IconAlertTriangle}
      >
        <select
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          className="rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
        >
          <option value="" className="text-ink">Tous les statuts</option>
          {Object.entries(STATUT_LABEL).map(([k, v]) => (
            <option key={k} value={k} className="text-ink">
              {v}
            </option>
          ))}
        </select>
      </PageHeader>

      {!loading && rows.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Dossiers" value={counts.total} />
          <StatCard label="En cours" value={counts.ouverts} accent />
          <StatCard label="Clos" value={counts.clos} />
        </div>
      )}

      <section className="crm-card overflow-hidden">
        {loading ? (
          <p className="p-5 text-sm text-ink-muted">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-ink-muted">Aucun sinistre pour ce filtre.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-background text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Sinistre</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Ouverture</th>
                <th className="px-4 py-3">Action recommandée</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-background/60">
                  <td className="px-4 py-3">
                    <Link to="/espace/sinistres/$id" params={{ id: r.id }} className="underline">
                      {[r.clients?.prenom, r.clients?.nom].filter(Boolean).join(" ") || "Client"}
                    </Link>
                  </td>
                  <td className="max-w-[26rem] px-4 py-3 text-ink-muted">{r.resume ?? "—"}</td>
                  <td className="px-4 py-3">{STATUT_LABEL[r.statut] ?? r.statut}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(r.date_ouverture).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">
                    {r.action_recommandee ? (ACTION_LABEL[r.action_recommandee] ?? r.action_recommandee) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
