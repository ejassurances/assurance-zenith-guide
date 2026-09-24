import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lancerPrecompte } from "@/lib/precomptes.functions";

/**
 * Déclencheur de précompte, réservé admin (vérifié aussi côté serveur) :
 * choisit un mandataire et une période, regroupe ses commissions non
 * encore précomptées et le lui envoie pour validation.
 */
export function PrecompteLancerCard() {
  const lancer = useServerFn(lancerPrecompte);
  const [mandataires, setMandataires] = useState<{ id: string; nom: string | null }[]>([]);
  const [mandataireId, setMandataireId] = useState("");
  const debutDefaut = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10);
  const finDefaut = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10);
  const [periodeDebut, setPeriodeDebut] = useState(debutDefaut);
  const [periodeFin, setPeriodeFin] = useState(finDefaut);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "mandataire");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return;
      const { data: profils } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      setMandataires((profils ?? []).map((p) => ({ id: p.id, nom: p.full_name })));
    })();
  }, []);

  const lancerLePrecompte = async () => {
    if (!mandataireId) {
      setMessage("Choisissez un mandataire.");
      return;
    }
    setEnCours(true);
    setMessage(null);
    try {
      const res = await lancer({
        data: { mandataire_id: mandataireId, periode_debut: periodeDebut, periode_fin: periodeFin },
      });
      setMessage(
        res.ok
          ? `Précompte envoyé : ${res.nb_lignes} commission(s), ${res.montant_total.toFixed(2)} €.`
          : res.error,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur lors du lancement.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="crm-card space-y-4 p-6">
      <div>
        <p className="crm-eyebrow">Rétrocession — lancer un précompte</p>
        <p className="mt-1 text-xs text-ink-muted">
          Regroupe les commissions du mandataire non encore précomptées sur la période, et les lui
          envoie pour validation puis facturation.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-ink-muted">Mandataire</label>
          <select
            value={mandataireId}
            onChange={(e) => setMandataireId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {mandataires.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom ?? m.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-muted">Période — début</label>
          <input
            type="date"
            value={periodeDebut}
            onChange={(e) => setPeriodeDebut(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-muted">Période — fin</label>
          <input
            type="date"
            value={periodeFin}
            onChange={(e) => setPeriodeFin(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      {message && <p className="text-sm text-ink">{message}</p>}
      <button
        type="button"
        onClick={() => void lancerLePrecompte()}
        disabled={enCours}
        className="rounded-full bg-[#0A192F] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {enCours ? "Envoi…" : "Lancer le précompte"}
      </button>
    </div>
  );
}
