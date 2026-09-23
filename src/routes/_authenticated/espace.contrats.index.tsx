/**
 * D5 — Portefeuille de contrats : KPI, filtres et liste.
 * Clic sur un contrat : ouverture d'une fiche synthétique en modal.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCircleCheck,
  IconClockHour4,
  IconEye,
  IconFileText,
} from "@tabler/icons-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ListPage } from "@/components/shell/list-page";
import { portefeuilleContratsFn } from "@/lib/portefeuille-contrats.functions";
import {
  LABEL_ETAT,
  type AgregatsPortefeuille,
  type EtatContrat,
  type LigneContrat,
} from "@/lib/portefeuille-contrats";

export const Route = createFileRoute("/_authenticated/espace/contrats/")({
  head: () => ({
    meta: [
      { title: "Portefeuille de contrats — EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Vue consolidée du portefeuille de contrats : échéances proches, suivis à faire et primes annuelles.",
      },
      { property: "og:title", content: "Portefeuille de contrats — EJ Partners Assurances" },
      {
        property: "og:description",
        content: "Échéances, suivis périodiques et primes annuelles du portefeuille de contrats.",
      },
    ],
  }),
  component: PortefeuilleContrats,
});

const BADGE: Record<EtatContrat, string> = {
  echeance_proche: "bg-amber-100 text-amber-900",
  suivi_du: "bg-red-100 text-red-900",
  suivi_non_planifie: "bg-slate-200 text-slate-800",
  a_jour: "bg-emerald-100 text-emerald-900",
};

function PortefeuilleContrats() {
  const charger = useServerFn(portefeuilleContratsFn);
  const navigate = useNavigate();
  const [lignes, setLignes] = useState<LigneContrat[]>([]);
  const [agregats, setAgregats] = useState<AgregatsPortefeuille | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatContrat | "tous">("tous");
  const [compagnie, setCompagnie] = useState<string>("toutes");
  const [q, setQ] = useState("");

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await charger({ data: {} });
        if (annule) return;
        setLignes(res.lignes);
        setAgregats(res.agregats);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        if (!annule) setLoading(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [charger]);

  const filtrees = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return lignes.filter((l) => {
      if (etat !== "tous" && l.etat !== etat) return false;
      if (compagnie !== "toutes" && (l.compagnie_nom ?? l.assureur) !== compagnie) return false;
      if (!terme) return true;
      return [l.client_nom, l.produit, l.assureur, l.numero]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(terme));
    });
  }, [lignes, etat, compagnie, q]);

  return (
    <ListPage
        header={
          <PageHeader
            title="Portefeuille de contrats"
            description="Échéances proches, suivis périodiques et primes annuelles — vue en lecture seule."
          />
        }
        barre={
          <>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Client, produit, assureur, n° de contrat…"
              className="min-w-[16rem] flex-1 rounded-sm border border-line bg-surface px-3 py-2 text-sm"
            />
            <select
              value={etat}
              onChange={(e) => setEtat(e.target.value as EtatContrat | "tous")}
              className="rounded-sm border border-line bg-surface px-3 py-2 text-xs"
            >
              <option value="tous">Tous les états</option>
              {(Object.keys(LABEL_ETAT) as EtatContrat[]).map((k) => (
                <option key={k} value={k}>
                  {LABEL_ETAT[k]}
                </option>
              ))}
            </select>
            <select
              value={compagnie}
              onChange={(e) => setCompagnie(e.target.value)}
              className="rounded-sm border border-line bg-surface px-3 py-2 text-xs"
            >
              <option value="toutes">Toutes les compagnies</option>
              {(agregats?.par_compagnie ?? []).map((c) => (
                <option key={c.nom} value={c.nom}>
                  {c.nom} ({c.nb})
                </option>
              ))}
            </select>
          </>
        }
        compteur={`${filtrees.length} contrat${filtrees.length > 1 ? "s" : ""}`}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Contrats en portefeuille" value={String(agregats?.total ?? 0)} icon={IconFileText} />
          <StatCard label="Échéances ≤ 60 jours" value={String(agregats?.par_etat.echeance_proche ?? 0)} icon={IconCalendarEvent} />
          <StatCard label="Suivis à faire" value={String((agregats?.par_etat.suivi_du ?? 0) + (agregats?.par_etat.suivi_non_planifie ?? 0))} icon={IconClockHour4} />
          <StatCard label="Primes annuelles" value={fmtEuro(agregats?.prime_annuelle_totale ?? 0)} icon={IconCircleCheck} />
        </div>

        {erreur && (
          <p className="flex items-center gap-2 rounded-sm border border-line bg-surface p-3 text-sm text-red-700">
            <IconAlertTriangle size={16} aria-hidden="true" /> {erreur}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-ink-muted">Chargement…</p>
        ) : filtrees.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-muted">
            Aucun contrat ne correspond à ces critères.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-surface text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Client</th>
                    <th className="px-3 py-2 text-left">Produit / assureur</th>
                    <th className="px-3 py-2 text-left">Échéance</th>
                    <th className="px-3 py-2 text-left">Prochain suivi</th>
                    <th className="px-3 py-2 text-right">Prime annuelle</th>
                    <th className="px-3 py-2 text-left">État</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtrees.map((l) => (
                    <tr
                      key={l.contrat_id}
                      onClick={() => navigate({ to: "/espace/contrats/$id", params: { id: l.contrat_id } })}
                      className="cursor-pointer hover:bg-surface/40"
                    >
                      <td className="px-3 py-2">
                        {l.client_id ? (
                          <Link
                            to="/espace/clients/$id"
                            params={{ id: l.client_id }}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium underline underline-offset-4"
                          >
                            {l.client_nom ?? "Client"}
                          </Link>
                        ) : (
                          <span className="font-medium">{l.client_nom ?? "—"}</span>
                        )}
                        <div className="text-xs text-ink-muted">{l.numero ?? "sans n°"}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div>{l.produit}</div>
                        <div className="text-xs text-ink-muted">{l.compagnie_nom ?? l.assureur}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-muted">
                        {fmtDate(l.date_echeance)}
                        {l.jours_avant_echeance !== null && (
                          <div>{l.jours_avant_echeance >= 0 ? `dans ${l.jours_avant_echeance} j` : `dépassée de ${-l.jours_avant_echeance} j`}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-muted">{fmtDate(l.prochain_suivi_le)}</td>
                      <td className="px-3 py-2 text-right">{l.prime_annuelle !== null ? fmtEuro(l.prime_annuelle) : "—"}</td>
                      <td className="px-3 py-2">
                        <span className={"rounded-full px-2 py-0.5 text-xs font-medium " + BADGE[l.etat]}>{LABEL_ETAT[l.etat]}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to="/espace/contrats/$id"
                          params={{ id: l.contrat_id }}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4"
                        >
                          <IconEye size={14} /> Ouvrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ListPage>
  );
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

function fmtEuro(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}
