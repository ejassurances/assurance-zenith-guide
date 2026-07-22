import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/espace/dossiers/$id")({
  component: DossierDetail,
});

type Dossier = {
  id: string;
  reference: string;
  client_nom: string;
  client_email: string | null;
  client_phone: string | null;
  statut: "nouveau" | "en_cours" | "signe" | "perdu";
  capital: number | null;
  duree_mois: number | null;
  age: number | null;
  fumeur: boolean | null;
  economie_estimee: number | null;
  notes: string | null;
  created_at: string;
};

function DossierDetail() {
  const { id } = useParams({ from: "/_authenticated/espace/dossiers/$id" });
  const { user, role } = useAuth();
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("dossiers").select("*").eq("id", id).maybeSingle();
    if (error) setError(error.message);
    setDossier(data as Dossier | null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!dossier) return <p className="text-sm text-ink-muted">Dossier introuvable ou accès refusé.</p>;

  const canEdit = role === "admin" || role === "mandataire" || role === "prescripteur";

  const updateStatut = async (statut: Dossier["statut"]) => {
    await supabase.from("dossiers").update({ statut }).eq("id", id);
    load();
  };

  return (
    <div className="space-y-8">
      <div>
        <Link to="/espace/dossiers" className="text-sm text-ink-muted hover:text-ink">
          ← Retour aux dossiers
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-medium text-ink">{dossier.client_nom}</h1>
        <p className="mt-1 text-sm text-ink-muted">Référence {dossier.reference}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Informations client">
          <Row label="Email">{dossier.client_email ?? "—"}</Row>
          <Row label="Téléphone">{dossier.client_phone ?? "—"}</Row>
          <Row label="Âge">{dossier.age ?? "—"}</Row>
          <Row label="Fumeur">{dossier.fumeur ? "Oui" : "Non"}</Row>
        </Section>
        <Section title="Prêt">
          <Row label="Capital">
            {dossier.capital ? `${Number(dossier.capital).toLocaleString("fr-FR")} €` : "—"}
          </Row>
          <Row label="Durée">{dossier.duree_mois ? `${dossier.duree_mois} mois` : "—"}</Row>
          <Row label="Économie estimée">
            {dossier.economie_estimee ? `${Number(dossier.economie_estimee).toLocaleString("fr-FR")} €` : "—"}
          </Row>
          <Row label="Statut">
            {canEdit ? (
              <select
                value={dossier.statut}
                onChange={(e) => updateStatut(e.target.value as Dossier["statut"])}
                className="rounded-md border border-line bg-background px-2 py-1 text-sm"
              >
                <option value="nouveau">Nouveau</option>
                <option value="en_cours">En cours</option>
                <option value="signe">Signé</option>
                <option value="perdu">Perdu</option>
              </select>
            ) : (
              dossier.statut
            )}
          </Row>
        </Section>
      </div>

      {dossier.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap text-sm text-ink-soft">{dossier.notes}</p>
        </Section>
      )}

      <MessagesPanel dossierId={id} userId={user!.id} />
      <DocumentsPanel dossierId={id} userId={user!.id} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <h2 className="font-serif text-lg font-medium text-ink">{title}</h2>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{children}</span>
    </div>
  );
}

type Msg = { id: string; auteur_id: string; contenu: string; created_at: string };

function MessagesPanel({ dossierId, userId }: { dossierId: string; userId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("messages")
      .select("id,auteur_id,contenu,created_at")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: true });
    setMsgs(data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`msgs-${dossierId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `dossier_id=eq.${dossierId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [dossierId]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      dossier_id: dossierId,
      auteur_id: userId,
      contenu: text.trim(),
    });
    setSending(false);
    if (!error) setText("");
  };

  return (
    <Section title="Messagerie">
      <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
        {msgs.length === 0 && <p className="text-ink-muted">Aucun message.</p>}
        {msgs.map((m) => {
          const mine = m.auteur_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  "max-w-[80%] rounded-2xl px-4 py-2 text-sm " +
                  (mine ? "bg-ink text-primary-foreground" : "bg-surface text-ink")
                }
              >
                <p className="whitespace-pre-wrap">{m.contenu}</p>
                <p className={"mt-1 text-[10px] " + (mine ? "text-primary-foreground/70" : "text-ink-muted")}>
                  {new Date(m.created_at).toLocaleString("fr-FR")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écrire un message…"
          className="flex-1 rounded-full border border-line bg-background px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
    </Section>
  );
}

type Doc = {
  id: string;
  file_name: string;
  file_size: number | null;
  storage_path: string;
  created_at: string;
  uploader_id: string;
};

function DocumentsPanel({ dossierId, userId }: { dossierId: string; userId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id,file_name,file_size,storage_path,created_at,uploader_id")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  };

  useEffect(() => {
    load();
  }, [dossierId]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const path = `${dossierId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("dossier-documents").upload(path, file);
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { error: dbErr } = await supabase.from("documents").insert({
      dossier_id: dossierId,
      uploader_id: userId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
    });
    setUploading(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  const download = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("dossier-documents").createSignedUrl(path, 60);
    if (error || !data) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  };

  const remove = async (doc: Doc) => {
    await supabase.storage.from("dossier-documents").remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    load();
  };

  return (
    <Section title="Documents">
      <div className="flex items-center gap-3">
        <label className="cursor-pointer rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground">
          {uploading ? "Envoi…" : "Ajouter un document"}
          <input ref={fileRef} type="file" onChange={onUpload} className="hidden" disabled={uploading} />
        </label>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      <ul className="mt-4 space-y-2">
        {docs.length === 0 && <li className="text-ink-muted">Aucun document.</li>}
        {docs.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-md border border-line bg-background px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{d.file_name}</p>
              <p className="text-xs text-ink-muted">
                {d.file_size ? `${(d.file_size / 1024).toFixed(0)} Ko · ` : ""}
                {new Date(d.created_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => download(d.storage_path, d.file_name)}
                className="rounded-full border border-line px-3 py-1 text-xs hover:bg-surface"
              >
                Télécharger
              </button>
              {d.uploader_id === userId && (
                <button
                  onClick={() => remove(d)}
                  className="rounded-full border border-line px-3 py-1 text-xs text-destructive hover:bg-surface"
                >
                  Supprimer
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
