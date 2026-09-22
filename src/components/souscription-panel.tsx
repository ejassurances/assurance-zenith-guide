import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  envoyerSouscriptionFn,
  enregistrerRetourCompagnie,
  prerequisSouscriptionFn,
  canalSouscriptionFn,
  souscrireHorsApiFn,
} from "@/lib/souscription.functions";
import type { ResultatPrerequis } from "@/lib/souscription-prerequis";
import {
  MODES_HORS_API,
  labelCanal,
  type CanalSouscription,
  type ModeHorsApi,
} from "@/lib/souscription-canal";

/**
 * Étape souscription : contrôle de complétude bloquant, transmission à la
 * compagnie (API/email ou dépôt intranet), relances automatiques et retour.
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
  const lirePrerequis = useServerFn(prerequisSouscriptionFn);

  const [email, setEmail] = useState(emailCompagnie ?? "");
  const [commentaire, setCommentaire] = useState("");
  const [numero, setNumero] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [prerequis, setPrerequis] = useState<ResultatPrerequis | null>(null);

  const envoyable = ["devoir_conseil_signe", "souscription_envoyee", "devis_en_cours"].includes(statut);
  const autorise = prerequis?.autorise === true;

  const rafraichirPrerequis = useCallback(async () => {
    try {
      const res = (await lirePrerequis({ data: { dossier_id: dossierId } })) as ResultatPrerequis;
      setPrerequis(res);
    } catch {
      setPrerequis(null);
    }
  }, [dossierId, lirePrerequis]);

  useEffect(() => {
    void rafraichirPrerequis();
  }, [rafraichirPrerequis]);

  const lancerEnvoi = async (mode: "api" | "intranet") => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = (await envoyer({
        data: {
          dossier_id: dossierId,
          email: email.trim() || undefined,
          commentaire: commentaire.trim() || undefined,
          mode,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any;
      setMessage(
        mode === "intranet"
          ? "Dépôt intranet validé et tracé dans l'historique du dossier."
          : `Dossier transmis à ${res.destinataire}. Relances automatiques armées à J+3 et J+7.`,
      );
      setCommentaire("");
      await rafraichirPrerequis();
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

      <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Complétude du dossier avant transmission
        </p>
        {prerequis === null ? (
          <p className="mt-2 text-sm text-ink-muted">Vérification…</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {prerequis.jalons.map((j) => (
              <li key={j.code} className="flex gap-2">
                <span className={j.etat === "OK" ? "text-emerald-600" : "text-red-600"}>
                  {j.etat === "OK" ? "✓" : "✗"}
                </span>
                <span className="text-ink">
                  {j.libelle} — <span className="text-ink-muted">{j.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {prerequis && !prerequis.autorise && (
          <p className="mt-2 text-xs text-red-600">
            Transmission bloquée : complétez les éléments manquants. Aucune dérogation possible.
          </p>
        )}
      </div>

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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => lancerEnvoi("api")}
              disabled={busy || !autorise}
              className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface disabled:opacity-50"
            >
              {busy ? "Envoi…" : envoyeeLe ? "Renvoyer par API / email" : "Envoyer par API / email"}
            </button>
            <button
              type="button"
              onClick={() => lancerEnvoi("intranet")}
              disabled={busy || !autorise}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
            >
              Valider le dépôt sur l'intranet compagnie
            </button>
          </div>
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
