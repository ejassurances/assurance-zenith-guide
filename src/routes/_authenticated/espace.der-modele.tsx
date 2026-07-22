import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/espace/der-modele")({
  component: DerModelePage,
});

type Modele = {
  id: string;
  version: string;
  nom: string;
  storage_path: string;
  actif: boolean;
  notes: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

function DerModelePage() {
  const { role, user, loading: authLoading } = useAuth();
  const isAdmin = role === "admin";
  const [items, setItems] = useState<Modele[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState("");
  const [nom, setNom] = useState("DER classique EJ Partners Assurances");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("der_modele")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Modele[]);
    setLoading(false);
  };
  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !version.trim() || !nom.trim()) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "pdf";
    const path = `der-modele/${Date.now()}_v${version}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("conformite-documents")
      .upload(path, file, { upsert: false });
    if (upErr) {
      setUploading(false);
      alert("Erreur upload : " + upErr.message);
      return;
    }
    const { error } = await supabase.from("der_modele").insert({
      version,
      nom,
      storage_path: path,
      notes: notes || null,
      actif: false,
      updated_by: user?.id,
    });
    setUploading(false);
    if (!error) {
      setVersion("");
      setNotes("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } else {
      alert("Erreur : " + error.message);
    }
  };

  const activate = async (id: string) => {
    // Désactive tous puis active le sélectionné
    await supabase.from("der_modele").update({ actif: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await supabase.from("der_modele").update({ actif: true, updated_by: user?.id }).eq("id", id);
    if (error) alert(error.message);
    load();
  };

  const download = async (m: Modele) => {
    const { data, error } = await supabase.storage
      .from("conformite-documents")
      .createSignedUrl(m.storage_path, 300);
    if (error || !data) return alert("Impossible d'obtenir le lien");
    window.open(data.signedUrl, "_blank");
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette version du DER ?")) return;
    const m = items.find((x) => x.id === id);
    if (m) {
      await supabase.storage.from("conformite-documents").remove([m.storage_path]);
    }
    await supabase.from("der_modele").delete().eq("id", id);
    load();
  };

  if (authLoading) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (role !== "admin" && role !== "mandataire" && role !== "prescripteur") {
    return <p className="text-sm text-ink-muted">Accès réservé.</p>;
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-medium text-ink">DER — Document d'Entrée en Relation</h1>
      <p className="mt-1 text-sm text-ink-muted">
        DER classique du cabinet. Envoyé à chaque création d'une fiche client.
        {!isAdmin && " Lecture seule — seul l'administrateur peut modifier le modèle."}
      </p>

      {isAdmin && (
        <form onSubmit={upload} className="mt-6 grid gap-3 rounded-2xl border border-line bg-surface-elevated p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="font-serif text-lg font-medium">Nouvelle version</h2>
          </div>
          <input
            required
            placeholder="Version (ex: 2024.1)"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Nom du document"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
          <input
            ref={fileInputRef}
            required
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:col-span-2"
          />
          <textarea
            placeholder="Notes (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={uploading}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {uploading ? "Envoi…" : "Ajouter la version"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface-elevated">
        {loading ? (
          <p className="p-4 text-sm text-ink-muted">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Aucun DER pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Mis à jour</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{m.version}</td>
                  <td className="px-4 py-3">
                    <div className="text-ink">{m.nom}</div>
                    {m.notes && <div className="text-xs text-ink-muted">{m.notes}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {m.actif ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                        Actif
                      </span>
                    ) : (
                      <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
                        Archive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {new Date(m.updated_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => download(m)}
                        className="text-xs text-ink underline hover:text-ink-soft"
                      >
                        Télécharger
                      </button>
                      {isAdmin && !m.actif && (
                        <button
                          onClick={() => activate(m.id)}
                          className="text-xs text-emerald-700 underline hover:text-emerald-900"
                        >
                          Activer
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => remove(m.id)}
                          className="text-xs text-red-700 underline hover:text-red-900"
                        >
                          Supprimer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
