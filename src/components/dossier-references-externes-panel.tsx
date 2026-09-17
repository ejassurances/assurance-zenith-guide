/**
 * Références internes de l'assureur, suivies PAR ASSURÉ (étape « Analyse et
 * décision »).
 *
 * Un dossier porte un prêt (lettre de mission et devoir de conseil communs),
 * mais chaque assuré du prêt donne lieu à un contrat distinct auprès de la
 * compagnie, avec sa propre référence. Le conseiller enregistre donc chaque
 * référence sur le contrat de l'assuré concerné : l'agent qui lit les e-mails
 * rattache alors le message au bon contrat, sur preuve exacte uniquement — un
 * simple nom ne suffit jamais.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { creerContratsAssuresFn } from "@/lib/souscription.functions";
import { recalculerPrevisionsAssuresFn } from "@/lib/commission-contrats.functions";

type Ref = {
  id: string;
  reference: string;
  libelle: string | null;
  compagnie_id: string | null;
  contrat_id: string | null;
  created_at: string;
};

type Compagnie = { id: string; nom: string };

type Contrat = {
  id: string;
  numero: string | null;
  assureur: string;
  produit: string;
  statut: string;
  quotite: number | null;
  prime_annuelle: number | null;
  co_emprunteur: string | null;
  date_effet: string | null;
};

type Prevision = { contrat_id: string | null; montant_previsionnel_total: number | null };

const euro = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function DossierReferencesExternesPanel({
  dossierId,
  canEdit = true,
}: {
  dossierId: string;
  canEdit?: boolean;
}) {
  const [refs, setRefs] = useState<Ref[]>([]);
  const [compagnies, setCompagnies] = useState<Compagnie[]>([]);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [previsions, setPrevisions] = useState<Record<string, number | null>>({});
  const [reference, setReference] = useState("");
  const [libelle, setLibelle] = useState("");
  const [compagnieId, setCompagnieId] = useState("");
  const [contratId, setContratId] = useState("");
  const [busy, setBusy] = useState(false);
  const [creation, setCreation] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const creerContrats = useServerFn(creerContratsAssuresFn);
  const recalculer = useServerFn(recalculerPrevisionsAssuresFn);
  const [recalcul, setRecalcul] = useState(false);

  const load = useCallback(async () => {
    const [{ data: rows }, { data: comp }, { data: ctr }] = await Promise.all([
      supabase
        .from("dossier_references_externes")
        .select("id, reference, libelle, compagnie_id, contrat_id, created_at")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: true }),
      supabase.from("compagnies").select("id, nom").order("nom"),
      supabase
        .from("contrats")
        .select("id, numero, assureur, produit, statut, quotite, prime_annuelle, co_emprunteur, date_effet")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: true }),
    ]);
    setRefs((rows ?? []) as Ref[]);
    setCompagnies((comp ?? []) as Compagnie[]);
    const liste = (ctr ?? []) as Contrat[];
    setContrats(liste);
    if (liste.length > 0) {
      const { data: prev } = await supabase
        .from("commission_previsions")
        .select("contrat_id, montant_previsionnel_total")
        .in(
          "contrat_id",
          liste.map((c) => c.id),
        );
      const parContrat: Record<string, number | null> = {};
      for (const p of ((prev ?? []) as Prevision[])) {
        if (p.contrat_id) parContrat[p.contrat_id] = p.montant_previsionnel_total;
      }
      setPrevisions(parContrat);
    } else {
      setPrevisions({});
    }
    setContratId((actuel) => (actuel && liste.some((c) => c.id === actuel) ? actuel : (liste[0]?.id ?? "")));
  }, [dossierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nomAssure = (c: Contrat) => c.co_emprunteur ?? "Assuré principal";

  const creer = async () => {
    setErr(null);
    setInfo(null);
    setCreation(true);
    try {
      const res = await creerContrats({ data: { dossier_id: dossierId } });
      setInfo(
        res.deja_existant
          ? `Contrats déjà créés pour ce prêt (${res.contrats_ids.length}).`
          : `${res.contrats_ids.length} contrat(s) créé(s), un par assuré du prêt.`,
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Création des contrats impossible");
    } finally {
      setCreation(false);
    }
  };

  const lancerRecalcul = async () => {
    setErr(null);
    setInfo(null);
    setRecalcul(true);
    try {
      const res = await recalculer({ data: { dossier_id: dossierId } });
      setInfo(
        res.previsions_enregistrees > 0
          ? `Commission recalculée pour ${res.previsions_enregistrees} contrat(s) d'assuré.${
              res.prevision_dossier_reprise ? " L'ancienne estimation globale du prêt a été reprise par assuré." : ""
            }`
          : `Aucune commission enregistrée : ${res.motif ?? "données insuffisantes"}.`,
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Recalcul impossible");
    } finally {
      setRecalcul(false);
    }
  };

  const ajouter = async () => {
    const valeur = reference.trim();
    setErr(null);
    setInfo(null);
    if (valeur.length < 5) {
      setErr("La référence doit comporter au moins 5 caractères pour servir de preuve de rattachement.");
      return;
    }
    if (contrats.length > 0 && !contratId) {
      setErr("Choisissez l'assuré (le contrat) auquel cette référence appartient.");
      return;
    }
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("dossier_references_externes").insert({
      dossier_id: dossierId,
      contrat_id: contratId || null,
      compagnie_id: compagnieId || null,
      reference: valeur,
      libelle: libelle.trim() || null,
      created_by: auth.user?.id ?? null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setReference("");
    setLibelle("");
    await load();
  };

  const supprimer = async (id: string) => {
    setErr(null);
    const { error } = await supabase.from("dossier_references_externes").delete().eq("id", id);
    if (error) return setErr(error.message);
    await load();
  };

  const inp = "mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink";
  const refsSansContrat = refs.filter((r) => !r.contrat_id);

  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        Contrats par assuré et références de l'assureur
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Le prêt, la lettre de mission et le devoir de conseil restent communs au dossier. En revanche chaque
        assuré a son contrat auprès de la compagnie : sa référence, son statut et sa commission
        prévisionnelle se suivent séparément — un assuré peut être actif avant l'autre.
      </p>

      {contrats.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-line p-4">
          <p className="text-sm text-ink-muted">
            Aucun contrat individuel n'existe encore pour ce prêt. Dès que la compagnie confirme
            l'adhésion, créez un contrat par assuré : les informations connues (assureur, produit, prime,
            quotité, dates) sont reprises automatiquement.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => void creer()}
              disabled={creation}
              className="mt-3 rounded-full bg-ink px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              {creation ? "Création…" : "Créer un contrat par assuré"}
            </button>
          )}
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {contrats.map((c) => {
            const refsContrat = refs.filter((r) => r.contrat_id === c.id);
            return (
              <li key={c.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">
                    {nomAssure(c)}
                    {c.quotite != null ? (
                      <span className="text-ink-muted"> — quotité {c.quotite} %</span>
                    ) : null}
                  </span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs">{c.statut}</span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {c.assureur} · {c.produit} · prime {euro(c.prime_annuelle)}/an ·{" "}
                  {c.date_effet ? `effet ${new Date(c.date_effet).toLocaleDateString("fr-FR")}` : "effet à définir"}
                  {c.numero ? ` · n° ${c.numero}` : ""}
                </p>
                <p className="mt-1 text-xs text-[color:var(--crm-gold)]">
                  Commission prévisionnelle :{" "}
                  {c.id in previsions ? euro(previsions[c.id]) : "à estimer"}
                </p>
                {refsContrat.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    Aucune référence assureur enregistrée pour cet assuré : les e-mails de la compagnie le
                    concernant resteront à qualifier par un humain.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {refsContrat.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium text-ink">{r.reference}</span>
                          {r.libelle ? <span className="text-ink-muted"> — {r.libelle}</span> : null}
                          {r.compagnie_id ? (
                            <span className="text-ink-muted">
                              {" "}
                              · {compagnies.find((x) => x.id === r.compagnie_id)?.nom ?? "compagnie"}
                            </span>
                          ) : null}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => void supprimer(r.id)}
                            className="shrink-0 text-xs underline underline-offset-4"
                          >
                            Supprimer
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {refsSansContrat.length > 0 && (
        <div className="mt-3 rounded-xl border border-line p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Références du dossier non encore affectées à un assuré
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {refsSansContrat.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-ink">{r.reference}</span>
                  {r.libelle ? <span className="text-ink-muted"> — {r.libelle}</span> : null}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void supprimer(r.id)}
                    className="shrink-0 text-xs underline underline-offset-4"
                  >
                    Supprimer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Assuré concerné</span>
            <select
              value={contratId}
              onChange={(e) => setContratId(e.target.value)}
              disabled={contrats.length === 0}
              className={inp}
            >
              {contrats.length === 0 ? (
                <option value="">Aucun contrat individuel</option>
              ) : (
                contrats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nomAssure(c)}
                    {c.quotite != null ? ` — ${c.quotite} %` : ""}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Référence</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex : ADH-2026-114578"
              className={inp}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Nature</span>
            <input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Numéro d'adhésion, référence d'étude…"
              className={inp}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Compagnie</span>
            <select value={compagnieId} onChange={(e) => setCompagnieId(e.target.value)} className={inp}>
              <option value="">—</option>
              {compagnies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => void ajouter()}
              disabled={busy}
              className="rounded-full bg-ink px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Enregistrement…" : "Ajouter cette référence"}
            </button>
          </div>
        </div>
      )}

      {info && <p className="mt-2 text-xs text-ink-muted">{info}</p>}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
