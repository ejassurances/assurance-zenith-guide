import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { envoyerEmailCrm } from "@/lib/emails.functions";

export interface EmailLiens {
  client_id?: string | null;
  dossier_id?: string | null;
  contrat_id?: string | null;
  compagnie_id?: string | null;
}

/** Fenêtre de rédaction d'un email envoyé depuis la boîte du cabinet. */
export function EmailComposeDialog({
  open,
  onClose,
  onSent,
  defaultTo,
  defaultSujet,
  threadId,
  liens,
}: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  defaultTo?: string | null;
  defaultSujet?: string | null;
  threadId?: string | null;
  liens?: EmailLiens;
}) {
  const envoyer = useServerFn(envoyerEmailCrm);
  const [to, setTo] = useState(defaultTo ?? "");
  const [cc, setCc] = useState("");
  const [sujet, setSujet] = useState(defaultSujet ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await envoyer({
        data: {
          to: to.trim(),
          cc: cc.trim() || null,
          sujet: sujet.trim(),
          message,
          thread_id: threadId ?? null,
          client_id: liens?.client_id ?? null,
          dossier_id: liens?.dossier_id ?? null,
          contrat_id: liens?.contrat_id ?? null,
          compagnie_id: liens?.compagnie_id ?? null,
        },
      });
      setMessage("");
      onSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl space-y-3 rounded-2xl border border-line bg-surface-elevated p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Nouvel email</h2>
          <button type="button" onClick={onClose} className="text-sm text-ink-muted hover:underline">
            Fermer
          </button>
        </div>

        <input
          required
          type="email"
          placeholder="Destinataire *"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
        <input
          placeholder="Copie (Cc)"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Objet *"
          value={sujet}
          onChange={(e) => setSujet(e.target.value)}
          className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
        <textarea
          required
          rows={10}
          placeholder="Votre message…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
        />

        {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-800">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-1.5 text-sm">
            Annuler
          </button>
          <button
            disabled={busy}
            className="rounded-full bg-ink px-5 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </form>
    </div>
  );
}
