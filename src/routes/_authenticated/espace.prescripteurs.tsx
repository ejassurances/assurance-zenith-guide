import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  changerStatutPrescripteur,
  majRecommandation,
  validerPrescripteur,
} from "@/lib/prescripteurs.functions";

export const Route = createFileRoute("/_authenticated/espace/prescripteurs")({
  component: PrescripteursPage,
});

type Prescripteur = {
  id: string;
  nom: string;
  prenom: string | null;
  email: string;
  telephone: string | null;
  zone_activite: string | null;
  type: string;
  statut: string;
  convention_acceptee_le: string | null;
  user_id: string | null;
  created_at: string;
};

type Reco = {
  id: string;
  prescripteur_id: string;
  client_id: string | null;
  nom_contact: string;
  description: string | null;
  statut: string;
  montant_du: number;
  verse: boolean;
  verse_le: string | null;
  created_at: string;
  prescripteurs: { nom: string; prenom: string | null } | null;
};

const STATUT_RECO_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  dossier_valide: "Dossier validé",
  sans_suite: "Sans suite",
};

const dateFr = (v: string | null) => (v ? new Date(v).toLocaleDateString("fr-FR") : "—");

function PrescripteursPage() {
  const [onglet, setOnglet] = useState<"prescripteurs" | "recommandations">("prescripteurs");
  const [prescripteurs, setPrescripteurs] = useState<Prescripteur[]>([]);
  const [recos, setRecos] = useState<Reco[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const valider = useServerFn(validerPrescripteur);
  const changerStatut = useServerFn(changerStatutPrescripteur);
  const majReco = useServerFn(majRecommandation);

  const load = useCallback(async () => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase
        .from("prescripteurs")
        .select("id,nom,prenom,email,telephone,zone_activite,type,statut,convention_acceptee_le,user_id,created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("recommandations_prescripteur")
        .select(
          "id,prescripteur_id,client_id,nom_contact,description,statut,montant_du,verse,verse_le,created_at,prescripteurs(nom,prenom)",
        )
        .order("created_at", { ascending: false }),
    ]);
    setPrescripteurs((p ?? []) as unknown as Prescripteur[]);
    setRecos((r ?? []) as unknown as Reco[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const action = async (key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fn();
      setMsg(res.ok ? { type: "ok", text: okText } : { type: "err", text: res.error ?? "Erreur" });
      if (res.ok) await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erreur inattendue" });
    }
    setBusy(null);
  };

  const totalDu = recos
    .filter((r) => r.statut === "dossier_valide" && !r.verse)
    .reduce((s, r) => s + Number(r.montant_du ?? 0), 0);

  const tabClass = (actif: boolean) =>
    "rounded-full px-4 py-1.5 text-xs font-medium " +
    (actif ? "bg-[color:var(--crm-navy)] text-white" : "border border-line bg-surface-elevated text-ink-soft");

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="crm-eyebrow">Apport d'affaires</p>
          <h1 className="font-serif text-2xl font-medium text-ink">Prescripteurs</h1>
        </div>
        <p className="text-xs text-ink-muted">
          Montant dû non versé : <strong className="text-ink">{totalDu.toFixed(0)} €</strong>
        </p>
      </header>

      <div className="mt-5 flex gap-2">
        <button type="button" className={tabClass(onglet === "prescripteurs")} onClick={() => setOnglet("prescripteurs")}>
          Prescripteurs ({prescripteurs.length})
        </button>
        <button
          type="button"
          className={tabClass(onglet === "recommandations")}
          onClick={() => setOnglet("recommandations")}
        >
          Recommandations ({recos.length})
        </button>
      </div>

      {msg && (
        <p className={`mt-3 text-xs ${msg.type === "ok" ? "text-ink-muted" : "text-destructive"}`}>{msg.text}</p>
      )}

      {onglet === "prescripteurs" ? (
        <div className="mt-5 overflow-x-auto rounded-sm border border-line">
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-[10px] uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-3 py-2">Prescripteur</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Zone / type</th>
                <th className="px-3 py-2">Convention</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prescripteurs.map((p) => (
                <tr key={p.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 text-ink">
                    {`${p.prenom ?? ""} ${p.nom}`.trim()}
                    <span className="block text-[11px] text-ink-muted">Inscrit le {dateFr(p.created_at)}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">
                    {p.email}
                    <span className="block text-[11px] text-ink-muted">{p.telephone ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">
                    {p.zone_activite ?? "—"}
                    <span className="block text-[11px] text-ink-muted">
                      {p.type === "agent_immo" ? "Agent immobilier" : "Autre"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{dateFr(p.convention_acceptee_le)}</td>
                  <td className="px-3 py-2 text-ink-soft">
                    {p.statut === "actif" ? "Actif" : p.statut === "inactif" ? "Inactif" : "En attente"}
                    {p.user_id && <span className="block text-[11px] text-ink-muted">Espace créé</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {p.statut !== "actif" && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            action(
                              `val-${p.id}`,
                              () => valider({ data: { prescripteur_id: p.id } }),
                              "Prescripteur validé — accès envoyé par e-mail.",
                            )
                          }
                          className="rounded-full border border-line bg-surface-elevated px-3 py-1 text-xs text-ink hover:bg-surface disabled:opacity-50"
                        >
                          {busy === `val-${p.id}` ? "…" : "Valider et créer l'espace"}
                        </button>
                      )}
                      {p.statut === "actif" && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            action(
                              `des-${p.id}`,
                              () => changerStatut({ data: { prescripteur_id: p.id, statut: "inactif" } }),
                              "Prescripteur désactivé.",
                            )
                          }
                          className="rounded-full border border-line bg-surface-elevated px-3 py-1 text-xs text-ink-soft hover:bg-surface disabled:opacity-50"
                        >
                          Désactiver
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {prescripteurs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-muted">
                    Aucun prescripteur inscrit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-sm border border-line">
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-[10px] uppercase tracking-wider text-ink-muted">
              <tr>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Prescripteur</th>
                <th className="px-3 py-2">Reçue le</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Rémunération</th>
              </tr>
            </thead>
            <tbody>
              {recos.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 text-ink">
                    {r.nom_contact}
                    {r.description && (
                      <span className="mt-1 block max-w-md whitespace-pre-wrap text-[11px] text-ink-muted">
                        {r.description}
                      </span>
                    )}
                    {r.client_id && (
                      <Link
                        to="/espace/clients/$id"
                        params={{ id: r.client_id }}
                        className="mt-1 block text-[11px] underline"
                      >
                        Fiche client
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-soft">
                    {`${r.prescripteurs?.prenom ?? ""} ${r.prescripteurs?.nom ?? ""}`.trim() || "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{dateFr(r.created_at)}</td>
                  <td className="px-3 py-2">
                    <select
                      value={r.statut}
                      disabled={busy !== null}
                      onChange={(e) =>
                        action(
                          `st-${r.id}`,
                          () =>
                            majReco({
                              data: {
                                recommandation_id: r.id,
                                statut: e.target.value as
                                  | "nouveau"
                                  | "en_cours"
                                  | "dossier_valide"
                                  | "sans_suite",
                              },
                            }),
                          "Statut mis à jour.",
                        )
                      }
                      className="rounded-sm border border-line bg-surface-elevated px-2 py-1 text-xs text-ink"
                    >
                      {Object.entries(STATUT_RECO_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">
                    {r.statut === "dossier_valide" ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-ink">{Number(r.montant_du).toFixed(0)} € dus</span>
                        {r.verse ? (
                          <span className="text-[11px] text-ink-muted">Versé le {dateFr(r.verse_le)}</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              action(
                                `v-${r.id}`,
                                () => majReco({ data: { recommandation_id: r.id, verse: true } }),
                                "Versement enregistré.",
                              )
                            }
                            className="rounded-full border border-line bg-surface-elevated px-3 py-1 text-xs text-ink hover:bg-surface disabled:opacity-50"
                          >
                            Marquer versé
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {recos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-muted">
                    Aucune recommandation reçue.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
