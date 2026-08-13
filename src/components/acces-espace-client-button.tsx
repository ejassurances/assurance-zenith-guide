import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { creerAccesEspaceClient } from "@/lib/client-espace.functions";

/**
 * Crée ou réinitialise l'accès à l'espace client et envoie le mot de passe
 * provisoire par e-mail (admin / mandataire uniquement).
 */
export function AccesEspaceClientButton({
  clientId,
  hasAccount,
  disabled,
}: {
  clientId: string;
  hasAccount: boolean;
  disabled?: boolean;
}) {
  const run = useServerFn(creerAccesEspaceClient);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await run({ data: { client_id: clientId, origin: window.location.origin } });
      if (!res.ok) {
        setMsg({ type: "err", text: res.error });
      } else if (res.email_sent) {
        setMsg({
          type: "ok",
          text: res.created
            ? "Espace créé — e-mail avec mot de passe provisoire envoyé."
            : "Nouvel accès envoyé par e-mail (mot de passe provisoire).",
        });
      } else {
        setMsg({ type: "err", text: "Accès créé mais l'e-mail n'a pas pu être envoyé." });
      }
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erreur inattendue" });
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={submit}
        disabled={busy || disabled}
        className="rounded-full border border-line bg-surface-elevated px-4 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
      >
        {busy ? "Envoi…" : hasAccount ? "Renvoyer les accès espace client" : "Créer l'espace client"}
      </button>
      {msg && (
        <span className={`text-[11px] ${msg.type === "ok" ? "text-ink-muted" : "text-destructive"}`}>{msg.text}</span>
      )}
    </div>
  );
}
