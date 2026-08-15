import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  simulassurCreerEspaces,
  simulassurGenererDocuments,
  simulassurSuiviDossier,
  simulassurSuivreDevis,
  simulassurTransfererDossier,
} from "@/lib/simulassur.functions";
import { supabase } from "@/integrations/supabase/client";
import { TYPES_DOCUMENTS, LIBELLE_DOCUMENT, type TypeDocumentSimulassur } from "@/lib/simulassur/referentiels";

type Suivi = {
  quote_id: string | null;
  produit_code: string | null;
  devis_id: string | null;
  transfert_statut: string;
  transfert_le: string | null;
  suivi_le: string | null;
  suivi_partiel: boolean;
  contrat_ref: string | null;
  derniere_erreur: string | null;
  suivi_statuts: unknown;
  espaces_clients: { email: string; produit_code: string; lien_disponible: boolean }[];
};

type StatutLigne = {
  nom: string | null;
  folderStatusLibelle: string | null;
  cancellationStatus: string | null;
  contractRef: string | null;
  categorie: string;
};

const inp = "w-full rounded-md border border-line bg-background px-3 py-2 text-sm";
const btn = "rounded-full bg-ink px-5 py-2 text-sm text-primary-foreground disabled:opacity-50";

/**
 * Pilotage de la souscription Simulassur d'un dossier emprunteur : transfert du
 * devis retenu, suivi des statuts par assuré, espaces clients et documents
 * précontractuels.
 */
export function SimulassurConsole({
  dossierId,
  clientEmail,
}: {
  dossierId: string;
  clientEmail?: string | null;
}) {
  const chargerSuivi = useServerFn(simulassurSuiviDossier);
  const transferer = useServerFn(simulassurTransfererDossier);
  const suivre = useServerFn(simulassurSuivreDevis);
  const creerEspaces = useServerFn(simulassurCreerEspaces);
  const genererDocs = useServerFn(simulassurGenererDocuments);

  const [suivi, setSuivi] = useState<Suivi | null>(null);
  const [devis, setDevis] = useState<{ id: string; libelle: string }[]>([]);
  const [devisId, setDevisId] = useState("");
  const [produitCode, setProduitCode] = useState("");
  const [email, setEmail] = useState(clientEmail ?? "");
  const [types, setTypes] = useState<TypeDocumentSimulassur[]>(["devis", "fmc"]);
  const [enCours, setEnCours] = useState<null | "transfert" | "suivi" | "espace" | "docs">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = (await chargerSuivi({ data: { dossier_id: dossierId } })) as
        | { present: false }
        | { present: true; suivi: Suivi };
      setSuivi(res.present ? res.suivi : null);
      if (res.present && res.suivi.produit_code) setProduitCode(res.suivi.produit_code);
      if (res.present && res.suivi.devis_id) setDevisId(res.suivi.devis_id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Suivi Simulassur indisponible");
    }
    const { data } = await supabase
      .from("dossier_devis")
      .select("id,garanties_resume,cotisation_mensuelle,source")
      .eq("dossier_id", dossierId)
      .eq("source", "api")
      .order("created_at", { ascending: true });
    setDevis(
      ((data as { id: string; garanties_resume: string | null; cotisation_mensuelle: number | null }[]) ?? [])
        .filter((d) => (d.garanties_resume ?? "").includes("Simulassur"))
        .map((d) => ({
          id: d.id,
          libelle: `${(d.garanties_resume ?? "").slice(0, 70)}…${
            d.cotisation_mensuelle != null ? ` (${Number(d.cotisation_mensuelle).toLocaleString("fr-FR")} €/mois)` : ""
          }`,
        })),
    );
  }, [chargerSuivi, dossierId]);

  useEffect(() => {
    load();
  }, [load]);

  const action = async (
    cle: "transfert" | "suivi" | "espace" | "docs",
    fn: () => Promise<string>,
  ) => {
    setErr(null);
    setMsg(null);
    setEnCours(cle);
    try {
      setMsg(await fn());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action Simulassur impossible");
    } finally {
      setEnCours(null);
    }
  };

  const statuts = (Array.isArray(suivi?.suivi_statuts) ? suivi?.suivi_statuts : []) as StatutLigne[];

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <h2 className="font-serif text-lg font-medium text-ink">Souscription Simulassur</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Transfert du devis retenu au partenaire, suivi des statuts par assuré, espaces clients et documents
        précontractuels. Les identifiants et les liens d'activation restent côté cabinet.
      </p>

      {!suivi && (
        <p className="mt-3 text-sm text-ink-muted">
          Aucune tarification Simulassur sur ce dossier : lancez d'abord « Récupérer les tarifs Simulassur » dans les
          devis comparés.
        </p>
      )}

      {suivi && (
        <>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <p className="text-ink-soft">
              Référence devis : <span className="text-ink">{suivi.quote_id ?? "—"}</span>
            </p>
            <p className="text-ink-soft">
              Transfert :{" "}
              <span className="text-ink">
                {suivi.transfert_statut === "transfere"
                  ? `envoyé le ${new Date(suivi.transfert_le ?? "").toLocaleDateString("fr-FR")}`
                  : suivi.transfert_statut === "echec"
                    ? "en échec"
                    : "non transféré"}
              </span>
            </p>
            {suivi.contrat_ref && (
              <p className="text-ink-soft">
                Contrat : <span className="text-ink">{suivi.contrat_ref}</span>
              </p>
            )}
            {suivi.suivi_le && (
              <p className="text-ink-soft">
                Dernier suivi : <span className="text-ink">{new Date(suivi.suivi_le).toLocaleString("fr-FR")}</span>
              </p>
            )}
          </div>

          {suivi.derniere_erreur && (
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {suivi.derniere_erreur}
            </p>
          )}

          {/* Transfert du devis retenu */}
          {suivi.transfert_statut !== "transfere" && (
            <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
              <h3 className="text-sm font-medium text-ink">1. Transférer le devis retenu</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Devis</span>
                  <select value={devisId} onChange={(e) => setDevisId(e.target.value)} className={inp}>
                    <option value="">— Sélectionner —</option>
                    {devis.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.libelle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Code produit Simulassur
                  </span>
                  <input value={produitCode} onChange={(e) => setProduitCode(e.target.value)} className={inp} />
                </label>
              </div>
              <button
                className={btn}
                disabled={enCours !== null || !devisId || !produitCode}
                onClick={() =>
                  action("transfert", async () => {
                    await transferer({
                      data: { dossier_id: dossierId, devis_id: devisId, produit_code: produitCode },
                    });
                    return "Dossier transféré à Simulassur : le pipeline passe en souscription envoyée.";
                  })
                }
              >
                {enCours === "transfert" ? "Transfert…" : "Transférer à Simulassur"}
              </button>
            </div>
          )}

          {/* Suivi des statuts */}
          {suivi.quote_id && (
            <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
              <h3 className="text-sm font-medium text-ink">2. Suivi des assurés</h3>
              {statuts.length === 0 && <p className="text-xs text-ink-muted">Aucun statut récupéré pour l'instant.</p>}
              {statuts.map((s, i) => (
                <div key={i} className="rounded-lg border border-line bg-background p-3 text-sm">
                  <p className="font-medium text-ink">{s.nom ?? `Assuré ${i + 1}`}</p>
                  <p className="text-xs text-ink-soft">
                    Souscription : {s.folderStatusLibelle ?? "—"}
                    {s.cancellationStatus ? ` · Résiliation : ${s.cancellationStatus}` : ""}
                    {s.contractRef ? ` · Contrat ${s.contractRef}` : ""}
                  </p>
                </div>
              ))}
              {suivi.suivi_partiel && (
                <p className="text-xs text-amber-700">
                  Suivi partiel : un ou plusieurs assurés n'ont pas pu être interrogés.
                </p>
              )}
              <button
                className={btn}
                disabled={enCours !== null}
                onClick={() =>
                  action("suivi", async () => {
                    await suivre({ data: { dossier_id: dossierId } });
                    return "Statuts Simulassur actualisés.";
                  })
                }
              >
                {enCours === "suivi" ? "Actualisation…" : "Actualiser les statuts"}
              </button>
            </div>
          )}

          {/* Espaces clients */}
          {suivi.quote_id && (
            <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
              <h3 className="text-sm font-medium text-ink">3. Espace client Simulassur</h3>
              {suivi.espaces_clients.length > 0 && (
                <ul className="space-y-1 text-xs text-ink-soft">
                  {suivi.espaces_clients.map((e, i) => (
                    <li key={i}>
                      {e.email} — {e.produit_code}{" "}
                      {e.lien_disponible ? "· lien d'activation transmis" : "· lien indisponible"}
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Email de l'assuré</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} />
                </label>
              </div>
              <button
                className={btn}
                disabled={enCours !== null || !email || !produitCode}
                onClick={() =>
                  action("espace", async () => {
                    await creerEspaces({
                      data: { dossier_id: dossierId, comptes: [{ email, produit_code: produitCode }] },
                    });
                    return "Espace client créé chez Simulassur : l'assuré reçoit son lien d'activation.";
                  })
                }
              >
                {enCours === "espace" ? "Création…" : "Créer l'espace client"}
              </button>
            </div>
          )}

          {/* Documents précontractuels */}
          {suivi.quote_id && (
            <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface p-4">
              <h3 className="text-sm font-medium text-ink">4. Documents précontractuels</h3>
              <div className="flex flex-wrap gap-3">
                {TYPES_DOCUMENTS.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      checked={types.includes(t)}
                      onChange={(e) =>
                        setTypes((prev) => (e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)))
                      }
                    />
                    {LIBELLE_DOCUMENT[t]}
                  </label>
                ))}
              </div>
              <button
                className={btn}
                disabled={enCours !== null || types.length === 0 || !produitCode}
                onClick={() =>
                  action("docs", async () => {
                    const res = (await genererDocs({
                      data: { dossier_id: dossierId, produit_code: produitCode, types },
                    })) as { documents: { libelle: string }[]; echecs: string[] };
                    return (
                      `${res.documents.length} document(s) archivé(s) dans le dossier : ${res.documents
                        .map((d) => d.libelle)
                        .join(", ")}.` + (res.echecs.length > 0 ? `\n${res.echecs.join("\n")}` : "")
                    );
                  })
                }
              >
                {enCours === "docs" ? "Génération…" : "Générer et archiver"}
              </button>
            </div>
          )}
        </>
      )}

      {msg && <p className="mt-3 whitespace-pre-wrap text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-3 whitespace-pre-wrap text-sm text-destructive">{err}</p>}
    </div>
  );
}
