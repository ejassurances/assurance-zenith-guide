import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { mesDocumentsProduitContrat } from "@/lib/espace-client.functions";
import { ouvrirPdf } from "@/lib/ouvrir-pdf";

type ProduitDoc = Awaited<ReturnType<typeof mesDocumentsProduitContrat>>["documents"][number];

export type DocContrat = {
  id: string;
  file_name: string;
  type_document: string | null;
  created_at: string;
};

const TYPE_PRODUIT: Record<string, string> = {
  ipid: "IPID (document d'information)",
  conditions_generales: "Conditions générales",
  tableau_garanties: "Tableau de garanties",
  fiche_produit: "Fiche produit",
  tarifs: "Tarifs",
  ccsf: "Équivalence de garanties (CCSF)",
  autre: "Document",
};

const TYPE_CONTRAT: Record<string, string> = {
  attestation_assurance: "Attestation d'assurance",
  avis_echeance: "Avis d'échéance",
  conditions_particulieres: "Conditions particulières",
  autre: "Autre document",
};

const jour = (v: string) => new Date(v).toLocaleDateString("fr-FR");

/**
 * Documents rattachés à un contrat dans l'espace client : pièces du produit
 * assuré (CG, IPID…) et documents propres au contrat déjà déposés.
 */
export function EspaceClientContratDocuments({
  contratId,
  documents,
  onTelecharger,
}: {
  contratId: string;
  documents: DocContrat[];
  onTelecharger: (id: string) => void;
}) {
  const charger = useServerFn(mesDocumentsProduitContrat);
  const [produitDocs, setProduitDocs] = useState<ProduitDoc[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await charger({ data: { contrat_id: contratId } });
        if (!annule) setProduitDocs(res.documents);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "Documents indisponibles");
      }
    })();
    return () => {
      annule = true;
    };
  }, [contratId]);

  const vide = produitDocs.length === 0 && documents.length === 0;

  return (
    <div className="mt-4 rounded-lg border border-line bg-background/60 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Documents de ce contrat</h3>
      {vide ? (
        <p className="mt-2 text-sm text-ink-muted">
          Aucun document disponible pour le moment. Votre conseiller les dépose dès réception de l'assureur.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {produitDocs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
              <span className="min-w-0">
                <strong>{TYPE_PRODUIT[d.type] ?? d.type}</strong>
                <span className="ml-2 text-xs text-ink-muted">
                  {d.nom}
                  {d.version ? ` (v${d.version})` : ""}
                </span>
              </span>
              {d.url && (
                <button
                  onClick={() => {
                    const url = d.url as string;
                    void ouvrirPdf(async () => url);
                  }}
                  className="shrink-0 rounded-full border border-line px-3 py-1 text-xs hover:bg-surface"
                >
                  Ouvrir / imprimer
                </button>
              )}
            </li>
          ))}
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
              <span className="min-w-0">
                <strong>{TYPE_CONTRAT[doc.type_document ?? ""] ?? doc.file_name}</strong>
                <span className="ml-2 text-xs text-ink-muted">
                  {doc.file_name} · {jour(doc.created_at)}
                </span>
              </span>
              <button
                onClick={() => onTelecharger(doc.id)}
                className="shrink-0 rounded-full border border-line px-3 py-1 text-xs hover:bg-surface"
              >
                Télécharger
              </button>
            </li>
          ))}
        </ul>
      )}
      {erreur && <p className="mt-2 text-xs text-destructive">{erreur}</p>}
    </div>
  );
}
