import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  clientId: string;
  clientLabel: string;
  /** Appelé après suppression réussie */
  onDeleted: () => void;
  variant?: "button" | "icon";
};

/**
 * Suppression définitive d'une fiche client (admin uniquement côté RLS).
 * La suppression entraîne celle des données rattachées (documents, tâches,
 * contrats, dossiers liés…) via la base de données.
 */
export function DeleteClientButton({ clientId, clientLabel, onDeleted, variant = "button" }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setConfirmText("");
    setError(null);
  };

  const remove = async () => {
    setDeleting(true);
    setError(null);
    const { error: err } = await supabase.from("clients").delete().eq("id", clientId);
    setDeleting(false);
    if (err) {
      setError(err.message);
      return;
    }
    close();
    onDeleted();
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Supprimer la fiche"
          aria-label={`Supprimer la fiche de ${clientLabel}`}
          className="rounded-md border border-line px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
        >
          Supprimer
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          Supprimer la fiche
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface-elevated p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-ink">Supprimer définitivement cette fiche ?</h2>
            <p className="mt-2 text-sm text-ink-soft">
              La fiche <strong>{clientLabel}</strong> ainsi que ses données rattachées (identité, famille,
              documents, pièces KYC, tâches, activités, contrats, sinistres, DER) seront supprimées de manière
              irréversible.
            </p>
            <p className="mt-3 text-xs text-ink-muted">
              Pour confirmer, saisissez <span className="font-mono font-semibold">SUPPRIMER</span> :
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
              className="mt-2 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
            {error && <p className="mt-3 text-xs text-destructive">Suppression impossible : {error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-full border border-line px-4 py-2 text-sm text-ink-soft hover:bg-surface"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={confirmText.trim().toUpperCase() !== "SUPPRIMER" || deleting}
                onClick={remove}
                className="rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50"
              >
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
