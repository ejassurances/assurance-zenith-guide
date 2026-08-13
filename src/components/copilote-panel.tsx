import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { demanderCopilote, creerTacheCopilote } from "@/lib/copilote.functions";

type Mode = "synthese" | "prochaine_action" | "email_client" | "email_compagnie";

type ActionIa = {
  titre: string;
  description: string;
  echeance_jours: number;
  priorite: "basse" | "normale" | "haute" | "urgente";
};

const BOUTONS: { mode: Mode; label: string }[] = [
  { mode: "synthese", label: "Synthèse du dossier" },
  { mode: "prochaine_action", label: "Prochaine action" },
  { mode: "email_client", label: "Brouillon email client" },
  { mode: "email_compagnie", label: "Brouillon email compagnie" },
];

/**
 * Copilote IA du dossier : synthèse, prochaine action à réaliser et
 * brouillons d'emails. Toute production reste soumise à validation humaine.
 */
export function CopilotePanel({
  dossierId,
  onUtiliserEmail,
}: {
  dossierId: string;
  onUtiliserEmail?: (objet: string, corps: string) => void;
}) {
  const demander = useServerFn(demanderCopilote);
  const creerTache = useServerFn(creerTacheCopilote);

  const [busy, setBusy] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [precision, setPrecision] = useState("");
  const [texte, setTexte] = useState<string | null>(null);
  const [action, setAction] = useState<ActionIa | null>(null);
  const [email, setEmail] = useState<{ objet: string; corps: string } | null>(null);

  const lancer = async (mode: Mode) => {
    setBusy(mode);
    setError(null);
    setMessage(null);
    setTexte(null);
    setAction(null);
    setEmail(null);
    try {
      const res = (await demander({
        data: { dossier_id: dossierId, mode, precision: precision.trim() || undefined },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any;
      if (res.texte) setTexte(res.texte);
      if (res.action) setAction(res.action as ActionIa);
      if (res.email) setEmail(res.email as { objet: string; corps: string });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le copilote n'a pas pu répondre");
    } finally {
      setBusy(null);
    }
  };

  const planifier = async () => {
    if (!action) return;
    setBusy("prochaine_action");
    setError(null);
    try {
      await creerTache({ data: { dossier_id: dossierId, ...action } });
      setMessage("Tâche créée et assignée.");
      setAction(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création de la tâche impossible");
    } finally {
      setBusy(null);
    }
  };

  const copier = async (valeur: string) => {
    try {
      await navigator.clipboard.writeText(valeur);
      setMessage("Copié dans le presse-papier.");
    } catch {
      setMessage(null);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Copilote IA</h2>
          <p className="text-sm text-ink-muted">
            Synthèse, prochaine action et brouillons d'emails. Relisez toujours avant envoi.
          </p>
        </div>
      </div>

      <input
        type="text"
        value={precision}
        onChange={(e) => setPrecision(e.target.value)}
        placeholder="Précision facultative (ex. : le client trouve la cotisation trop élevée)"
        className="mt-4 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {BOUTONS.map((b) => (
          <button
            key={b.mode}
            type="button"
            onClick={() => lancer(b.mode)}
            disabled={busy !== null}
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-elevated disabled:opacity-50"
          >
            {busy === b.mode ? "Analyse…" : b.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-3 text-sm text-ink">{message}</p>}

      {texte && (
        <div className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-elevated p-4 text-sm text-ink">
          {texte}
        </div>
      )}

      {action && (
        <div className="mt-4 rounded-lg border border-line bg-surface-elevated p-4">
          <p className="text-sm font-semibold text-ink">{action.titre}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{action.description}</p>
          <p className="mt-2 text-xs text-ink-muted">
            Priorité {action.priorite} · échéance à J+{action.echeance_jours}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={planifier}
              disabled={busy !== null}
              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface disabled:opacity-50"
            >
              Créer la tâche
            </button>
            <button
              type="button"
              onClick={() => setAction(null)}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            >
              Ignorer
            </button>
          </div>
        </div>
      )}

      {email && (
        <div className="mt-4 rounded-lg border border-line bg-surface-elevated p-4">
          <p className="text-sm font-semibold text-ink">{email.objet}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-muted">
            {email.corps}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            {onUtiliserEmail && (
              <button
                type="button"
                onClick={() => onUtiliserEmail(email.objet, email.corps)}
                className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface"
              >
                Utiliser ce brouillon
              </button>
            )}
            <button
              type="button"
              onClick={() => copier(`${email.objet}\n\n${email.corps}`)}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            >
              Copier
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
