import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { StoredImage } from "@/components/image-upload-field";

export const Route = createFileRoute("/_authenticated/espace/compagnies/")({
  component: CompagniesIndex,
});

type Compagnie = {
  id: string;
  nom: string;
  slug: string;
  logo_url: string | null;
  statut: "actif" | "prospect" | "inactif";
  api_active: boolean;
  site_web: string | null;
  contact_nom: string | null;
  created_at: string;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function CompagniesIndex() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<Compagnie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [nom, setNom] = useState("");
  const [statut, setStatut] = useState<"actif" | "prospect" | "inactif">("actif");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("compagnies")
      .select("id,nom,slug,logo_url,statut,api_active,site_web,contact_nom,created_at")
      .order("nom");
    if (error) setError(error.message);
    setRows((data as Compagnie[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    setCreating(true);
    setError(null);
    const slug = slugify(nom);
    const { error } = await supabase.from("compagnies").insert({ nom: nom.trim(), slug, statut });
    setCreating(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNom("");
    load();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Compagnies partenaires</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Référentiel des assureurs, de leurs produits et de leurs documents contractuels.
          </p>
        </div>
      </div>

      {isAdmin && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex-1 min-w-[220px]">
            <label className="mb-1 block text-xs font-medium text-ink-muted">Nouvelle compagnie</label>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex : April, Generali, Metlife…"
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Statut</label>
            <select
              value={statut}
              onChange={(e) => setStatut(e.target.value as "actif" | "prospect" | "inactif")}
              className="rounded-md border border-line bg-background px-3 py-2 text-sm"
            >
              <option value="actif">Actif</option>
              <option value="prospect">En cours</option>
              <option value="inactif">Inactif</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {creating ? "Ajout…" : "Ajouter"}
          </button>
        </form>
      )}

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {loading ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Aucune compagnie encore enregistrée.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 text-left">Compagnie</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-left">API</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <StoredImage
                        bucket="compagnies-logos"
                        value={c.logo_url}
                        alt={c.nom}
                        className="size-8 rounded object-contain"
                        fallback={
                          <div className="flex size-8 items-center justify-center rounded bg-surface text-xs text-ink-muted">
                            {c.nom.slice(0, 2).toUpperCase()}
                          </div>
                        }
                      />

                      <div>
                        <div className="font-medium text-ink">{c.nom}</div>
                        <div className="text-xs text-ink-muted">{c.site_web ?? "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{c.contact_nom ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (c.statut === "actif"
                          ? "bg-emerald-50 text-emerald-800"
                          : c.statut === "prospect"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-zinc-100 text-zinc-600")
                      }
                    >
                      {c.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.api_active ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-800">Connectée</span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/espace/compagnies/$id"
                      params={{ id: c.id }}
                      className="text-sm font-medium text-ink underline underline-offset-4"
                    >
                      Ouvrir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
