/**
 * Références internes de l'assureur pour un dossier (étape « Analyse et
 * décision »).
 *
 * Le conseiller enregistre ici la référence communiquée par la compagnie
 * (numéro d'adhésion, référence d'étude, dossier partenaire). L'agent qui lit
 * les e-mails s'en sert pour rattacher un message au bon dossier, sur preuve
 * exacte uniquement — un simple nom ne suffit jamais.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Ref = {
  id: string;
  reference: string;
  libelle: string | null;
  compagnie_id: string | null;
  assure_rang: number | null;
  created_at: string;
};

type Compagnie = { id: string; nom: string };

export function DossierReferencesExternesPanel({
  dossierId,
  canEdit = true,
}: {
  dossierId: string;
  canEdit?: boolean;
}) {
  const [refs, setRefs] = useState<Ref[]>([]);
  const [compagnies, setCompagnies] = useState<Compagnie[]>([]);
  const [reference, setReference] = useState("");
  const [libelle, setLibelle] = useState("");
  const [compagnieId, setCompagnieId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: rows }, { data: comp }] = await Promise.all([
      supabase
        .from("dossier_references_externes")
        .select("id, reference, libelle, compagnie_id, assure_rang, created_at")
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: true }),
      supabase.from("compagnies").select("id, nom").order("nom"),
    ]);
    setRefs((rows ?? []) as Ref[]);
    setCompagnies((comp ?? []) as Compagnie[]);
  }, [dossierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ajouter = async () => {
    const valeur = reference.trim();
    setErr(null);
    if (valeur.length < 5) {
      setErr("La référence doit comporter au moins 5 caractères pour servir de preuve de rattachement.");
      return;
    }
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("dossier_references_externes").insert({
      dossier_id: dossierId,
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

  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        Références internes de l'assureur
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Ces références permettent à l'agent de rattacher automatiquement les e-mails de la compagnie à ce
        dossier. Sans référence exacte, un e-mail reste à qualifier par un humain.
      </p>

      {refs.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Aucune référence enregistrée pour ce dossier.</p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm">
          {refs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink">{r.reference}</span>
                {r.libelle ? <span className="text-ink-muted"> — {r.libelle}</span> : null}
                {r.compagnie_id ? (
                  <span className="text-ink-muted">
                    {" "}
                    · {compagnies.find((c) => c.id === r.compagnie_id)?.nom ?? "compagnie"}
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

      {canEdit && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
          <div className="sm:col-span-3">
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

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
