import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconBooks } from "@tabler/icons-react";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth-context";
import {
  COUVERTURE_LABEL,
  grillePourFamille,
  groupesGrille,
  valeurVide,
  type Couverture,
  type ValeurGarantie,
  type ValeursGrille,
} from "@/lib/garanties-grille";
import { BRANCHES, labelForBranche } from "@/lib/recueil-besoins-schemas";
import {
  analyserCgBibliothequeFn,
  enregistrerBrouillonCgBibliotheque,
  listerCgBibliotheque,
  urlCgBibliotheque,
  validerCgBibliotheque,
} from "@/lib/bibliotheque-cg.functions";
import { ouvrirPdf } from "@/lib/ouvrir-pdf";

export const Route = createFileRoute("/_authenticated/espace/bibliotheque-cg")({
  component: BibliothequeCgPage,
  head: () => ({
    meta: [
      { title: "Bibliothèque des CG clients — EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Annuaire des conditions générales apportées par les clients : extraction automatique, validation humaine et comparatif de garanties.",
      },
      { property: "og:title", content: "Bibliothèque des CG clients — EJ Partners Assurances" },
      {
        property: "og:description",
        content:
          "Annuaire CRM des conditions générales clients, toutes branches, avec grille de garanties validée par le cabinet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Entree = {
  id: string;
  compagnie_nom: string;
  branche: string;
  edition_annee: string | null;
  nom_fichier: string | null;
  famille_code: string | null;
  grille_version: number | null;
  valeurs: ValeursGrille | null;
  valeurs_proposees: ValeursGrille | null;
  avertissements: string | null;
  modele_ia: string | null;
  statut: string;
  valide: boolean;
  valide_le: string | null;
  created_at: string;
};

const COUVERTURES: Couverture[] = ["oui", "option", "non", "inconnu"];

function BibliothequeCgPage() {
  const { role, loading } = useAuth();
  const staff = role === "admin" || role === "mandataire";
  const lister = useServerFn(listerCgBibliotheque);
  const analyser = useServerFn(analyserCgBibliothequeFn);
  const enregistrer = useServerFn(enregistrerBrouillonCgBibliotheque);
  const valider = useServerFn(validerCgBibliotheque);
  const lien = useServerFn(urlCgBibliotheque);

  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [filtre, setFiltre] = useState<string>("");
  const [selection, setSelection] = useState<string | null>(null);
  const [valeurs, setValeurs] = useState<ValeursGrille>({});
  const [edition, setEdition] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const deposerFn = useServerFn(enregistrerCgBibliotheque);
  const [newCompagnie, setNewCompagnie] = useState("");
  const [newBranche, setNewBranche] = useState<string>(BRANCHES[0]?.value ?? "emprunteur");
  const [newEdition, setNewEdition] = useState("");
  const [newFichier, setNewFichier] = useState<File | null>(null);


  const charger = useCallback(async () => {
    const res = (await lister({ data: { branche: filtre || null } })) as { entrees: Entree[] };
    setEntrees(res.entrees ?? []);
  }, [lister, filtre]);

  useEffect(() => {
    if (staff) void charger();
  }, [staff, charger]);

  const courante = useMemo(() => entrees.find((e) => e.id === selection) ?? null, [entrees, selection]);
  const grille = useMemo(() => grillePourFamille(courante?.famille_code ?? null), [courante]);

  const ouvrir = (e: Entree) => {
    setSelection(e.id);
    setMessage(null);
    setEdition(e.edition_annee ?? "");
    const base = (e.valide ? e.valeurs : e.valeurs ?? e.valeurs_proposees) ?? e.valeurs_proposees ?? {};
    setValeurs(Object.keys(base).length > 0 ? { ...base } : { ...(e.valeurs_proposees ?? {}) });
  };

  const majValeur = (code: string, patch: Partial<ValeurGarantie>) =>
    setValeurs((v) => ({ ...v, [code]: { ...(v[code] ?? valeurVide()), ...patch } }));

  const action = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="p-6 text-sm text-ink-muted">Chargement…</p>;
  if (!staff) return <p className="p-6 text-sm text-ink-muted">Accès réservé au cabinet.</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={IconBooks}
        title="Bibliothèque des CG clients"
        description="Conditions générales apportées par les clients, toutes branches — extraction automatique puis validation humaine obligatoire."
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filtre}
          onChange={(e) => setFiltre(e.target.value)}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        >
          <option value="">Toutes les branches</option>
          {BRANCHES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-muted">{entrees.length} document(s)</span>
      </div>

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void deposer();
        }}
        className="space-y-4 rounded-2xl border border-line bg-surface-elevated p-6"
      >
        <div>
          <h2 className="font-serif text-lg text-ink">Ajouter des conditions générales (interne)</h2>
          <p className="text-xs text-ink-muted">
            Dépôt par le cabinet, pour le compte d'un client. L'extraction IA reste un brouillon à valider.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Compagnie déclarée</span>
            <input
              value={newCompagnie}
              onChange={(e) => setNewCompagnie(e.target.value)}
              required
              placeholder="Ex. Cardif"
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Branche</span>
            <select
              value={newBranche}
              onChange={(e) => setNewBranche(e.target.value)}
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            >
              {BRANCHES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Année d'édition</span>
            <input
              value={newEdition}
              onChange={(e) => setNewEdition(e.target.value)}
              placeholder="Ex. 2024"
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Document (PDF)</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setNewFichier(e.target.files?.[0] ?? null)}
              required
              className="w-full rounded-md border border-line bg-background px-3 py-1.5 text-xs"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy || !newFichier}
          className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          {busy ? "Dépôt en cours…" : "Déposer et analyser"}
        </button>
      </form>


      {message && <p className="text-sm text-ink">{message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface-elevated">
        <table className="w-full text-sm">
          <thead className="bg-background/60 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">Compagnie déclarée</th>
              <th className="px-4 py-3">Branche</th>
              <th className="px-4 py-3">Édition</th>
              <th className="px-4 py-3">État</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entrees.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="px-4 py-3 text-ink">{e.compagnie_nom}</td>
                <td className="px-4 py-3 text-ink-muted">{labelForBranche(e.branche)}</td>
                <td className="px-4 py-3">
                  {e.edition_annee ? (
                    <span className="text-ink">{e.edition_annee}</span>
                  ) : (
                    <span className="text-destructive">inconnue</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      e.valide ? "bg-accent/15 text-ink" : "bg-background text-ink-muted"
                    }`}
                  >
                    {e.valide ? "Validé" : e.statut === "brouillon" ? "Brouillon IA" : e.statut}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => ouvrir(e)}
                    className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:bg-background"
                  >
                    Relire
                  </button>
                </td>
              </tr>
            ))}
            {entrees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                  Aucun document dans la bibliothèque pour ce filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {courante && (
        <div className="space-y-5 rounded-2xl border border-line bg-surface-elevated p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-lg text-ink">
                {courante.compagnie_nom} · {labelForBranche(courante.branche)}
              </h2>
              <p className="text-xs text-ink-muted">
                {courante.nom_fichier ?? "document"} · déposé le{" "}
                {new Date(courante.created_at).toLocaleDateString("fr-FR")}
                {courante.modele_ia ? ` · analyse ${courante.modele_ia}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void ouvrirPdf(async () => {
                    const r = (await lien({ data: { id: courante.id } })) as { url: string };
                    return r.url;
                  })
                }
                className="rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:bg-background"
              >
                Ouvrir le document
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const r = (await analyser({ data: { id: courante.id } })) as { valeurs: ValeursGrille };
                    setValeurs({ ...r.valeurs });
                  }, "Analyse relancée : relisez chaque poste avant validation.")
                }
                className="rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:bg-background"
              >
                Relancer l'analyse IA
              </button>
            </div>
          </div>

          {courante.avertissements && (
            <p className="whitespace-pre-line rounded-xl border border-line bg-background/50 p-3 text-xs text-ink-muted">
              {courante.avertissements}
            </p>
          )}

          <label className="block max-w-xs text-sm">
            <span className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
              Année d'édition (obligatoire pour valider)
            </span>
            <input
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
              placeholder="Ex : 2024"
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </label>

          {!grille ? (
            <p className="text-sm text-ink-muted">
              Aucune trame standardisée n'existe pour cette branche : le document reste consultable, sans grille
              comparable.
            </p>
          ) : (
            <div className="space-y-6">
              {groupesGrille(grille).map((g) => (
                <div key={g.groupe ?? "principal"} className="space-y-2">
                  {g.groupe && <h3 className="text-sm font-medium text-ink">{g.groupe}</h3>}
                  <div className="space-y-2">
                    {g.garanties.map((def) => {
                      const v = valeurs[def.code] ?? valeurVide();
                      return (
                        <div
                          key={def.code}
                          className="grid gap-2 rounded-xl border border-line bg-background/40 p-3 md:grid-cols-[1.4fr_0.8fr_1fr_1fr]"
                        >
                          <div>
                            <p className="text-sm text-ink">{def.libelle}</p>
                            {v.extrait && <p className="mt-1 text-xs text-ink-muted">« {v.extrait} »</p>}
                          </div>
                          <select
                            value={v.couverture}
                            onChange={(e) =>
                              majValeur(def.code, { couverture: e.target.value as Couverture })
                            }
                            className="rounded-md border border-line bg-background px-2 py-1 text-sm"
                          >
                            {COUVERTURES.map((c) => (
                              <option key={c} value={c}>
                                {COUVERTURE_LABEL[c]}
                              </option>
                            ))}
                          </select>
                          <input
                            value={v.plafond ?? ""}
                            onChange={(e) => majValeur(def.code, { plafond: e.target.value || null })}
                            placeholder="Plafond / limite"
                            className="rounded-md border border-line bg-background px-2 py-1 text-sm"
                          />
                          <input
                            value={v.delai_carence ?? ""}
                            onChange={(e) => majValeur(def.code, { delai_carence: e.target.value || null })}
                            placeholder="Délai de carence"
                            className="rounded-md border border-line bg-background px-2 py-1 text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      () =>
                        enregistrer({
                          data: { id: courante.id, valeurs, edition_annee: edition || null },
                        }),
                      "Brouillon enregistré.",
                    )
                  }
                  className="rounded-full border border-line px-4 py-2 text-sm text-ink hover:bg-background"
                >
                  Enregistrer le brouillon
                </button>
                <button
                  type="button"
                  disabled={busy || edition.trim().length < 4}
                  onClick={() =>
                    void action(
                      () => valider({ data: { id: courante.id, valeurs, edition_annee: edition.trim() } }),
                      "Grille validée : elle peut alimenter le comparatif du devoir de conseil.",
                    )
                  }
                  className="rounded-full bg-[#0A192F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Valider la grille
                </button>
              </div>
              {edition.trim().length < 4 && (
                <p className="text-xs text-destructive">
                  Sans année d'édition confirmée, la validation est bloquée : le document ne pourra jamais être réutilisé
                  pour un autre client.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
