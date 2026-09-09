/**
 * Étape 0 du parcours emprunteur — Import des documents du prêt.
 *
 * Interface structurée (et non un bloc de texte) : sections délimitées à
 * en-têtes explicites, dépôt des pièces à gauche, données lues sous forme de
 * champs identifiables, et synthèse de l'analyse IA isolée dans la colonne de
 * droite avec le rappel du client. Charte marine / doré conservée.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { DocumentsPretPanel } from "@/components/documents-pret-panel";

type Resultat = {
  recueil: Record<string, unknown> | null;
  ajouts: string[];
  manquants: string[];
};

/** Champs du prêt affichés en lecture, dans l'ordre du recueil. */
const CHAMPS_PRET: { cle: string; label: string; format?: "euros" | "pourcent" | "mois" }[] = [
  { cle: "banque", label: "Banque prêteuse" },
  { cle: "objet_pret", label: "Objet du prêt" },
  { cle: "capital", label: "Capital emprunté", format: "euros" },
  { cle: "capital_restant_du", label: "Capital restant dû", format: "euros" },
  { cle: "taux_pret", label: "Taux du prêt", format: "pourcent" },
  { cle: "duree_mois", label: "Durée totale", format: "mois" },
  { cle: "mois_restants", label: "Mois restants", format: "mois" },
  { cle: "taux_assurance_banque", label: "Taux assurance banque", format: "pourcent" },
  { cle: "assurance_banque_mensuelle", label: "Cotisation banque", format: "euros" },
];

function formatValeur(valeur: unknown, format?: "euros" | "pourcent" | "mois"): string | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const n = Number(valeur);
  if (format && Number.isFinite(n)) {
    if (format === "euros") return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;
    if (format === "pourcent") return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} %`;
    if (format === "mois") return `${n} mois`;
  }
  return String(valeur);
}

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
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        {numero && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent bg-accent/10 text-[11px] font-medium text-ink">
            {numero}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-serif text-base font-medium text-ink">{titre}</h3>
          {sousTitre && <p className="text-xs text-ink-muted">{sousTitre}</p>}
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ImportDocumentsEmprunteur({
  dossierId,
  recueil,
  client,
  onChanged,
}: {
  dossierId: string;
  recueil: Record<string, unknown> | null;
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
  const donnees = (resultat?.recueil ?? recueil ?? {}) as Record<string, unknown>;
  const assures = Array.isArray(donnees["assures"])
    ? (donnees["assures"] as Record<string, unknown>[])
    : [];

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
            onAnalyse={(r) => {
              setResultat(r);
              onChanged();
            }}
          />
        </Bloc>

        <Bloc
          numero="2"
          titre="Données lues sur les documents"
          sousTitre="Le document importé fait foi : toute divergence est corrigée et tracée dans l'historique"
        >
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {CHAMPS_PRET.map((c) => {
              const valeur = formatValeur(donnees[c.cle], c.format);
              return (
                <div key={c.cle} className="border-b border-line pb-2">
                  <dt className="text-[11px] uppercase tracking-wide text-ink-muted">{c.label}</dt>
                  <dd className={"mt-0.5 text-sm " + (valeur ? "text-ink" : "text-ink-muted")}>
                    {valeur ?? "Non renseigné"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Bloc>

        <Bloc
          numero="3"
          titre="Emprunteurs identifiés"
          sousTitre="Un dossier par prêt, une fiche et un contrat par assuré"
        >
          {assures.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Aucun emprunteur détecté pour l'instant : déposez l'offre de prêt ou complétez le
              recueil des besoins.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {assures.map((a, i) => (
                <li key={i} className="rounded-xl border border-line bg-background p-3">
                  <p className="font-serif text-sm text-ink">
                    {[a["prenom"], a["nom"]].filter(Boolean).join(" ") || `Assuré ${i + 1}`}
                  </p>
                  <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Quotité</dt>
                      <dd className="text-ink">{formatValeur(a["quotite"], "pourcent") ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Date de naissance</dt>
                      <dd className="text-ink">{formatValeur(a["date_naissance"]) ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Profession</dt>
                      <dd className="text-ink">{formatValeur(a["profession"]) ?? "—"}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
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

        <Bloc titre="Synthèse de l'analyse IA">
          {!resultat ? (
            <p className="text-xs text-ink-muted">
              Aucune analyse lancée sur cette session. Déposez un document ou utilisez « Analyser et
              pré-remplir » pour obtenir la synthèse.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                  Champs renseignés ({resultat.ajouts.length})
                </p>
                {resultat.ajouts.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-muted">Aucun nouveau champ exploitable.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {resultat.ajouts.map((a) => (
                      <li
                        key={a}
                        className="rounded-full border border-accent/60 bg-accent/10 px-2 py-0.5 text-[11px] text-ink"
                      >
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                  À compléter manuellement ({resultat.manquants.length})
                </p>
                {resultat.manquants.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-muted">Rien à compléter.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {resultat.manquants.map((m) => (
                      <li
                        key={m}
                        className="rounded-full border border-line bg-background px-2 py-0.5 text-[11px] text-ink-soft"
                      >
                        {m}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Bloc>

        <Bloc titre="Rappel de méthode">
          <ul className="space-y-2 text-xs text-ink-soft">
            <li>• Le document importé fait foi sur toute saisie antérieure.</li>
            <li>• Les fiches clients ne sont complétées que sur les champs vides.</li>
            <li>• Aucune étape réglementaire n'est franchie automatiquement.</li>
          </ul>
        </Bloc>
      </aside>
    </div>
  );
}
