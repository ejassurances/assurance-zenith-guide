import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enregistrerControleGelAvoirs } from "@/lib/conformite-registres.functions";

/* Bloc « Contrôle LCB-FT — Gel des avoirs » de la fiche client (horodaté, preuve Drive). */

type Controle = {
  id: string;
  effectue_le: string;
  resultat: "aucune_correspondance" | "correspondance_a_analyser" | "correspondance_confirmee";
  observations: string | null;
  drive_url: string | null;
};

const RESULTATS: { value: Controle["resultat"]; label: string }[] = [
  { value: "aucune_correspondance", label: "Aucune correspondance" },
  { value: "correspondance_a_analyser", label: "Correspondance à analyser" },
  { value: "correspondance_confirmee", label: "Correspondance confirmée (gel appliqué)" },
];

const STYLE: Record<Controle["resultat"], string> = {
  aucune_correspondance: "border-emerald-300 bg-emerald-100 text-emerald-900",
  correspondance_a_analyser: "border-amber-300 bg-amber-100 text-amber-900",
  correspondance_confirmee: "border-red-300 bg-red-100 text-red-900",
};

const fmt = (d: string) => new Date(d).toLocaleString("fr-FR");

/** Un contrôle est considéré valable 12 mois (revue annuelle du dispositif). */
function perime(date: string) {
  return Date.now() - new Date(date).getTime() > 365 * 24 * 3600 * 1000;
}

export function GelAvoirsCard({ clientId }: { clientId: string }) {
  const [controles, setControles] = useState<Controle[]>([]);
  const [loading, setLoading] = useState(true);
  const [resultat, setResultat] = useState<Controle["resultat"]>("aucune_correspondance");
  const [observations, setObservations] = useState("");
  const [coche, setCoche] = useState(false);
  const [saving, setSaving] = useState(false);
  const enregistrer = useServerFn(enregistrerControleGelAvoirs);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("client_gel_avoirs")
      .select("id,effectue_le,resultat,observations,drive_url")
      .eq("client_id", clientId)
      .order("effectue_le", { ascending: false });
    setControles((data as unknown as Controle[]) ?? []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const dernier = controles[0] ?? null;

  const valider = async () => {
    if (!coche) return toast.error("Cochez la case de vérification avant d'enregistrer.");
    setSaving(true);
    try {
      const res = await enregistrer({
        data: { client_id: clientId, resultat, observations: observations.trim() || undefined },
      });
      toast.success(
        res.drive_url
          ? "Contrôle enregistré et preuve archivée dans 02_Recueil_et_Conformite."
          : "Contrôle enregistré (archivage Drive à resynchroniser).",
      );
      setCoche(false);
      setObservations("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="crm-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-medium">Contrôle LCB-FT — Gel des avoirs</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Consultation obligatoire des listes nationales et européennes de gel des avoirs avant toute
            entrée en relation (art. L.562-1 et suivants du Code monétaire et financier). Chaque contrôle est
            horodaté et sa preuve PDF archivée dans le dossier Drive du client.
          </p>
        </div>
        {dernier && (
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STYLE[dernier.resultat]}`}>
            {RESULTATS.find((r) => r.value === dernier.resultat)?.label}
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-ink-muted">Chargement…</p>
      ) : dernier ? (
        <p className="mt-4 text-sm">
          Dernier contrôle : <span className="font-medium">{fmt(dernier.effectue_le)}</span>
          {dernier.drive_url && (
            <>
              {" · "}
              <a href={dernier.drive_url} target="_blank" rel="noreferrer" className="underline">
                Preuve sur Drive
              </a>
            </>
          )}
          {perime(dernier.effectue_le) && (
            <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
              Plus d'un an — contrôle à renouveler
            </span>
          )}
        </p>
      ) : (
        <p className="mt-4 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm text-red-900">
          Aucun contrôle de gel des avoirs enregistré pour ce client.
        </p>
      )}

      <div className="mt-5 space-y-3 rounded-xl border border-line p-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={coche}
            onChange={(e) => setCoche(e.target.checked)}
            className="mt-1"
          />
          <span>
            Je certifie avoir effectué la <strong>vérification du gel des avoirs</strong> pour ce client
            (listes DGT / UE / ONU).
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            value={resultat}
            onChange={(e) => setResultat(e.target.value as Controle["resultat"])}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            {RESULTATS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <Textarea
            rows={2}
            placeholder="Observations (optionnel)"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
          />
        </div>
        <Button onClick={valider} disabled={saving || !coche}>
          {saving ? "Enregistrement…" : "Enregistrer le contrôle horodaté"}
        </Button>
      </div>

      {controles.length > 1 && (
        <div className="mt-5">
          <p className="crm-eyebrow">Historique des contrôles</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {controles.slice(1).map((c) => (
              <li key={c.id}>
                {fmt(c.effectue_le)} — {RESULTATS.find((r) => r.value === c.resultat)?.label}
                {c.observations ? ` — ${c.observations}` : ""}
                {c.drive_url && (
                  <>
                    {" · "}
                    <a href={c.drive_url} target="_blank" rel="noreferrer" className="underline">
                      preuve
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
