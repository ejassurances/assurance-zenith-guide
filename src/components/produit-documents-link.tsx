import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

type ProduitDoc = {
  id: string;
  type: string;
  nom: string;
  version: string | null;
  date_effet: string | null;
  storage_path: string | null;
  /** Lien de consultation Drive (source unique des CGV / IPID). */
  drive_url: string | null;
  interne: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  ipid: "IPID",
  conditions_generales: "Conditions générales",
  tableau_garanties: "Tableau de garanties",
  fiche_produit: "Fiche produit",
  tarifs: "Tarifs",
  ccsf: "CCSF (équivalence bancaire)",
  autre: "Autre",
};

/** Documents du produit sélectionné (IPID, CG, fiche produit…) avec ouverture par URL signée. */
export function ProduitDocumentsLink({ produitId, compagnieId }: { produitId: string | null; compagnieId: string | null }) {
  const { role } = useAuth();
  const isStaff = role === "admin" || role === "mandataire";
  const [docs, setDocs] = useState<ProduitDoc[]>([]);

  useEffect(() => {
    if (!produitId) {
      setDocs([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("produit_documents")
        .select("id,type,nom,version,date_effet,storage_path,drive_url,interne")
        .eq("produit_id", produitId)
        .order("created_at", { ascending: false });
      const all = (data as ProduitDoc[]) ?? [];
      setDocs(isStaff ? all : all.filter((d) => !d.interne));
    })();
  }, [produitId, isStaff]);

  const open = async (d: ProduitDoc) => {
    if (d.drive_url) {
      window.open(d.drive_url, "_blank", "noopener");
      return;
    }
    if (!d.storage_path) return;
    const { data } = await supabase.storage.from("produits-documents").createSignedUrl(d.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (!produitId) return null;

  return (
    <div className="rounded-lg border border-line bg-background/40 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wide text-ink-muted">Documents du produit</h4>
        {compagnieId && (
          <Link
            to="/espace/compagnies/$id"
            params={{ id: compagnieId }}
            className="text-xs text-ink-muted underline underline-offset-4"
          >
            Voir la fiche produit
          </Link>
        )}
      </div>
      {docs.length === 0 ? (
        <p className="mt-2 text-xs text-ink-muted">Aucun document disponible pour ce produit.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">
                <span className="text-ink-muted">{TYPE_LABELS[d.type] ?? d.type} · </span>
                {d.nom}
                {d.version ? ` (v${d.version})` : ""}
              </span>
              <button onClick={() => open(d)} className="shrink-0 text-xs underline underline-offset-4">
                Ouvrir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
