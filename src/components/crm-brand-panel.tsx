import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { syncClientToWebhook } from "@/lib/crm-webhook.functions";
import { BESOINS, DDA_STATUTS, MARQUE_KEYS, MARQUES, besoinLabel, ddaStatut, marque } from "@/lib/crm-brands";

type Row = { marque: string; besoins: string[] | null; dda_statut: string };

/** Panneau marque d'origine / besoins / statut DDA + synchronisation webhook. */
export function CrmBrandPanel({ clientId, canEdit, compact = false }: { clientId: string; canEdit: boolean; compact?: boolean }) {
  const [row, setRow] = useState<Row | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const sync = useServerFn(syncClientToWebhook);

  const load = async () => {
    const { data } = await supabase
      .from("clients")
      .select("marque,besoins,dda_statut")
      .eq("id", clientId)
      .maybeSingle();
    setRow((data as Row | null) ?? null);
  };
  useEffect(() => {
    load();
  }, [clientId]);

  if (!row) return null;

  const m = marque(row.marque);
  const dda = ddaStatut(row.dda_statut);
  const besoins = row.besoins ?? [];

  const save = async (patch: Partial<Row>) => {
    setSaving(true);
    await supabase.from("clients").update(patch as never).eq("id", clientId);
    setSaving(false);
    await load();
  };

  const toggleBesoin = (key: string) => {
    const next = besoins.includes(key) ? besoins.filter((b) => b !== key) : [...besoins, key];
    save({ besoins: next });
  };

  const pousser = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      await sync({ data: { client_id: clientId, event: "client.sync" } });
      setSyncMsg("Fiche transmise au webhook.");
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={compact ? "border-t border-line pt-4" : "rounded-2xl border border-line bg-surface-elevated p-5"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${m.badge}`}>
            <span className={`size-1.5 rounded-full ${m.dot}`} />
            {m.label}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${dda.badge}`}>{dda.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface"
            >
              {editing ? "Fermer" : "Modifier"}
            </button>
          )}
          {canEdit && (
            <button
              onClick={pousser}
              disabled={syncing}
              className="rounded-md bg-ink px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {syncing ? "Envoi…" : "Envoyer au webhook"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {besoins.length === 0 ? (
          <p className="text-xs text-ink-muted">Aucun besoin renseigné.</p>
        ) : (
          besoins.map((b) => (
            <span key={b} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-soft">
              {besoinLabel(b)}
            </span>
          ))
        )}
      </div>

      {syncMsg && <p className="mt-3 text-xs text-ink-muted">{syncMsg}</p>}

      {editing && canEdit && (
        <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <label className="text-xs">
            <span className="font-medium uppercase tracking-wide text-ink-muted">Marque d'origine</span>
            <select
              value={row.marque}
              onChange={(e) => save({ marque: e.target.value })}
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            >
              {MARQUE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {MARQUES[k].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="font-medium uppercase tracking-wide text-ink-muted">Statut DDA</span>
            <select
              value={row.dda_statut}
              onChange={(e) => save({ dda_statut: e.target.value })}
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            >
              {DDA_STATUTS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Besoins</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BESOINS.map((b) => {
                const on = besoins.includes(b.key);
                return (
                  <button
                    key={b.key}
                    type="button"
                    disabled={saving}
                    onClick={() => toggleBesoin(b.key)}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (on ? "border-transparent bg-ink text-primary-foreground" : "border-line text-ink-soft hover:bg-surface")
                    }
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
