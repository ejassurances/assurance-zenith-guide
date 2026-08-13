import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { COUVERTURE_LABEL, grillePourFamille, type ValeursGrille } from "@/lib/garanties-grille";
import {
  accepterPropositionFormule,
  analyserTableauGaranties,
  rejeterPropositionFormule,
} from "@/lib/produit-garanties.functions";
import type { DocAnalysable } from "@/components/produit-garanties-tab";

type Proposition = {
  id: string;
  formule_nom: string;
  formule_id: string | null;
  document_id: string | null;
  grille_version: number;
  modele_ia: string | null;
  valeurs: ValeursGrille;
  avertissements: string | null;
  created_at: string;
};

/**
 * Extraction IA multi-formules depuis un « tableau de garanties » (santé) et
 * validation humaine, proposition par proposition (une par formule détectée).
 */
export function FormulePropositionsPanel({
  produitId,
  familleCode,
  isAdmin,
  docs,
  onChange,
}: {
  produitId: string;
  familleCode: string | null;
  isAdmin: boolean;
  docs: DocAnalysable[];
  onChange: () => void;
}) {
  const grille = grillePourFamille(familleCode);
  const [props, setProps] = useState<Proposition[]>([]);
  const [docId, setDocId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const analyser = useServerFn(analyserTableauGaranties);
  const accepter = useServerFn(accepterPropositionFormule);
  const rejeter = useServerFn(rejeterPropositionFormule);

  const tableaux = docs.filter((d) => d.type === "tableau_garanties");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("formule_garanties_propositions")
      .select("id,formule_nom,formule_id,document_id,grille_version,modele_ia,valeurs,avertissements,created_at")
      .eq("produit_id", produitId)
      .eq("statut", "proposee")
      .order("created_at", { ascending: false });
    setProps((data ?? []) as unknown as Proposition[]);
  }, [produitId]);

  useEffect(() => {
    load();
  }, [load]);

  if (familleCode !== "sante" || !grille) return null;

  async function run(key: string, fn: () => Promise<unknown>, okText: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg({ type: "ok", text: okText });
      await load();
      onChange();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-line bg-background p-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Extraction assistée depuis un tableau de garanties
        </p>
        <p className="text-xs text-ink-muted">
          Un seul document peut couvrir plusieurs formules : l'IA propose une grille par formule détectée, avec les
          montants tels qu'écrits. Rien n'est appliqué sans validation humaine.
        </p>
      </div>

      {msg && (
        <p className={`text-xs ${msg.type === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>
      )}

      {tableaux.length === 0 ? (
        <p className="text-xs text-ink-muted">
          Ajoutez d'abord un document de type « Tableau de garanties » dans les documents du produit.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="">— Tableau de garanties à analyser —</option>
            {tableaux.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nom}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!docId || busy !== null}
            onClick={() =>
              run(
                "analyse",
                () => analyser({ data: { document_id: docId } }),
                "Propositions générées — à valider formule par formule.",
              )
            }
            className="rounded-md bg-ink px-3 py-2 text-sm text-surface disabled:opacity-50"
          >
            {busy === "analyse" ? "Analyse en cours…" : "Analyser un tableau de garanties"}
          </button>
        </div>
      )}

      {props.length > 0 && (
        <div className="space-y-3">
          {props.map((p) => (
            <div key={p.id} className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-amber-900">
                  Formule « {p.formule_nom} »{" "}
                  <span className="text-xs font-normal">
                    {p.formule_id ? "(formule existante)" : "(formule à créer)"}
                  </span>
                </p>
                <span className="text-xs text-amber-900">
                  {p.modele_ia ?? "IA"} · {new Date(p.created_at).toLocaleDateString("fr-FR")}
                </span>
              </div>

              {p.avertissements && <p className="text-xs text-amber-900">{p.avertissements}</p>}

              <ul className="space-y-1">
                {grille.garanties.map((g) => {
                  const v = p.valeurs?.[g.code];
                  if (!v) return null;
                  return (
                    <li key={g.code} className="text-xs text-ink">
                      <span className="font-medium">{g.libelle}</span> : {COUVERTURE_LABEL[v.couverture]}
                      {v.plafond ? ` — ${v.plafond}` : ""}
                      {v.franchise ? ` (franchise ${v.franchise})` : ""}
                      {typeof v.confiance === "number" ? (
                        <span className="text-ink-muted"> · confiance {Math.round(v.confiance * 100)}%</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap gap-2">
                {isAdmin && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `val-${p.id}`,
                        () => accepter({ data: { proposition_id: p.id, statut: "valide" } }),
                        "Formule créée/mise à jour et grille validée.",
                      )
                    }
                    className="rounded-md bg-ink px-3 py-1.5 text-xs text-surface disabled:opacity-50"
                  >
                    Créer/Mettre à jour la formule et valider
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run(
                      `bro-${p.id}`,
                      () => accepter({ data: { proposition_id: p.id, statut: "brouillon" } }),
                      "Grille enregistrée en brouillon.",
                    )
                  }
                  className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Enregistrer en brouillon
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`rej-${p.id}`, () => rejeter({ data: { proposition_id: p.id } }), "Proposition rejetée.")
                  }
                  className="text-xs text-rose-700 underline underline-offset-4 disabled:opacity-50"
                >
                  Rejeter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
