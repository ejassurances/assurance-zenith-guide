/**
 * Étape 0 du parcours emprunteur — Import des documents du prêt.
 *
 * Une étape = une vue : cette étape se limite au dépôt des pièces du prêt et à
 * la confirmation du statut d'extraction. Les valeurs lues pré-remplissent les
 * étapes « Prêts » et « Informations personnelles » : elles ne sont pas
 * réaffichées ici. Charte marine / doré conservée.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { DocumentsPretPanel } from "@/components/documents-pret-panel";

type Resultat = {
  recueil: Record<string, unknown> | null;
  ajouts: string[];
  manquants: string[];
};

function Bloc({
  numero,
  titre,
  sousTitre,
  children,
}: {
  numero?: string;
  titre: string;
  sousTitre?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface-elevated">
      <header className="flex flex-nowrap items-start gap-3 border-b border-line px-5 py-3">
        {numero && (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent bg-accent/10 text-[11px] font-medium text-ink">
            {numero}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="font-serif text-base font-medium text-ink">{titre}</h3>
          {sousTitre && <p className="text-xs text-ink-muted">{sousTitre}</p>}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ImportDocumentsEmprunteur({
  dossierId,
  client,
  onChanged,
}: {
  dossierId: string;
  recueil?: Record<string, unknown> | null;
  client: {
    id: string | null;
    nom: string;
    email: string | null;
    telephone: string | null;
    reference?: string | null;
  };
  onChanged: () => void;
}) {
  const [resultat, setResultat] = useState<Resultat | null>(null);

  /** Statut d'extraction : réussie, à vérifier, ou aucune analyse lancée. */
  const statut = !resultat
    ? "attente"
    : resultat.ajouts.length > 0 && resultat.manquants.length === 0
      ? "reussie"
      : resultat.ajouts.length > 0
        ? "a_verifier"
        : "echouee";

  const libelle = {
    attente: "Aucune analyse lancée",
    reussie: "Extraction réussie",
    a_verifier: "Extraction à vérifier",
    echouee: "Extraction sans résultat exploitable",
  }[statut];

  const couleur = {
    attente: "border-line bg-background text-ink-muted",
    reussie: "border-accent bg-accent/10 text-ink",
    a_verifier: "border-accent/60 bg-accent/5 text-ink",
    echouee: "border-destructive/50 bg-destructive/10 text-ink",
  }[statut];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <Bloc
          numero="1"
          titre="Dépôt des pièces du prêt"
          sousTitre="Offre de prêt et / ou tableau d'amortissement — PDF, image ou tableur"
        >
          <DocumentsPretPanel
            dossierId={dossierId}
            filtre="pret"
            onAnalyse={(r) => {
              setResultat(r);
              onChanged();
            }}
          />
        </Bloc>

        <Bloc numero="2" titre="Statut de l'extraction" sousTitre="Le document importé fait foi">
          <div
            className={"inline-flex items-center rounded-full border px-3 py-1 text-xs " + couleur}
          >
            {libelle}
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            {statut === "attente"
              ? "Déposez l'offre de prêt ou le tableau d'amortissement, puis lancez « Analyser et pré-remplir »."
              : statut === "echouee"
                ? "Aucune donnée exploitable n'a été lue : les champs seront saisis manuellement aux étapes « Prêts » et « Informations personnelles »."
                : statut === "a_verifier"
                  ? `${resultat?.ajouts.length} champ(s) lus, ${resultat?.manquants.length} à compléter aux étapes « Prêts » et « Informations personnelles ».`
                  : `${resultat?.ajouts.length} champ(s) lus et reportés aux étapes « Prêts » et « Informations personnelles ».`}
          </p>
        </Bloc>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-4 lg:self-start">
        <Bloc titre="Client du dossier">
          <p className="font-serif text-base text-ink">{client.nom}</p>
          <dl className="mt-2 space-y-1 text-xs">
            {client.reference && (
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Dossier</dt>
                <dd className="text-ink">{client.reference}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Email</dt>
              <dd className="truncate text-ink">{client.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Téléphone</dt>
              <dd className="text-ink">{client.telephone ?? "—"}</dd>
            </div>
          </dl>
          {client.id && (
            <Link
              to="/espace/clients/$id"
              params={{ id: client.id }}
              className="mt-3 inline-block text-xs text-ink underline underline-offset-4"
            >
              Ouvrir la fiche client →
            </Link>
          )}
        </Bloc>

        <Bloc titre="Rappel de méthode">
          <ul className="space-y-2 text-xs text-ink-soft">
            <li>• Le document importé fait foi sur toute saisie antérieure.</li>
            <li>• Les valeurs lues se retrouvent aux étapes suivantes, pas ici.</li>
            <li>• Aucune étape réglementaire n'est franchie automatiquement.</li>
          </ul>
        </Bloc>
      </aside>
    </div>
  );
}
