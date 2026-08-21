import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET_CG_CLIENTS, familleCodePourBranche } from "@/lib/bibliotheque-cg";
import {
  enregistrerCgBibliotheque,
  rechercherCgBibliotheque,
} from "@/lib/bibliotheque-cg.functions";

export type CgActuelValue = {
  entree_id: string;
  compagnie_nom: string;
  nom_fichier: string | null;
  storage_path: string;
  statut: string;
};

type EntreeTrouvee = {
  id: string;
  compagnie_nom: string;
  edition_annee: string | null;
  valide: boolean;
  edition_incertaine: boolean;
  upload_requis: boolean;
  message: string | null;
};

export function lireCgActuel(value: unknown): CgActuelValue | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.entree_id !== "string" || typeof v.storage_path !== "string") return null;
  return {
    entree_id: v.entree_id,
    compagnie_nom: typeof v.compagnie_nom === "string" ? v.compagnie_nom : "",
    nom_fichier: typeof v.nom_fichier === "string" ? v.nom_fichier : null,
    storage_path: v.storage_path,
    statut: typeof v.statut === "string" ? v.statut : "depose",
  };
}

/**
 * Dépôt des conditions générales du contrat actuel du client.
 *
 * Avant de demander l'upload, la BIBLIOTHÈQUE (`bibliotheque_cg_clients`) est
 * interrogée par compagnie + branche — jamais une recherche Drive à la volée. Une
 * entrée existante est signalée, mais si son édition est inconnue ou non
 * confirmable, le vrai document est demandé quand même.
 */
export function ContratActuelCgField({
  branche,
  compagnieNom,
  dossierId,
  value,
  onChange,
}: {
  branche: string;
  compagnieNom: string;
  dossierId?: string | null;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const rechercher = useServerFn(rechercherCgBibliotheque);
  const enregistrer = useServerFn(enregistrerCgBibliotheque);
  const [entrees, setEntrees] = useState<EntreeTrouvee[]>([]);
  const [recherche, setRecherche] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const depose = lireCgActuel(value);
  const compagnie = compagnieNom.trim();
  const grilleDispo = familleCodePourBranche(branche) !== null;

  useEffect(() => {
    if (compagnie.length < 2) {
      setEntrees([]);
      return;
    }
    let annule = false;
    const t = setTimeout(() => {
      setRecherche(true);
      rechercher({ data: { compagnie_nom: compagnie, branche } })
        .then((r) => {
          if (!annule) setEntrees((r as { entrees: EntreeTrouvee[] }).entrees ?? []);
        })
        .catch(() => {
          if (!annule) setEntrees([]);
        })
        .finally(() => {
          if (!annule) setRecherche(false);
        });
    }, 500);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [compagnie, branche, rechercher]);

  const televerser = async (file: File) => {
    setErreur(null);
    if (compagnie.length < 2) {
      setErreur("Renseignez d'abord le nom de la compagnie actuelle.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setErreur("Fichier trop volumineux (12 Mo maximum).");
      return;
    }
    setEnvoi(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Session expirée : reconnectez-vous.");
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const chemin = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET_CG_CLIENTS)
        .upload(chemin, file, { upsert: false, contentType: file.type || "application/pdf" });
      if (upErr) throw new Error(upErr.message);
      const res = (await enregistrer({
        data: {
          compagnie_nom: compagnie,
          branche,
          storage_path: chemin,
          nom_fichier: file.name.slice(0, 300),
          mime_type: file.type || "application/pdf",
          dossier_id: dossierId ?? null,
        },
      })) as { id: string; analyse: string | null };
      onChange({
        entree_id: res.id,
        compagnie_nom: compagnie,
        nom_fichier: file.name,
        storage_path: chemin,
        statut: res.analyse === "brouillon" ? "brouillon" : "a_analyser",
      } satisfies CgActuelValue);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Dépôt impossible");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-3">
      {compagnie.length >= 2 && (
        <div className="rounded-xl border border-line bg-background/50 p-4 text-sm">
          {recherche && <p className="text-ink-muted">Recherche dans la bibliothèque du cabinet…</p>}
          {!recherche && entrees.length === 0 && (
            <p className="text-ink-muted">
              Aucune condition générale « {compagnie} » n'est encore référencée pour cette branche : votre document est
              nécessaire.
            </p>
          )}
          {!recherche && entrees.length > 0 && (
            <div className="space-y-2">
              <p className="font-medium text-ink">Déjà référencé dans notre bibliothèque</p>
              <ul className="space-y-2">
                {entrees.map((e) => (
                  <li key={e.id} className="rounded-lg border border-line bg-surface-elevated p-3">
                    <p className="text-ink">
                      {e.compagnie_nom} —{" "}
                      {e.edition_annee ? (
                        <>édition {e.edition_annee}</>
                      ) : (
                        <span className="text-destructive">édition inconnue</span>
                      )}
                      {e.valide ? " · grille validée par le cabinet" : " · grille non encore validée"}
                    </p>
                    {e.upload_requis && (
                      <p className="mt-1 text-xs text-destructive">
                        {e.message ??
                          "Édition non confirmée comme identique à votre contrat : merci de déposer quand même votre propre document."}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!grilleDispo && (
        <p className="text-xs text-ink-muted">
          Cette branche n'a pas de trame de garanties standardisée : le document sera conservé et analysé manuellement
          par un conseiller.
        </p>
      )}

      {depose ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 p-4 text-sm">
          <span className="text-ink">
            Document déposé : {depose.nom_fichier ?? "conditions générales"} ({depose.compagnie_nom})
          </span>
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
            {depose.statut === "brouillon"
              ? "Analyse en brouillon — à valider par un conseiller"
              : "En attente d'analyse par le cabinet"}
          </span>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-xs text-ink-muted underline"
          >
            Remplacer
          </button>
        </div>
      ) : (
        <label className="block cursor-pointer rounded-xl border border-dashed border-line bg-background/40 p-4 text-sm text-ink-muted hover:border-ink/40">
          <input
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            disabled={envoi}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void televerser(f);
              e.target.value = "";
            }}
          />
          {envoi ? "Dépôt et analyse en cours…" : "Déposer les conditions générales (PDF, 12 Mo max)"}
        </label>
      )}

      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
    </div>
  );
}
