/**
 * Recueil des besoins d'un dossier existant.
 *
 * Le conseiller retrouve exactement le même parcours par étapes que lors de la
 * création du dossier (une étape par section + récapitulatif). La colonne
 * latérale est CONTEXTUELLE : elle n'affiche à chaque étape que ce qui sert
 * réellement — rappel du client, dépôt de l'offre de prêt et du tableau
 * d'amortissement à l'étape du prêt, fiches clients des assurés à l'étape des
 * assurés, devis (API partenaires + catalogue, notation IA) à l'étape de
 * tarification, pièces diverses ensuite.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getBranche, type BrancheConfig } from "@/lib/recueil-besoins-schemas";
import { RecueilWorkflow } from "@/components/recueil-workflow";
import { DocumentsPretPanel } from "@/components/documents-pret-panel";
import { DossierDevisPanel } from "@/components/dossier-devis-panel";
import { synchroniserAssuresClients } from "@/lib/recueil-clients.functions";

/** Étape de tarification : c'est là que les devis sont produits. */
function estEtapeTarification(titre: string): boolean {
  return /tarif/i.test(titre);
}

/** Étape du prêt : c'est là que l'offre et le tableau d'amortissement arrivent. */
function estEtapePret(titre: string): boolean {
  return /pr[eê]t/i.test(titre);
}

/** Étape des personnes assurées. */
function estEtapeAssures(titre: string): boolean {
  return /assur/i.test(titre);
}

function PanneauLateral({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-background/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{titre}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

/** Fiches clients des assurés du prêt : une fiche par assuré, jamais d'écrasement. */
function FichesAssures({ dossierId, canEdit }: { dossierId: string; canEdit: boolean }) {
  const sync = useServerFn(synchroniserAssuresClients);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lancer = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await sync({ data: { dossier_id: dossierId } });
      setMsg(res.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur de synchronisation");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanneauLateral titre="Fiches clients des assurés">
      <p className="text-xs text-ink-muted">
        Chaque assuré du prêt dispose de sa propre fiche client (un contrat par assuré au passage en contrat). Seuls
        les champs vides sont complétés : aucune saisie existante n'est écrasée.
      </p>
      {canEdit && (
        <button
          type="button"
          onClick={() => void lancer()}
          disabled={busy}
          className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Synchronisation…" : "Mettre à jour les fiches clients"}
        </button>
      )}
      {msg && <p className="text-xs text-ink-muted">{msg}</p>}
    </PanneauLateral>
  );
}

export function RecueilDossierPanel({
  dossierId,
  typeAssurance,
  recueil,
  canEdit,
  onSaved,
  client,
}: {
  dossierId: string;
  typeAssurance: string;
  recueil: Record<string, unknown> | null;
  canEdit: boolean;
  onSaved?: () => void;
  /** Informations client rappelées en permanence dans la colonne latérale. */
  client?: {
    id: string | null;
    nom: string;
    email: string | null;
    telephone: string | null;
    reference?: string | null;
  };
}) {
  const branche = getBranche(typeAssurance) as BrancheConfig | null;
  const [values, setValues] = useState<Record<string, unknown>>(recueil ?? {});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const syncClients = useServerFn(synchroniserAssuresClients);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  if (!branche) return null;

  const enregistrer = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase
      .from("dossiers")
      .update({ recueil_besoins: values as never })
      .eq("id", dossierId);
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    let complement = "";
    try {
      const res = await syncClients({ data: { dossier_id: dossierId } });
      complement = ` ${res.message}`;
    } catch {
      complement = " Fiches clients non mises à jour.";
    }
    setMessage(`Recueil enregistré.${complement}`);
    onSaved?.();
    setSaving(false);
  };

  const contexte = client ? (
    <PanneauLateral titre="Client du dossier">
      <p className="font-serif text-base text-ink">{client.nom}</p>
      <dl className="space-y-1 text-xs">
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
          className="inline-block text-xs text-ink underline"
        >
          Ouvrir la fiche client →
        </Link>
      )}
    </PanneauLateral>
  ) : null;

  /** Colonne latérale contextuelle : uniquement ce qui sert à l'étape en cours. */
  const lateral = (titre: string) => {
    if (branche.value === "emprunteur" && estEtapePret(titre)) {
      return (
        <PanneauLateral titre="Offre de prêt & tableau d'amortissement">
          <DocumentsPretPanel
            dossierId={dossierId}
            onAnalyse={({ recueil: prerempli }) => {
              if (!prerempli) return;
              // Les saisies en cours (non encore enregistrées) restent prioritaires.
              setValues((prev) => {
                const fusion: Record<string, unknown> = { ...prerempli };
                for (const [cle, valeur] of Object.entries(prev)) {
                  const estVide =
                    valeur === null ||
                    valeur === undefined ||
                    valeur === "" ||
                    (Array.isArray(valeur) && valeur.length === 0);
                  if (!estVide) fusion[cle] = valeur;
                }
                return fusion;
              });
              setMessage("Document analysé : les étapes suivantes ont été pré-remplies.");
            }}
          />
        </PanneauLateral>
      );
    }
    if (estEtapeAssures(titre)) {
      return <FichesAssures dossierId={dossierId} canEdit={canEdit} />;
    }
    if (estEtapeTarification(titre) && userId) {
      return (
        <PanneauLateral titre={`Devis — API partenaires et catalogue ${branche.label}`}>
          <DossierDevisPanel
            dossierId={dossierId}
            branche={branche.value}
            userId={userId}
            onChanged={onSaved}
          />
        </PanneauLateral>
      );
    }
    return (
      <PanneauLateral titre="Pièces du recueil">
        <DocumentsPretPanel
          dossierId={dossierId}
          titre="Pièces, relevés et justificatifs"
          filtre="tous"
          typeDocument="recueil"
        />
      </PanneauLateral>
    );
  };

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
        contexte={contexte}
        asideSection={(section) => lateral(section.title)}
      />
      {message && <p className="text-sm text-ink-muted">{message}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
