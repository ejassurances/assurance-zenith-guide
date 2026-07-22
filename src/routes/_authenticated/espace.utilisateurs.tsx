import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/espace/utilisateurs")({
  component: UsersPage,
});

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  company: string | null;
  phone: string | null;
};
type Role = "admin" | "mandataire" | "client" | "prescripteur";

function UsersPage() {
  const { role: myRole } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, Role[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: r, error: rErr }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,company,phone"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    if (rErr) setError(rErr.message);
    setProfiles(p ?? []);
    const map: Record<string, Role[]> = {};
    for (const row of r ?? []) {
      const arr = map[row.user_id] ?? [];
      arr.push(row.role as Role);
      map[row.user_id] = arr;
    }
    setRolesByUser(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (myRole !== "admin") {
    return <p className="text-sm text-ink-muted">Accès réservé aux administrateurs.</p>;
  }

  const setRole = async (userId: string, newRole: Role) => {
    // remove existing then set
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    load();
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium text-ink">Utilisateurs</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Attribuez à chaque utilisateur son rôle : administrateur, mandataire, prescripteur ou client.
      </p>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-surface-elevated">
        {loading ? (
          <p className="p-6 text-sm text-ink-muted">Chargement…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Rôle</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const current = (rolesByUser[p.id] ?? [])[0];
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">{p.full_name ?? "—"}</td>
                    <td className="px-4 py-3">{p.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={current ?? ""}
                        onChange={(e) => setRole(p.id, e.target.value as Role)}
                        className="rounded-md border border-line bg-background px-2 py-1 text-sm"
                      >
                        <option value="" disabled>
                          —
                        </option>
                        <option value="admin">Administrateur</option>
                        <option value="mandataire">Mandataire</option>
                        <option value="prescripteur">Prescripteur</option>
                        <option value="client">Client</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
