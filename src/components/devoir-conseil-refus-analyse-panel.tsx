import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { changerEtapeDossier } from "@/lib/devoir-conseil.functions";

type Analyse = {
  id: string;
  motif_client: string;
  recommandation_ia: "contre_proposition" | "cloture_perdue";
  synthese: string;
  suggestion_contre_proposition: string | null;
  niveau: "niveau_1" | "niveau_2" | null;
  niveau_justification: string | null;
  created_at: string;
};

export function DevoirConseilRefusAnalysePanel({
  dossierId,
  userId,
  onContreProposition,
  onChanged,
}: {
  dossierId: string;
  userId: string;
  onContreProposition: (suggestion: string, motif: string) => void;
  onChanged: () => void;
}) {
  const changerEtape = useServerFn(changerEtapeDossier);
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("devoir_conseil_refus_analyses")
      .select("id, motif_client, recommandation_ia, synthese, suggestion_contre_proposition, niveau, niveau_justification, created_at")
      .eq("dossier_id", dossierId)
      .eq("statut", "en_attente")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAnalyse((data as Analyse | null) ?? null);
  };

  useEffect(() => {
    load();
  }, [dossierId]);

  const traiter = async (statut: "suivie" | "ignoree") => {
    if (!analyse) return;
    await supabase
      .from("devoir_conseil_refus_analyses")
      .update({ statut, traite_par: userId, traite_le: new Date().toISOString() })
      .eq("id", analyse.id);
    setAnalyse(null);
  };

  const cloturer = async () => {
    if (!analyse) return;
    setBusy(true);
    setError(null);
    try {
      await changerEtape({
        data: {
          dossier_id: dossierId,
          etape: "perdu",
          commentaire: `Clôture après refus du devoir de conseil — analyse IA : ${analyse.synthese}`.slice(0, 1000),
        },
      });
      await traiter("suivie");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clôture impossible");
    } finally {
      setBusy(false);
    }
  };

  if (!analyse) return null;

  const contre = analyse.recommandation_ia === "contre_proposition";

  return (
    <div
      id="section-refus-analyse"
      className="scroll-mt-6 rounded-2xl border border-[#D4AF37]/50 bg-surface-elevated p-5"
    >
      <div className="flex items-center gap-2">
        <h2 className="font-serif text-lg font-medium text-ink">Analyse IA du refus</h2>
        <span className="rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-xs text-[#8a6d12]">
          {contre ? "Contre-proposition recommandée" : "Clôture en perdu recommandée"}
        </span>
        {analyse.niveau === "niveau_2" && (
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
            Niveau 2 — action manuelle
          </span>
        )}
      </div>

      <div className="mt-3 space-y-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Motif exprimé par le client</p>
          <p className="mt-1 whitespace-pre-wrap text-ink-soft">{analyse.motif_client}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Synthèse de l'IA</p>
          <p className="mt-1 whitespace-pre-wrap text-ink-soft">{analyse.synthese}</p>
        </div>
        {analyse.niveau_justification && (
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Qualification du niveau</p>
            <p className="mt-1 whitespace-pre-wrap text-ink-soft">{analyse.niveau_justification}</p>
          </div>
        )}
        {contre && analyse.suggestion_contre_proposition && (
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Suggestion d'ajustement</p>
            <p className="mt-1 whitespace-pre-wrap text-ink-soft">{analyse.suggestion_contre_proposition}</p>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {contre ? (
          <button
            onClick={() => {
              onContreProposition(analyse.suggestion_contre_proposition ?? "", analyse.motif_client);
              traiter("suivie");
            }}
            className="rounded-full bg-ink px-4 py-2 text-sm text-surface-elevated hover:opacity-90"
          >
            Préparer une contre-proposition
          </button>
        ) : (
          <button
            onClick={cloturer}
            disabled={busy}
            className="rounded-full bg-ink px-4 py-2 text-sm text-surface-elevated hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Clôture…" : "Clôturer le projet en Perdu"}
          </button>
        )}
        <button
          onClick={() => traiter("ignoree")}
          className="rounded-full border border-line px-4 py-2 text-sm hover:bg-surface"
        >
          Ignorer cette analyse
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Aucun envoi automatique au client : toute contre-proposition reste à valider et envoyer manuellement.
      </p>
    </div>
  );
}
