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
  const lireCanal = useServerFn(canalSouscriptionFn);
  const souscrireHorsApi = useServerFn(souscrireHorsApiFn);

  const [email, setEmail] = useState(emailCompagnie ?? "");
  const [commentaire, setCommentaire] = useState("");
  const [numero, setNumero] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [prerequis, setPrerequis] = useState<ResultatPrerequis | null>(null);
  const [canal, setCanal] = useState<CanalSouscription | null>(null);
  const [numeroHorsApi, setNumeroHorsApi] = useState("");
  const [dateEffet, setDateEffet] = useState(new Date().toISOString().slice(0, 10));
  const [primeAnnuelle, setPrimeAnnuelle] = useState("");
  const [modeHorsApi, setModeHorsApi] = useState<ModeHorsApi>("intranet");

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

  useEffect(() => {
    (async () => {
      try {
        const res = (await lireCanal({ data: { dossier_id: dossierId } })) as {
          canal: CanalSouscription;
        };
        setCanal(res.canal);
      } catch {
        setCanal(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId]);

  const enregistrerSouscriptionHorsApi = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const prime = Number(primeAnnuelle.replace(",", "."));
      const res = (await souscrireHorsApi({
        data: {
          dossier_id: dossierId,
          numero_contrat: numeroHorsApi.trim(),
          date_effet: dateEffet,
          prime_annuelle: Number.isFinite(prime) && prime > 0 ? prime : undefined,
          mode_transmission: modeHorsApi,
          commentaire: commentaire.trim() || undefined,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any;
      setMessage(
        res.contrats_ids?.length > 1
          ? `Souscription enregistrée : ${res.contrats_ids.length} contrats créés au portefeuille (un par assuré).`
          : "Souscription enregistrée : le contrat est créé au portefeuille.",
      );
      setCommentaire("");
      setNumeroHorsApi("");
      await rafraichirPrerequis();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

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

      {canal && (
        <p className="mt-4 inline-flex rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-ink">
          {labelCanal(canal)}
        </p>
      )}

      {envoyable && canal === "externe" && (
        <div className="mt-4 space-y-3 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Souscription enregistrée hors API
          </p>
          <p className="text-xs text-ink-muted">
            Le devis retenu ne vient pas d'un partenaire connecté : l'adhésion est réalisée
            directement auprès de la compagnie, puis enregistrée ici pour créer le contrat.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-ink-muted">
              N° de contrat / adhésion
              <input
                type="text"
                value={numeroHorsApi}
                onChange={(e) => setNumeroHorsApi(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-ink-muted">
              Date d'effet
              <input
                type="date"
                value={dateEffet}
                onChange={(e) => setDateEffet(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-ink-muted">
              Prime annuelle (€, facultatif)
              <input
                type="text"
                inputMode="decimal"
                value={primeAnnuelle}
                onChange={(e) => setPrimeAnnuelle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-ink-muted">
              Mode de transmission
              <select
                value={modeHorsApi}
                onChange={(e) => setModeHorsApi(e.target.value as ModeHorsApi)}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              >
                {MODES_HORS_API.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-ink-muted">
            Commentaire (facultatif)
            <textarea
              rows={2}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <button
            type="button"
            onClick={enregistrerSouscriptionHorsApi}
            disabled={busy || !autorise || numeroHorsApi.trim().length === 0}
            className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : "Enregistrer la souscription et créer le contrat"}
          </button>
        </div>
      )}

      {envoyable && canal !== "externe" && (
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
