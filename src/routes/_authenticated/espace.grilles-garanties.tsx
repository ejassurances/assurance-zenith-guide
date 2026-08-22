import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { IconTable } from "@tabler/icons-react";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth-context";
import { grillePourFamille } from "@/lib/garanties-grille";
import {
  analyserDocumentsGaranties,
  listerEtatGrillesFamille,
  synchroniserCgDrive,
  validerGrilleGaranties,
} from "@/lib/produit-garanties.functions";
import type { EtatGrilleProduit } from "@/lib/produit-garanties-etat.server";


/** Familles disposant d'une trame standardisée produit (la santé passe par les formules). */
const FAMILLES = [
  { code: "emprunteur", label: "Assurance emprunteur" },
  { code: "prevoyance", label: "Prévoyance" },
  { code: "mrh", label: "Habitation" },
  { code: "auto", label: "Auto" },
  { code: "animaux", label: "Animaux" },
  { code: "edpm", label: "EDPM" },
];

export const Route = createFileRoute("/_authenticated/espace/grilles-garanties")({
  component: AtelierGrillesPage,
  head: () => ({
    meta: [
      { title: "Atelier des grilles de garanties — EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Standardisation des contrats partenaires : analyse des conditions générales par lot et validation humaine des grilles de garanties.",
      },
      { property: "og:title", content: "Atelier des grilles de garanties — EJ Partners Assurances" },
      {
        property: "og:description",
        content: "Analyse par lot des documents contractuels et validation des grilles de garanties du catalogue.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AtelierGrillesPage() {
  const { role, loading } = useAuth();
  const staff = role === "admin" || role === "mandataire";
  const lister = useServerFn(listerEtatGrillesFamille);
  const analyser = useServerFn(analyserDocumentsGaranties);
  const valider = useServerFn(validerGrilleGaranties);
  const synchroniser = useServerFn(synchroniserCgDrive);


  const [famille, setFamille] = useState("emprunteur");
  const [produits, setProduits] = useState<EtatGrilleProduit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [lot, setLot] = useState<{ fait: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; texte: string } | null>(null);

  const grille = grillePourFamille(famille);

  const charger = useCallback(async () => {
    const res = (await lister({ data: { famille_code: famille } })) as { produits: EtatGrilleProduit[] };
    setProduits(res.produits ?? []);
  }, [lister, famille]);

  useEffect(() => {
    if (staff) void charger();
  }, [staff, charger]);

  const analyserProduit = async (p: EtatGrilleProduit) => {
    const ids = p.documents.slice(0, 4).map((d) => d.id);
    if (ids.length === 0) throw new Error("Aucun document analysable");
    await analyser({ data: { document_ids: ids } });
  };

  const action = async (cle: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(cle);
    setMessage(null);
    try {
      await fn();
      setMessage({ type: "ok", texte: ok });
      await charger();
    } catch (e) {
      setMessage({ type: "err", texte: e instanceof Error ? e.message : "Action impossible" });
    } finally {
      setBusy(null);
    }
  };

  /** Analyse séquentielle de tous les produits documentés sans proposition ni grille validée. */
  const analyserLot = async () => {
    const cibles = produits.filter(
      (p) => p.documents.length > 0 && !p.proposition && p.grille_statut !== "valide",
    );
    if (cibles.length === 0) {
      setMessage({ type: "ok", texte: "Aucun contrat à analyser : tout est déjà proposé ou validé." });
      return;
    }
    setBusy("lot");
    setMessage(null);
    const echecs: string[] = [];
    for (let i = 0; i < cibles.length; i++) {
      setLot({ fait: i, total: cibles.length });
      try {
        await analyserProduit(cibles[i]!);
      } catch (e) {
        echecs.push(`${cibles[i]!.nom} — ${e instanceof Error ? e.message : "erreur"}`);
      }
    }
    setLot(null);
    setBusy(null);
    await charger();
    setMessage(
      echecs.length === 0
        ? { type: "ok", texte: `${cibles.length} contrat(s) analysé(s) : propositions à relire puis valider.` }
        : { type: "err", texte: `Analyses en échec : ${echecs.join(" · ")}` },
    );
  };

  /** Validation humaine explicite de la proposition, reprise telle quelle. */
  const validerProposition = async (p: EtatGrilleProduit) => {
    if (!p.proposition || !grille) throw new Error("Proposition indisponible");
    await valider({
      data: {
        produit_id: p.produit_id,
        famille_code: famille,
        grille_version: grille.version,
        valeurs: p.proposition.valeurs,
        document_source_id: p.documents[0]?.id ?? null,
        proposition_id: p.proposition.id,
        assureur_porteur: p.proposition.assureur_porteur_propose,
        reference_contrat: p.proposition.reference_contrat_propose,
      },
    });
  };

  if (loading) return <p className="p-6 text-sm text-ink-muted">Chargement…</p>;
  if (!staff) return <p className="p-6 text-sm text-ink-muted">Accès réservé au cabinet.</p>;

  const nbValides = produits.filter((p) => p.grille_statut === "valide").length;
  const nbPropositions = produits.filter((p) => p.proposition).length;
  const nbAAnalyser = produits.filter(
    (p) => p.documents.length > 0 && !p.proposition && p.grille_statut !== "valide",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={IconTable}
        title="Atelier des grilles de garanties"
        description="Analyse des documents contractuels du catalogue et validation humaine des grilles utilisées par le comparatif et le devoir de conseil."
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={famille}
          onChange={(e) => setFamille(e.target.value)}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        >
          {FAMILLES.map((f) => (
            <option key={f.code} value={f.code}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-muted">
          {produits.length} produit(s) · {nbValides} grille(s) validée(s) · {nbPropositions} proposition(s) en attente ·{" "}
          {nbAAnalyser} à analyser
        </span>
        <button
          type="button"
          disabled={busy !== null || nbAAnalyser === 0}
          onClick={() => void analyserLot()}
          className="rounded-full bg-[#0A192F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "lot"
            ? `Analyse ${(lot?.fait ?? 0) + 1}/${lot?.total ?? 0}…`
            : `Analyser les ${nbAAnalyser} contrat(s) restants`}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void action(
              "sync",
              async () => {
                const r = (await synchroniser({ data: undefined })) as {
                  fichiers_vus: number;
                  liens_crees: number;
                  deja_lies: number;
                  ignores: { fichier: string; chemin: string; raison: string }[];
                };
                const details =
                  r.ignores.length > 0
                    ? ` · non rattachés : ${r.ignores
                        .slice(0, 5)
                        .map((i) => `${i.chemin}/${i.fichier} (${i.raison})`)
                        .join(" ; ")}`
                    : "";
                setMessage({
                  type: r.liens_crees > 0 || r.ignores.length === 0 ? "ok" : "err",
                  texte: `Drive : ${r.fichiers_vus} fichier(s) lu(s), ${r.liens_crees} nouveau(x) lien(s), ${r.deja_lies} déjà rattaché(s)${details}`,
                });
              },
              "Synchronisation du Drive terminée.",
            )
          }
          className="rounded-full border border-[#B99B3F] px-4 py-2 text-sm font-medium text-[#0A192F] disabled:opacity-50"
        >
          {busy === "sync" ? "Lecture du Drive…" : "Remonter les CG du Drive"}
        </button>
      </div>


      {message && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            message.type === "ok"
              ? "border-line bg-background text-ink"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {message.texte}
        </p>
      )}

      {!grille && (
        <p className="text-sm text-ink-muted">
          Aucune trame standardisée n'existe pour cette famille : les contrats restent consultables sans grille
          comparable.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface-elevated">
        <table className="w-full text-sm">
          <thead className="bg-background/60 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">Contrat</th>
              <th className="px-4 py-3">Documents</th>
              <th className="px-4 py-3">État de la grille</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {produits.map((p) => (
              <tr key={p.produit_id} className="border-t border-line align-top">
                <td className="px-4 py-3">
                  {p.compagnie_id ? (
                    <Link
                      to="/espace/compagnies/$id"
                      params={{ id: p.compagnie_id }}
                      className="text-ink underline decoration-line hover:decoration-ink"
                    >
                      {p.nom}
                    </Link>
                  ) : (
                    <span className="text-ink">{p.nom}</span>
                  )}
                  <p className="text-xs text-ink-muted">
                    {p.compagnie ?? "compagnie non renseignée"}
                    {p.statut_produit !== "actif" ? ` · ${p.statut_produit}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs text-ink-muted">
                  {p.documents.length === 0 ? (
                    <span className="text-destructive">aucun document analysable</span>
                  ) : (
                    p.documents
                      .slice(0, 4)
                      .map((d) => d.type)
                      .join(", ")
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {p.grille_statut === "valide" ? (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-ink">
                      Validée
                      {p.valide_le ? ` le ${new Date(p.valide_le).toLocaleDateString("fr-FR")}` : ""}
                    </span>
                  ) : p.proposition ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">
                      Proposition IA du {new Date(p.proposition.created_at).toLocaleDateString("fr-FR")} — à valider
                    </span>
                  ) : p.grille_statut ? (
                    <span className="text-ink-muted">Brouillon non validé</span>
                  ) : (
                    <span className="text-ink-muted">Aucune grille</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {p.documents.length > 0 && p.grille_statut !== "valide" && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void action(
                            `a-${p.produit_id}`,
                            () => analyserProduit(p),
                            "Proposition générée : relisez-la avant validation.",
                          )
                        }
                        className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:bg-background"
                      >
                        {busy === `a-${p.produit_id}` ? "Analyse…" : p.proposition ? "Relancer" : "Analyser"}
                      </button>
                    )}
                    {p.proposition && role === "admin" && (
                      <button
                        type="button"
                        disabled={busy !== null || !grille}
                        onClick={() =>
                          void action(
                            `v-${p.produit_id}`,
                            () => validerProposition(p),
                            "Grille validée : elle alimente le comparatif et le devoir de conseil.",
                          )
                        }
                        className="rounded-full bg-[#0A192F] px-3 py-1 text-xs text-white disabled:opacity-50"
                      >
                        {busy === `v-${p.produit_id}` ? "Validation…" : "Valider la proposition"}
                      </button>
                    )}
                    {p.compagnie_id && (
                      <Link
                        to="/espace/compagnies/$id"
                        params={{ id: p.compagnie_id }}
                        className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:bg-background"
                      >
                        Relire ligne par ligne
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {produits.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-muted">
                  Aucun produit dans cette famille.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-muted">
        La validation reste humaine et obligatoire (exigence DDA) : l'analyse ne produit qu'une proposition. La
        validation en un clic reprend la proposition telle quelle — utilisez « Relire ligne par ligne » pour corriger un
        poste avant validation.
      </p>
    </div>
  );
}
