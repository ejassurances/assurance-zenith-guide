import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { envoyerSouscriptionFn, enregistrerRetourCompagnie } from "@/lib/souscription.functions";

/**
 * Étape souscription : transmission du dossier à la compagnie, suivi des
 * relances automatiques (J+3, J+7) et enregistrement du retour compagnie.
 */
export function SouscriptionPanel({
  dossierId,
  statut,
  emailCompagnie,
  envoyeeLe,
  relances,
  retourLe,
  onChanged,
}: {
  dossierId: string;
  statut: string;
  emailCompagnie: string | null;
  envoyeeLe: string | null;
  relances: number | null;
  retourLe: string | null;
  onChanged: () => void;
}) {
  const envoyer = useServerFn(envoyerSouscriptionFn);
  const retour = useServerFn(enregistrerRetourCompagnie);

  const [email, setEmail] = useState(emailCompagnie ?? "");
  const [commentaire, setCommentaire] = useState("");
  const [numero, setNumero] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const envoyable = ["devoir_conseil_signe", "souscription_envoyee", "devis_en_cours"].includes(statut);

  const lancerEnvoi = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = (await envoyer({
        data: {
          dossier_id: dossierId,
          email: email.trim() || undefined,
          commentaire: commentaire.trim() || undefined,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any;
      setMessage(`Dossier transmis à ${res.destinataire}. Relances automatiques armées à J+3 et J+7.`);
      setCommentaire("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  };

  const enregistrerRetour = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await retour({
        data: { dossier_id: dossierId, numero_contrat: numero.trim() || undefined },
      });
      setMessage("Retour compagnie enregistré, les relances sont stoppées.");
      setNumero("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold text-ink">Souscription compagnie</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Transmission du dossier au service souscription puis relances automatiques à J+3 et J+7 sans
        retour.
      </p>

      <dl className="mt-4 grid gap-3 text-xs text-ink-muted sm:grid-cols-3">
        <div>
          <dt>Envoyée le</dt>
          <dd className="text-ink">
            {envoyeeLe ? new Date(envoyeeLe).toLocaleDateString("fr-FR") : "—"}
          </dd>
        </div>
        <div>
          <dt>Relances</dt>
          <dd className="text-ink">{relances ?? 0} / 2</dd>
        </div>
        <div>
          <dt>Retour compagnie</dt>
          <dd className="text-ink">
            {retourLe ? new Date(retourLe).toLocaleDateString("fr-FR") : "en attente"}
          </dd>
        </div>
      </dl>

      {envoyable && (
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-ink-muted">
            Adresse du service souscription (laisser vide pour utiliser celle de la fiche compagnie)
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="block text-xs text-ink-muted">
            Message complémentaire (facultatif)
            <textarea
              rows={3}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <button
            type="button"
            onClick={lancerEnvoi}
            disabled={busy}
            className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Envoi…" : envoyeeLe ? "Renvoyer à la compagnie" : "Envoyer à la compagnie"}
          </button>
        </div>
      )}

      {envoyeeLe && !retourLe && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <label className="grow text-xs text-ink-muted">
            N° de contrat attribué (facultatif)
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <button
            type="button"
            onClick={enregistrerRetour}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
          >
            Enregistrer le retour compagnie
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-3 text-sm text-ink">{message}</p>}
    </section>
  );
}
