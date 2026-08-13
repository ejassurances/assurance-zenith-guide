import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_SIZE = 2 * 1024 * 1024;

/** Aperçu d'une image stockée : URL publique (http) ou chemin dans un bucket privé. */
export function StoredImage({
  bucket,
  value,
  alt,
  className,
  fallback,
}: {
  bucket: string;
  value: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setUrl(null);
      return;
    }
    if (/^https?:\/\//.test(value)) {
      setUrl(value);
      return;
    }
    supabase.storage
      .from(bucket)
      .createSignedUrl(value, 3600)
      .then(({ data }) => {
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, value]);

  if (!url) return <>{fallback ?? null}</>;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}

/** Champ d'upload d'image (png/jpg/webp/svg, 2 Mo max). */
export function ImageUploadField({
  bucket,
  prefix,
  value,
  label,
  onUploaded,
  canEdit = true,
  previewClassName = "size-20 rounded object-contain",
}: {
  bucket: string;
  prefix: string;
  value: string | null;
  label: string;
  onUploaded: (path: string | null) => void | Promise<void>;
  canEdit?: boolean;
  previewClassName?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Formats acceptés : PNG, JPG, WEBP ou SVG.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("Image trop lourde (2 Mo maximum).");
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${prefix}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (upErr) {
      setBusy(false);
      setError(upErr.message);
      return;
    }
    await onUploaded(path);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove() {
    setBusy(true);
    if (value && !/^https?:\/\//.test(value)) {
      await supabase.storage.from(bucket).remove([value]);
    }
    await onUploaded(null);
    setBusy(false);
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-muted">{label}</label>
      <div className="flex items-center gap-3">
        <StoredImage
          bucket={bucket}
          value={value}
          alt={label}
          className={previewClassName}
          fallback={
            <div className="flex size-20 items-center justify-center rounded border border-dashed border-line text-[10px] text-ink-muted">
              Aucune image
            </div>
          }
        />
        {canEdit && (
          <div className="space-y-1">
            <label className="inline-block cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs hover:bg-surface">
              {busy ? "Envoi…" : value ? "Changer" : "Ajouter"}
              <input
                ref={inputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg"
                onChange={onFile}
                disabled={busy}
                className="hidden"
              />
            </label>
            {value && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="ml-2 rounded-full border border-line px-3 py-1.5 text-xs text-destructive hover:bg-surface"
              >
                Retirer
              </button>
            )}
            <p className="text-[11px] text-ink-muted">PNG, JPG, WEBP ou SVG — 2 Mo max.</p>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
