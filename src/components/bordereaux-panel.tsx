import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lecture d'un bordereau de commissions : compagnie, période, lignes qui le
 * composent (client / contrat / montant) avec liens directs vers les fiches,
 * et suivi « attendu vs reçu » par contrat à partir de commission_previsions.
 */

const fmt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

type Bordereau = {
  id: string;
  periode: string;
  assureur: string;
  montant_total: number;
  nb_lignes: number;
  statut: string;
  created_at: string;
};

type Personne = { nom: string | null; prenom: string | null } | null;

type Ligne = {
  id: string;
  bordereau_id: string;
  client_nom_detecte: string | null;
  numero_contrat_detecte: string | null;
  produit_detecte: string | null;
  periode_detectee: string | null;
  montant: number;
  statut: string;
  client_id: string | null;
  contrat_id: string | null;
  clients: Personne;
  contrats: { numero: string | null; assureur: string | null; client_id: string | null } | null;
};

type Prevision = {
  id: string;
  contrat_id: string | null;
  montant_mensuel_reel: number | null;
  montant_mensuel_estime: number | null;
  mois_restants_actuels: number | null;
  montant_previsionnel_total: number | null;
  statut: string;
  contrats: { numero: string | null; assureur: string | null; client_id: string | null; clients: Personne } | null;
};

type CommissionBord = {
  id: string;
  contrat_id: string | null;
  dossier_id: string | null;
  bordereau_id: string | null;
  montant: number;
  statut: string;
  notes: string | null;
  contrats: { numero: string | null; assureur: string | null; client_id: string | null; clients: Personne } | null;
  dossiers: { reference: string | null; client_id: string | null; client_nom: string | null } | null;
};

const nomComplet = (p: Personne) => (p ? `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() : "");

/** Commission rattachée à un bordereau présentée comme une ligne de bordereau. */
function commissionEnLigne(c: CommissionBord): Ligne {
  const adhesion = /adhésion\s+([\w-]+)/i.exec(c.notes ?? "")?.[1] ?? null;
  return {
    id: c.id,
    bordereau_id: c.bordereau_id as string,
    client_nom_detecte: c.dossiers?.client_nom ?? null,
    numero_contrat_detecte: c.contrats?.numero ?? adhesion,
    produit_detecte: null,
    periode_detectee: /période\s+([\d/]+)/i.exec(c.notes ?? "")?.[1] ?? null,
    montant: Number(c.montant),
    statut: c.statut === "versee" ? "rapprochee" : "a_rapprocher",
    client_id: c.contrats?.client_id ?? c.dossiers?.client_id ?? null,
    contrat_id: c.contrat_id,
    clients: c.contrats?.clients ?? null,
    contrats: c.contrats
      ? { numero: c.contrats.numero, assureur: c.contrats.assureur, client_id: c.contrats.client_id }
      : null,
  };
}

function LienClient({ id, label }: { id: string | null; label: string }) {
  if (!id) return <span>{label || "Client non rapproché"}</span>;
  return (
    <Link to="/espace/clients/$id" params={{ id }} className="underline decoration-dotted hover:text-ink">
      {label || "Fiche client"}
    </Link>
  );
}

function LienContrat({ id, label }: { id: string | null; label: string }) {
  if (!id) return <span className="text-ink-muted">{label || "—"}</span>;
  return (
    <Link to="/espace/contrats/$id" params={{ id }} className="underline decoration-dotted hover:text-ink">
      {label || "Contrat"}
    </Link>
  );
}

export function BordereauxPanel() {
  const [bordereaux, setBordereaux] = useState<Bordereau[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [previsions, setPrevisions] = useState<Prevision[]>([]);
  const [recuParContrat, setRecuParContrat] = useState<Record<string, number>>({});
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [b, l, p, c] = await Promise.all([
        supabase
          .from("bordereaux_commissions")
          .select("id,periode,assureur,montant_total,nb_lignes,statut,created_at")
          .order("periode", { ascending: false }),
        supabase
          .from("bordereau_lignes")
          .select(
            "id,bordereau_id,client_nom_detecte,numero_contrat_detecte,produit_detecte,periode_detectee,montant,statut,client_id,contrat_id,clients(nom,prenom),contrats(numero,assureur,client_id)",
          ),
        supabase
          .from("commission_previsions")
          .select(
            "id,contrat_id,montant_mensuel_reel,montant_mensuel_estime,mois_restants_actuels,montant_previsionnel_total,statut,contrats(numero,assureur,client_id,clients(nom,prenom))",
          ),
        supabase
          .from("commissions")
          .select(
            "id,contrat_id,dossier_id,bordereau_id,montant,statut,notes,contrats(numero,assureur,client_id,clients(nom,prenom)),dossiers(reference,client_id,client_nom)",
          ),
      ]);
      setBordereaux((b.data as unknown as Bordereau[]) ?? []);
      setLignes((l.data as unknown as Ligne[]) ?? []);
      setPrevisions((p.data as unknown as Prevision[]) ?? []);
      const coms = (c.data as unknown as CommissionBord[]) ?? [];
      setCommissions(coms);
      const recu: Record<string, number> = {};
      for (const x of coms) {
        if (x.statut === "versee" && x.contrat_id) recu[x.contrat_id] = (recu[x.contrat_id] ?? 0) + Number(x.montant);
      }
      setRecuParContrat(recu);
      // Premier bordereau déplié par défaut.
      const premier = ((b.data as unknown as Bordereau[]) ?? [])[0];
      if (premier) setOuverts({ [premier.id]: true });
      setLoading(false);
    })();
  }, []);

  /**
   * Lignes affichées : détail importé du bordereau quand il existe, sinon
   * reconstitution depuis les commissions rattachées à ce bordereau.
   */
  const lignesParBordereau = useMemo(() => {
    const map = new Map<string, Ligne[]>();
    for (const l of lignes) {
      const arr = map.get(l.bordereau_id) ?? [];
      arr.push(l);
      map.set(l.bordereau_id, arr);
    }
    for (const com of commissions) {
      if (!com.bordereau_id || map.has(com.bordereau_id)) continue;
      const arr = map.get(com.bordereau_id) ?? [];
      arr.push(commissionEnLigne(com));
      map.set(com.bordereau_id, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (nomComplet(a.clients) || a.client_nom_detecte || "").localeCompare(nomComplet(b.clients) || b.client_nom_detecte || ""));
    }
    return map;
  }, [lignes, commissions]);

  const suivi = useMemo(() => {
    return previsions
      .map((p) => {
        const mensuel = Number(p.montant_mensuel_reel ?? p.montant_mensuel_estime ?? 0);
        const attendu = Number(p.montant_previsionnel_total ?? mensuel * Number(p.mois_restants_actuels ?? 0));
        const recu = p.contrat_id ? (recuParContrat[p.contrat_id] ?? 0) : 0;
        return {
          id: p.id,
          contrat_id: p.contrat_id,
          numero: p.contrats?.numero ?? null,
          assureur: p.contrats?.assureur ?? null,
          client_id: p.contrats?.client_id ?? null,
          client: nomComplet(p.contrats?.clients ?? null),
          mensuel,
          attendu,
          recu,
          statut: p.statut,
        };
      })
      .sort((a, b) => b.attendu - a.attendu);
  }, [previsions, recuParContrat]);

  if (loading) return <p className="mt-8 text-sm text-ink-muted">Chargement des bordereaux…</p>;

  return (
    <div className="mt-10 space-y-8">
      <section>
        <h2 className="font-serif text-2xl font-medium text-ink">Bordereaux reçus</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Par compagnie et période — dépliez un bordereau pour voir les clients et contrats qu'il couvre.
        </p>

        {bordereaux.length === 0 && (
          <p className="mt-4 rounded-2xl border border-line bg-surface-elevated p-6 text-sm text-ink-muted">
            Aucun bordereau importé pour l'instant.
          </p>
        )}

        <div className="mt-4 space-y-4">
          {bordereaux.map((b) => {
            const ls = lignesParBordereau.get(b.id) ?? [];
            const ouvert = !!ouverts[b.id];
            const totalLignes = ls.reduce((s, l) => s + Number(l.montant), 0);
            const nonRapprochees = ls.filter((l) => l.statut === "a_rapprocher").length;
            const clientsUniques = new Set(ls.map((l) => l.client_id ?? l.client_nom_detecte ?? l.id)).size;
            return (
              <div key={b.id} className="overflow-hidden rounded-2xl border border-line bg-surface-elevated">
                <button
                  type="button"
                  onClick={() => setOuverts((o) => ({ ...o, [b.id]: !o[b.id] }))}
                  className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left"
                >
                  <span className="text-ink-muted">{ouvert ? "▾" : "▸"}</span>
                  <span className="font-serif text-lg font-medium text-ink">{b.assureur}</span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
                    Période {b.periode}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {clientsUniques} client(s) · {ls.length || b.nb_lignes} ligne(s)
                    {nonRapprochees > 0 && ` · ${nonRapprochees} à rapprocher`}
                  </span>
                  <span className="ml-auto font-serif text-lg text-ink">{fmt(Number(b.montant_total) || totalLignes)}</span>
                </button>

                {ouvert && (
                  <div className="border-t border-line">
                    {ls.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-ink-muted">Aucune ligne détaillée pour ce bordereau.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
                            <tr>
                              <th className="px-5 py-2">Client</th>
                              <th className="px-5 py-2">Contrat</th>
                              <th className="px-5 py-2">Produit / période</th>
                              <th className="px-5 py-2 text-right">Montant</th>
                              <th className="px-5 py-2">Rapprochement</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ls.map((l) => (
                              <tr key={l.id} className="border-b border-line last:border-0">
                                <td className="px-5 py-2">
                                  <LienClient
                                    id={l.client_id ?? l.contrats?.client_id ?? null}
                                    label={nomComplet(l.clients) || l.client_nom_detecte || ""}
                                  />
                                </td>
                                <td className="px-5 py-2">
                                  <LienContrat
                                    id={l.contrat_id}
                                    label={l.contrats?.numero ?? l.numero_contrat_detecte ?? ""}
                                  />
                                </td>
                                <td className="px-5 py-2 text-xs text-ink-muted">
                                  {[l.produit_detecte, l.periode_detectee].filter(Boolean).join(" · ") || "—"}
                                </td>
                                <td className="px-5 py-2 text-right">{fmt(Number(l.montant))}</td>
                                <td className="px-5 py-2">
                                  <span
                                    className={
                                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium " +
                                      (l.statut === "rapprochee"
                                        ? "bg-emerald-100 text-emerald-900"
                                        : l.statut === "ignoree"
                                          ? "bg-red-100 text-red-900"
                                          : "bg-amber-100 text-amber-900")
                                    }
                                  >
                                    {l.statut === "rapprochee" ? "rapprochée" : l.statut === "ignoree" ? "ignorée" : "à rapprocher"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-serif text-2xl font-medium text-ink">Attendu vs reçu par contrat</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Prévisionnel de courtage (commission_previsions) confronté aux commissions déjà encaissées.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface-elevated">
          {suivi.length === 0 ? (
            <p className="p-6 text-sm text-ink-muted">Aucun prévisionnel de commission enregistré.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">Contrat</th>
                    <th className="px-5 py-3 text-right">Mensuel</th>
                    <th className="px-5 py-3 text-right">Total attendu</th>
                    <th className="px-5 py-3 text-right">Déjà reçu</th>
                    <th className="px-5 py-3 text-right">Reste à percevoir</th>
                  </tr>
                </thead>
                <tbody>
                  {suivi.map((s) => {
                    const reste = Math.max(0, s.attendu - s.recu);
                    return (
                      <tr key={s.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-3">
                          <LienClient id={s.client_id} label={s.client} />
                        </td>
                        <td className="px-5 py-3">
                          <LienContrat id={s.contrat_id} label={s.numero ?? ""} />
                          {s.assureur && <span className="ml-2 text-xs text-ink-muted">{s.assureur}</span>}
                        </td>
                        <td className="px-5 py-3 text-right">{fmt(s.mensuel)}</td>
                        <td className="px-5 py-3 text-right">{fmt(s.attendu)}</td>
                        <td className="px-5 py-3 text-right text-emerald-700">{fmt(s.recu)}</td>
                        <td className="px-5 py-3 text-right">{fmt(reste)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
