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
  IconCurrencyEuro,
  IconEye,
  IconFileText,
  IconFolder,
  IconPencil,
  IconUsers,
  IconX,
} from "@tabler/icons-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ListPage } from "@/components/shell/list-page";
import { portefeuilleContratsFn } from "@/lib/portefeuille-contrats.functions";
import { supabase } from "@/integrations/supabase/client";
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

type ContratApercu = {
  id: string;
  client_id: string;
  numero: string | null;
  assureur: string;
  produit: string;
  statut: string;
  prime_annuelle: number | null;
  prime_nette_annuelle: number | null;
  fractionnement: string;
  date_effet: string | null;
  date_echeance: string | null;
  capital_initial: number | null;
  taux_assurance_annuel: number | null;
  compagnie_id: string | null;
  is_emprunteur: boolean;
  notes: string | null;
};

type ClientApercu = {
  nom: string;
  prenom: string | null;
  reference: string;
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
  const [contratOuvert, setContratOuvert] = useState<LigneContrat | null>(null);
  const [contratDetail, setContratDetail] = useState<ContratApercu | null>(null);
  const [clientDetail, setClientDetail] = useState<ClientApercu | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [onglet, setOnglet] = useState<"synthese" | "modifier" | "assures" | "frais" | "complements" | "fichiers">("synthese");

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

  useEffect(() => {
    if (!contratOuvert) {
      setContratDetail(null);
      setClientDetail(null);
      return;
    }
    let annule = false;
    setModalLoading(true);
    setOnglet("synthese");
    (async () => {
      const [contrat, client] = await Promise.all([
        supabase.from("contrats").select("id,client_id,numero,assureur,produit,statut,prime_annuelle,prime_nette_annuelle,fractionnement,date_effet,date_echeance,capital_initial,taux_assurance_annuel,compagnie_id,is_emprunteur,notes").eq("id", contratOuvert.contrat_id).maybeSingle(),
        contratOuvert.client_id
          ? supabase.from("clients").select("nom,prenom,reference").eq("id", contratOuvert.client_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (annule) return;
      setContratDetail((contrat.data as ContratApercu | null) ?? null);
      setClientDetail((client.data as ClientApercu | null) ?? null);
      setModalLoading(false);
    })();
    return () => {
      annule = true;
    };
  }, [contratOuvert]);

  useEffect(() => {
    if (!contratOuvert) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContratOuvert(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contratOuvert]);

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
    <>
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
                      onClick={() => setContratOuvert(l)}
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
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContratOuvert(l);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-4"
                        >
                          <IconEye size={14} /> Ouvrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ListPage>

      {contratOuvert && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Détail du contrat"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setContratOuvert(null);
          }}
        >
          <div className="flex max-h-[92vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5">
              <span className="text-sm font-medium text-slate-700">Contrat</span>
              <button type="button" onClick={() => setContratOuvert(null)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer">
                <IconX size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
              {modalLoading ? (
                <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">Chargement du contrat…</div>
              ) : contratDetail ? (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-medium tracking-tight text-slate-800">
                        {contratDetail.is_emprunteur ? "Contrat Emprunteur" : "Contrat d'assurance"}
                      </h2>
                      <div className="mt-1 text-sm text-slate-500">
                        {clientDetail ? `${clientDetail.prenom ? `${clientDetail.prenom} ` : ""}${clientDetail.nom}` : "Client non renseigné"}
                        {clientDetail?.reference ? ` · ${clientDetail.reference}` : ""} · {contratDetail.assureur}
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold uppercase text-emerald-700">
                      {contratDetail.statut.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
                    {[
                      ["synthese", "Synthèse", IconEye],
                      ["modifier", "Modifier", IconPencil],
                      ["assures", "Assurés", IconUsers],
                      ["frais", "Frais & Honoraires", IconCurrencyEuro],
                      ["complements", "Compléments", IconFileText],
                      ["fichiers", "Fichiers", IconFolder],
                    ].map(([key, label, Icon]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setOnglet(key as typeof onglet)}
                        className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${onglet === key ? "border-sky-500 text-sky-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                      >
                        <Icon size={15} /> {label}
                      </button>
                    ))}
                  </div>

                  {onglet === "synthese" && (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <MiniCard label="Prime TTC actuelle" value={fmtEuro(contratDetail.prime_annuelle)} icon={IconCurrencyEuro} />
                        <MiniCard label="Prime nette" value={fmtEuro(contratDetail.prime_nette_annuelle)} icon={IconCurrencyEuro} />
                        <MiniCard label="Date d'effet" value={fmtDate(contratDetail.date_effet)} icon={IconCalendarEvent} />
                        <MiniCard label="Fractionnement" value={contratDetail.fractionnement || "—"} icon={IconClockHour4} />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <section className="overflow-hidden rounded-lg border border-slate-200">
                          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">Contrat</div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 text-sm">
                            <Info label="Compagnie" value={contratDetail.assureur} />
                            <Info label="Produit" value={contratDetail.produit} />
                            <Info label="Référence" value={contratDetail.numero ?? "Non renseignée"} />
                            <Info label="Statut" value={contratDetail.statut.replace(/_/g, " ")} />
                            <Info label="Date d'échéance" value={fmtDate(contratDetail.date_echeance)} />
                            <Info label="Type" value={contratDetail.is_emprunteur ? "Assurance emprunteur" : "Contrat standard"} />
                          </div>
                        </section>

                        <section className="overflow-hidden rounded-lg border border-slate-200">
                          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">Finances</div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 text-sm">
                            <Info label="Prime HT / nette" value={fmtEuro(contratDetail.prime_nette_annuelle)} />
                            <Info label="Prime TTC" value={fmtEuro(contratDetail.prime_annuelle)} />
                            <Info label="Capital couvert" value={fmtEuro(contratDetail.capital_initial)} />
                            <Info label="Fractionnement" value={contratDetail.fractionnement || "—"} />
                            <Info label="Taux assurance" value={contratDetail.taux_assurance_annuel != null ? `${contratDetail.taux_assurance_annuel} %` : "—"} />
                            <Info label="Commission" value="Calculée sur la prime nette" />
                          </div>
                        </section>
                      </div>

                      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-700">Accès rapide</p>
                            <p className="mt-1 text-xs text-slate-500">La fiche complète conserve les fonctions de modification, échéances, commissionnement et documents.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate({ to: "/espace/contrats/$id", params: { id: contratDetail.id } })}
                            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
                          >
                            Ouvrir la fiche complète
                          </button>
                        </div>
                      </section>
                    </div>
                  )}

                  {onglet !== "synthese" && (
                    <section className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
                      <p className="text-sm font-medium text-slate-700">{ongletLabel(onglet)}</p>
                      <p className="mt-1 text-xs text-slate-500">La fiche complète contient déjà cet espace. Utilise le bouton ci-dessous pour y accéder.</p>
                      <button
                        type="button"
                        onClick={() => navigate({ to: "/espace/contrats/$id", params: { id: contratDetail.id } })}
                        className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <IconPencil size={14} /> Ouvrir cet onglet
                      </button>
                    </section>
                  )}
                </>
              ) : (
                <p className="rounded-md bg-red-50 p-4 text-sm text-red-700">Impossible de charger le contrat.</p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <button type="button" onClick={() => setContratOuvert(null)} className="rounded-md border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">Fermer</button>
              {contratDetail && (
                <button type="button" onClick={() => navigate({ to: "/espace/contrats/$id", params: { id: contratDetail.id } })} className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-600">Enregistrer / gérer le contrat</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MiniCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof IconFileText }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400"><Icon size={14} /> {label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-medium capitalize text-slate-700">{value}</p>
    </div>
  );
}

function ongletLabel(onglet: Exclude<"synthese" | "modifier" | "assures" | "frais" | "complements" | "fichiers", "synthese">) {
  const labels: Record<string, string> = {
    modifier: "Modifier le contrat",
    assures: "Assurés",
    frais: "Frais & Honoraires",
    complements: "Compléments",
    fichiers: "Fichiers",
  };
  return labels[onglet] ?? "Onglet";
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
