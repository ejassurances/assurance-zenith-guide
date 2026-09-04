/**
 * Recueil des besoins d'un dossier existant.
 *
 * Le conseiller retrouve exactement le même parcours par étapes que lors de la
 * création du dossier (une étape par section + récapitulatif) et peut déposer
 * directement les documents nécessaires (offre de prêt, tableau
 * d'amortissement, pièces diverses) sans quitter le recueil.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getBranche, type BrancheConfig } from "@/lib/recueil-besoins-schemas";
import { RecueilWorkflow } from "@/components/recueil-workflow";
import { DocumentsPretPanel } from "@/components/documents-pret-panel";

export function RecueilDossierPanel({
  dossierId,
  typeAssurance,
  recueil,
  canEdit,
  onSaved,
}: {
  dossierId: string;
  typeAssurance: string;
  recueil: Record<string, unknown> | null;
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const branche = getBranche(typeAssurance) as BrancheConfig | null;
  const [values, setValues] = useState<Record<string, unknown>>(recueil ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!branche) return null;

  const enregistrer = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase
      .from("dossiers")
      .update({ recueil_besoins: values as never })
      .eq("id", dossierId);
    if (err) setError(err.message);
    else {
      setMessage("Recueil enregistré.");
      onSaved?.();
    }
    setSaving(false);
  };

  const documents = (
    <div className="space-y-3">
      {branche.value === "emprunteur" && (
        <DocumentsPretPanel
          dossierId={dossierId}
          onAnalyse={({ recueil }) => {
            if (!recueil) return;
            // Les saisies en cours (non encore enregistrées) restent prioritaires.
            setValues((prev) => {
              const fusion: Record<string, unknown> = { ...recueil };
              for (const [cle, valeur] of Object.entries(prev)) {
                const videur =
                  valeur === null ||
                  valeur === undefined ||
                  valeur === "" ||
                  (Array.isArray(valeur) && valeur.length === 0);
                if (!videur) fusion[cle] = valeur;
              }
              return fusion;
            });
            setMessage("Document analysé : les étapes suivantes ont été pré-remplies.");
          }}
        />
      )}
      <DocumentsPretPanel
        dossierId={dossierId}
        titre="Documents du recueil (pièces, relevés, justificatifs)"
        filtre="tous"
        typeDocument="recueil"
      />
    </div>
  );

  return (
    <div id="section-recueil" className="space-y-3">
      {!canEdit ? (
        <p className="text-sm text-ink-muted">
          Recueil consultable uniquement : vous n'avez pas les droits de modification.
        </p>
      ) : null}
      <RecueilWorkflow
        branche={branche}
        values={values}
        onChange={setValues}
        onComplete={canEdit ? () => void enregistrer() : undefined}
        completeLabel={saving ? "Enregistrement…" : "Enregistrer le recueil"}
        dossierId={dossierId}
        aside={documents}
      />
      {message && <p className="text-sm text-ink-muted">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
