import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { creerAccesEspaceClient, renvoyerLienConnexion } from "@/lib/client-espace.functions";

/**
 * Crée ou réinitialise l'accès à l'espace client (mot de passe provisoire),
 * et permet le renvoi d'un e-mail court contenant uniquement le lien de
 * connexion (admin / mandataire uniquement).
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
  const runLien = useServerFn(renvoyerLienConnexion);
  const [busy, setBusy] = useState<null | "acces" | "lien">(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const submit = async () => {
    setBusy("acces");
    setMsg(null);
    try {
      const res = await run({ data: { client_id: clientId, origin: window.location.origin } });
      if (!res.ok) {
        setMsg({ type: "err", text: res.error });
      } else if (res.email_sent) {
        setMsg({
          type: "ok",
          text: res.created
            ? "Espace créé — e-mail avec mot de passe provisoire envoyé (DER inclus)."
            : "Nouvel accès envoyé par e-mail (mot de passe provisoire).",
        });
      } else {
        setMsg({
          type: "err",
          text: res.email_error
            ? `Accès créé mais e-mail non envoyé : ${res.email_error}`
            : "Accès créé mais l'e-mail n'a pas pu être envoyé.",
        });
      }
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erreur inattendue" });
    }
    setBusy(null);
  };

  const submitLien = async () => {
    setBusy("lien");
    setMsg(null);
    try {
      const res = await runLien({ data: { client_id: clientId } });
      setMsg(
        res.ok
          ? { type: "ok", text: "Lien de connexion renvoyé (e-mail court, sans DER)." }
          : { type: "err", text: res.error },
      );
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erreur inattendue" });
    }
    setBusy(null);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {hasAccount && (
          <button
            type="button"
            onClick={submitLien}
            disabled={busy !== null || disabled}
            className="rounded-full border border-line bg-surface-elevated px-4 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            {busy === "lien" ? "Envoi…" : "Renvoyer le lien de connexion"}
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={busy !== null || disabled}
          className="rounded-full border border-line bg-surface-elevated px-4 py-1.5 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
        >
          {busy === "acces"
            ? "Envoi…"
            : hasAccount
              ? "Réinitialiser le mot de passe provisoire"
              : "Créer l'espace client"}
        </button>
      </div>
      {msg && (
        <span className={`text-[11px] ${msg.type === "ok" ? "text-ink-muted" : "text-destructive"}`}>{msg.text}</span>
      )}
    </div>
  );
}
