import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Doc = {
  id: string;
  file_name: string;
  file_size: number | null;
  storage_path: string;
  created_at: string;
  type_document: string | null;
};

/** Typologie des pièces contractuelles archivées sur un contrat. */
const TYPES_DOCUMENT = [
  { code: "attestation_assurance", libelle: "Attestation d'assurance" },
  { code: "avis_echeance", libelle: "Avis d'échéance" },
  { code: "conditions_particulieres", libelle: "Conditions particulières" },
  { code: "autre", libelle: "Autre" },
] as const;

function libelleType(code: string | null): string {
  return TYPES_DOCUMENT.find((t) => t.code === code)?.libelle ?? "Type non précisé";
}

/**
 * Archivage libre des documents d'un contrat (police, avis d'échéance,
 * conditions particulières…), indépendamment du parcours DDA.
 */
export function ContratDocumentsPanel({
  contratId,
  clientId,
  userId,
  canEdit = true,
}: {
  contratId: string;
  /** Client titulaire : le fichier est rangé dans son dossier pour l'espace client. */
  clientId: string;
  userId: string;
  canEdit?: boolean;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>("attestation_assurance");
  const fileRef = useRef<HTMLInputElement>(null);


  const load = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id,file_name,file_size,storage_path,created_at,type_document")
      .eq("contrat_id", contratId)
      .order("created_at", { ascending: false });
    setDocs((data ?? []) as Doc[]);
  };

  useEffect(() => {
    load();
  }, [contratId]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    // Le 1er segment doit être l'identifiant du client : les règles d'accès du
    // stockage s'appuient sur lui (et le client retrouve la pièce dans son espace).
    const path = `${clientId}/contrats/${contratId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("dossier-documents").upload(path, file);
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { error: dbErr } = await supabase.from("documents").insert({
      contrat_id: contratId,
      uploader_id: userId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      type_document: type,
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
    const { data, error: sErr } = await supabase.storage.from("dossier-documents").createSignedUrl(path, 60);
    if (sErr || !data) return;
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
    <section className="min-w-0 space-y-3 rounded-lg border border-line bg-surface p-5">
      <div>
        <h3 className="font-serif text-lg">Documents du contrat</h3>
        <p className="text-xs text-ink-muted">
          Archivage libre des pièces contractuelles (police d'assurance, avis d'échéance, conditions
          particulières…), indépendamment du parcours DDA. Utile lors de l'import d'un client dont le contrat
          est déjà en cours.
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            {TYPES_DOCUMENT.map((t) => (
              <option key={t.code} value={t.code}>
                {t.libelle}
              </option>
            ))}
          </select>
          <label className="cursor-pointer rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground">
            {uploading ? "Envoi…" : "Ajouter un document"}
            <input ref={fileRef} type="file" onChange={onUpload} className="hidden" disabled={uploading} />
          </label>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )}

      <ul className="space-y-2">
        {docs.length === 0 && <li className="text-sm text-ink-muted">Aucun document rattaché à ce contrat.</li>}
        {docs.map((d) => (
          <li
            key={d.id}
            className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-line bg-background px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{d.file_name}</p>
              <p className="text-xs text-ink-muted">
                {libelleType(d.type_document)}{" · "}
                {d.file_size ? `${(d.file_size / 1024).toFixed(0)} Ko · ` : ""}
                {new Date(d.created_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => download(d.storage_path, d.file_name)}
                className="rounded-full border border-line px-3 py-1 text-xs hover:bg-surface"
              >
                Télécharger
              </button>
              {canEdit && (
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
    </section>
  );
}
