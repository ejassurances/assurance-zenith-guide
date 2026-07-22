import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/espace/audit-logs")({
  component: AuditLogsPage,
});

type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  old_data: unknown;
  new_data: unknown;
  metadata: unknown;
  created_at: string;
};

const ACTION_COLOR: Record<string, string> = {
  INSERT: "bg-emerald-100 text-emerald-900",
  UPDATE: "bg-amber-100 text-amber-900",
  DELETE: "bg-red-100 text-red-900",
  SELECT: "bg-sky-100 text-sky-900",
  EXECUTE: "bg-violet-100 text-violet-900",
};

function AuditLogsPage() {
  const { role, loading: authLoading } = useAuth();
  const [items, setItems] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterTarget, setFilterTarget] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || role !== "admin") return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      setItems((data ?? []) as AuditLog[]);
      setLoading(false);
    })();
  }, [authLoading, role]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterAction && it.action !== filterAction) return false;
      if (filterTarget && !it.target_type.includes(filterTarget)) return false;
      if (q) {
        const hay = `${it.actor_email ?? ""} ${it.target_type} ${it.target_id ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, filterAction, filterTarget, q]);

  if (authLoading) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (role !== "admin") return <p className="text-sm text-ink-muted">Accès réservé aux administrateurs.</p>;

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium text-ink">Journaux d'audit</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Traçabilité des accès et modifications sur les configurations sensibles et fonctions protégées.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          placeholder="Rechercher (email, cible…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64 rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        >
          <option value="">Toutes les actions</option>
          <option value="INSERT">Création</option>
          <option value="UPDATE">Modification</option>
          <option value="DELETE">Suppression</option>
          <option value="SELECT">Consultation</option>
          <option value="EXECUTE">Exécution fonction</option>
        </select>
        <select
          value={filterTarget}
          onChange={(e) => setFilterTarget(e.target.value)}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        >
          <option value="">Toutes cibles</option>
          <option value="table:compagnies_api_config">Config API compagnies</option>
          <option value="function:">Fonctions SECURITY DEFINER</option>
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface-elevated">
        {loading ? (
          <p className="p-4 text-sm text-ink-muted">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Aucun événement.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Auteur</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Cible</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => [
                <tr key={it.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 text-xs text-ink-muted">
                    {new Date(it.created_at).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-ink">{it.actor_email ?? "—"}</div>
                    <div className="text-[10px] uppercase tracking-wide text-ink-muted">{it.actor_role ?? ""}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (ACTION_COLOR[it.action] ?? "bg-surface text-ink-soft")
                      }
                    >
                      {it.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{it.target_type}</td>
                  <td className="px-4 py-2 font-mono text-[10px] text-ink-muted">
                    {it.target_id ? it.target_id.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {Boolean(it.old_data || it.new_data || it.metadata) && (
                      <button
                        onClick={() => setExpanded(expanded === it.id ? null : it.id)}
                        className="text-xs text-ink-muted underline hover:text-ink"
                      >
                        {expanded === it.id ? "Masquer" : "Détails"}
                      </button>
                    )}
                  </td>
                </tr>,
                expanded === it.id ? (
                  <tr key={it.id + "-d"} className="border-b border-line bg-background/40">
                    <td colSpan={6} className="px-4 py-3">
                      {it.old_data ? (
                        <div className="mb-2">
                          <div className="text-xs font-semibold text-ink-muted">Avant</div>
                          <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-[11px]">
                            {JSON.stringify(it.old_data, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      {it.new_data ? (
                        <div className="mb-2">
                          <div className="text-xs font-semibold text-ink-muted">Après</div>
                          <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-[11px]">
                            {JSON.stringify(it.new_data, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      {it.metadata ? (
                        <div>
                          <div className="text-xs font-semibold text-ink-muted">Métadonnées</div>
                          <pre className="mt-1 overflow-x-auto rounded bg-surface p-2 text-[11px]">
                            {JSON.stringify(it.metadata, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ) : null,
              ])}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        {filtered.length} événement{filtered.length > 1 ? "s" : ""} affiché
        {filtered.length > 1 ? "s" : ""} (500 derniers chargés).
      </p>
    </div>
  );
}
