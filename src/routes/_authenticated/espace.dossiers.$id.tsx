import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { BoutonEnvoiEmail } from "@/components/envoi-rapide-email";
import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { creerEtEnvoyerLettreMission } from "@/lib/lettres-mission.functions";
import {
  getBranche,
  isBrancheLegacy,
  labelForBranche,
  personnesAssurees,
  assuresEmprunteur,
  LIENS_EMPRUNTEUR,
  CSP_EMPRUNTEUR,
  ageDepuisDateNaissance,
  LIENS_ASSURE,
  REGIMES_OBLIGATOIRES,
} from "@/lib/recueil-besoins-schemas";

import { DossierPiecesPanel } from "@/components/dossier-pieces-panel";
import { CompagnieProduitPicker } from "@/components/compagnie-produit-picker";
import { ProduitDocumentsLink } from "@/components/produit-documents-link";
import { DossierPipeline } from "@/components/dossier-pipeline";
import { DevoirConseilPanel } from "@/components/devoir-conseil-panel";
import { DevoirConseilRefusAnalysePanel } from "@/components/devoir-conseil-refus-analyse-panel";
import { SouscriptionPanel } from "@/components/souscription-panel";
import { CopilotePanel } from "@/components/copilote-panel";
import { AnalyseRecueilPanel } from "@/components/analyse-recueil-panel";
import { RecueilDossierPanel } from "@/components/recueil-dossier-panel";

import { DossierDevisPanel } from "@/components/dossier-devis-panel";
import { SimulassurConsole } from "@/components/simulassur-console";
import { EtudeEpargnePanel } from "@/components/etude-epargne-panel";
import { traiterDocumentDepose } from "@/lib/etudes.functions";
import { ETAPES, etapeLabel, estEtapeValide, type EtapeKey } from "@/lib/pipeline-dossier";
import { ParcoursEmprunteurNav } from "@/components/parcours-emprunteur-nav";
import { ImportDocumentsEmprunteur } from "@/components/import-documents-emprunteur";
import {
  etapeCouranteParcours,
  parcoursEtape,
  type ParcoursKey,
} from "@/lib/parcours-emprunteur";
import { DocumentsPretPanel } from "@/components/documents-pret-panel";
import { DossierReferencesExternesPanel } from "@/components/dossier-references-externes-panel";
import { DossierTachesPanel } from "@/components/dossier-taches-panel";

import { CompletudeRings } from "@/components/completude-rings";
import { useCompletudeDossier } from "@/hooks/use-completude";
import { usePreuvesParcours } from "@/hooks/use-preuves-parcours";


export const Route = createFileRoute("/_authenticated/espace/dossiers/$id")({
  validateSearch: (search: Record<string, unknown>): { etape?: string } => ({
    etape: typeof search.etape === "string" ? search.etape : undefined,
  }),
  component: DossierDetail,
});

type Dossier = {
  id: string;
  reference: string;
  client_id: string | null;
  client_nom: string;
  client_email: string | null;
  client_phone: string | null;
  statut: string;
  type_assurance: string;
  recueil_besoins: Record<string, unknown> | null;
  analyse_ia: Record<string, unknown> | null;
  analyse_ia_le: string | null;
  capital: number | null;
  duree_mois: number | null;
  age: number | null;
  fumeur: boolean | null;
  economie_estimee: number | null;
  notes: string | null;
  compagnie_id: string | null;
  produit_id: string | null;
  souscription_email_compagnie: string | null;
  souscription_envoyee_le: string | null;
  souscription_relances_nb: number | null;
  souscription_retour_le: string | null;
  created_at: string;
};

function CompagnieProduitSection({
  dossier,
  canEdit,
  onSaved,
}: {
  dossier: Dossier;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [compagnieId, setCompagnieId] = useState<string | null>(dossier.compagnie_id);
  const [produitId, setProduitId] = useState<string | null>(dossier.produit_id);
  const [saving, setSaving] = useState(false);

  const save = async (compagnie: string | null, produit: string | null) => {
    setSaving(true);
    await supabase
      .from("dossiers")
      .update({ compagnie_id: compagnie, produit_id: produit })
      .eq("id", dossier.id);
    setSaving(false);
    onSaved();
  };

  return (
    <Section id="section-compagnie-produit" title="Compagnie et produit">
      {canEdit ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <CompagnieProduitPicker
            branche={dossier.type_assurance}
            compagnieId={compagnieId}
            produitId={produitId}
            onChange={(sel) => {
              setCompagnieId(sel.compagnie_id);
              setProduitId(sel.produit_id);
              save(sel.compagnie_id, sel.produit_id);
            }}
          />
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          {produitId ? "Produit retenu pour ce dossier." : "Aucun produit retenu pour le moment."}
        </p>
      )}
      {saving && <p className="mt-2 text-xs text-ink-muted">Enregistrement…</p>}
      <div className="mt-3">
        <ProduitDocumentsLink produitId={produitId} compagnieId={compagnieId} />
      </div>
    </Section>
  );
}

function DossierDetail() {
  const { id } = useParams({ from: "/_authenticated/espace/dossiers/$id" });
  const { user, role } = useAuth();
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { etape } = Route.useSearch();
  const [selectedStep, setSelectedStep] = useState<EtapeKey | null>(() =>
    etape && estEtapeValide(etape) ? etape : null,
  );
  /** Étape visible du parcours emprunteur (présentation en 12 étapes). */
  const [parcours, setParcours] = useState<ParcoursKey | null>(null);
  /** Vue globale ACPR : onglet distinct du déroulé des étapes. */
  const [vueGlobale, setVueGlobale] = useState(false);
  const completude = useCompletudeDossier(id, dossier?.client_id ?? null);
  /** Actes réellement archivés : une étape réglementaire n'est cochée que s'ils existent. */
  const preuvesParcours = usePreuvesParcours(id, dossier?.type_assurance === "emprunteur");
  /** Score de conformité KYC du client (0-100) : sous 50 %, le dossier est gelé. */
  const [scoreKyc, setScoreKyc] = useState<number | null>(null);
  const [contreProposition, setContreProposition] = useState<{
    suggestion: string;
    motif: string;
    key: number;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("dossiers").select("*").eq("id", id).maybeSingle();
    if (error) setError(error.message);
    setDossier(data as Dossier | null);
    setLoading(false);
  };

  // Le dossier n'est rechargé depuis la base qu'à l'ouverture (ou changement de
  // dossier) — jamais à chaque changement d'étape, pour ne pas courir contre
  // la sauvegarde automatique en cours et écraser une saisie non encore écrite.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setSelectedStep(etape && estEtapeValide(etape) ? etape : null);
    // Lien direct vers une étape du parcours emprunteur (?etape=coordonnees…).
    if (etape && parcoursEtape(etape)) setParcours(etape as ParcoursKey);
  }, [etape]);


  useEffect(() => {
    const clientId = dossier?.client_id;
    if (!clientId) return setScoreKyc(null);
    let annule = false;
    (async () => {
      const { data } = await supabase.rpc("calculer_score_conformite_client", { _client_id: clientId });
      if (!annule) setScoreKyc(typeof data === "number" ? data : null);
    })();
    return () => {
      annule = true;
    };
  }, [dossier?.client_id]);

  if (loading) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!dossier)
    return <p className="text-sm text-ink-muted">Dossier introuvable ou accès refusé.</p>;

  const kycBloquant = scoreKyc != null && scoreKyc < 50;
  const canEdit =
    (role === "admin" || role === "mandataire" || role === "prescripteur") && !kycBloquant;

  const estEmprunteur = dossier.type_assurance === "emprunteur";
  const parcoursActif: ParcoursKey | null = estEmprunteur
    ? (parcours ?? etapeCouranteParcours(dossier.statut))
    : null;
  const displayedStep = parcoursActif
    ? (parcoursEtape(parcoursActif)?.statut ?? dossier.statut)
    : (selectedStep ?? dossier.statut);
  const userId = user?.id;
  const handlePipelineChanged = () => {
    setSelectedStep(null);
    setParcours(null);
    load();
  };


  return (
    <div className="space-y-8">
      <div>
        <Link to="/espace/dossiers" className="text-sm text-ink-muted hover:text-ink">
          ← Retour aux dossiers
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-medium text-ink">{dossier.client_nom}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Référence {dossier.reference} · {labelForBranche(dossier.type_assurance)}
        </p>
        <div className="mt-3">
          <BoutonEnvoiEmail type="dossier" id={dossier.id} />
        </div>
      </div>

      {kycBloquant && (
        <div className="rounded-2xl border-2 border-destructive/60 bg-destructive/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive">
            Dossier gelé — conformité KYC insuffisante
          </p>
          <p className="mt-2 text-sm text-ink">
            Le score de conformité du client est de <strong>{scoreKyc} %</strong> (seuil réglementaire : 50 %).
            L'édition du projet, la saisie de devis et la génération des documents DDA sont bloquées jusqu'à la
            régularisation des pièces KYC.
          </p>
          {dossier.client_id && (
            <Link
              to="/espace/clients/$id"
              params={{ id: dossier.client_id }}
              className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-sm text-primary-foreground"
            >
              Compléter le KYC du client
            </Link>
          )}
        </div>
      )}

      {isBrancheLegacy(dossier.type_assurance) && (
        <BrancheLegacyBanner dossierId={id} canEdit={canEdit} onReclassified={load} />
      )}

      <div className="crm-card p-6">
        <p className="crm-eyebrow">Complétude du dossier</p>
        <div className="mt-4">
          {completude ? (
            <CompletudeRings items={completude} />
          ) : (
            <p className="text-xs text-ink-muted">Calcul…</p>
          )}
        </div>
      </div>

      {parcoursActif && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVueGlobale(false)}
              className={
                "rounded-full border px-4 py-1.5 text-xs transition " +
                (vueGlobale
                  ? "border-line bg-background text-ink-muted hover:border-ink/40"
                  : "border-ink bg-ink text-primary-foreground")
              }
            >
              Parcours par étapes
            </button>
            <button
              type="button"
              onClick={() => setVueGlobale(true)}
              className={
                "rounded-full border px-4 py-1.5 text-xs transition " +
                (vueGlobale
                  ? "border-ink bg-ink text-primary-foreground"
                  : "border-line bg-background text-ink-muted hover:border-ink/40")
              }
            >
              Vue globale du dossier (traçabilité ACPR)
            </button>
          </div>
          {!vueGlobale && (
            <ParcoursEmprunteurNav
              statut={dossier.statut}
              active={parcoursActif}
              onSelect={setParcours}
              preuves={preuvesParcours}
              gele={kycBloquant}
            />
          )}
        </>
      )}


      {/* Suivi réglementaire : réservé à la vue globale et à la dernière étape. */}
      {(!parcoursActif || vueGlobale || parcoursActif === "analyse") && (
        <DossierPipeline
          dossierId={id}
          statut={dossier.statut}
          selectedStep={displayedStep}
          canEdit={canEdit}
          masquerPhases={!!parcoursActif}
          onChanged={handlePipelineChanged}
          onStepClick={(k) => {
            setParcours(null);
            setVueGlobale(false);
            setSelectedStep(k);
          }}
        />
      )}


      <div className="min-w-0">
        {userId && vueGlobale ? (
          <section className="space-y-6" aria-label="Vue globale du dossier">
            <div className="border-b border-line pb-3">
              <h2 className="font-serif text-xl font-medium text-ink">
                Vue globale du dossier — traçabilité ACPR
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                Ensemble des pièces et échanges du dossier, tous types confondus. Cette vue est
                distincte du déroulé des étapes : chaque document reste rattaché à son étape.
              </p>
            </div>
            <PiecesSection
              dossierId={id}
              clientEmail={dossier.client_email}
              canValidate={canEdit}
            />
            <DocumentsPanel dossierId={id} userId={userId} />
            <MessagesPanel dossierId={id} userId={userId} />
          </section>
        ) : (
          userId && (
            <StageContent
              step={displayedStep}
              parcours={parcoursActif}
              dossier={dossier}
              userId={userId}
              canEdit={canEdit}
              contreProposition={contreProposition}
              onChanged={load}
              onContreProposition={(suggestion, motif) => {
                setContreProposition({ suggestion, motif, key: Date.now() });
              }}
            />
          )
        )}
      </div>


    </div>
  );
}

/**
 * Étape 1 du parcours emprunteur — Coordonnées : identité et coordonnées de
 * contact de chaque emprunteur. L'identité connue en base PRIME toujours : elle
 * est reprise de la fiche client liée (titulaire et fiche de chaque assuré), et
 * le recueil ne sert qu'à compléter ce qui manque encore.
 */
function CoordonneesEtape({ dossier }: { dossier: Dossier }) {
  const assures = assuresEmprunteur(dossier.recueil_besoins?.["assures"]);
  const brut = Array.isArray(dossier.recueil_besoins?.["assures"])
    ? (dossier.recueil_besoins?.["assures"] as Record<string, unknown>[])
    : [];
  type Fiche = { id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null };
  const [fiches, setFiches] = useState<Record<string, Fiche>>({});

  const ids = [
    dossier.client_id,
    ...brut.map((a) => (typeof a["client_id"] === "string" ? (a["client_id"] as string) : null)),
  ].filter((v): v is string => Boolean(v));

  useEffect(() => {
    if (ids.length === 0) return;
    void (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, nom, prenom, email, telephone")
        .in("id", Array.from(new Set(ids)));
      const map: Record<string, Fiche> = {};
      for (const c of (data ?? []) as Fiche[]) map[c.id] = c;
      setFiches(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  const titulaire = dossier.client_id ? fiches[dossier.client_id] : undefined;

  /** Identité affichée : fiche client d'abord, recueil ensuite. */
  const lignes = (assures.length > 0 ? assures : [{ lien: "principal", prenom: "", nom: "" }]).map(
    (a, i) => {
      const clientId =
        (typeof brut[i]?.["client_id"] === "string" ? (brut[i]!["client_id"] as string) : null) ??
        (String(a.lien) === "principal" ? dossier.client_id : null);
      const fiche = clientId ? fiches[clientId] : undefined;
      const nomFiche = fiche ? `${fiche.prenom ?? ""} ${fiche.nom}`.trim() : "";
      const nomRecueil = `${a.prenom ?? ""} ${a.nom ?? ""}`.trim();
      const nom =
        nomFiche ||
        nomRecueil ||
        (String(a.lien) === "principal" ? dossier.client_nom : "") ||
        "Emprunteur sans nom";
      const email = fiche?.email ?? (String(a.lien) === "principal" ? dossier.client_email : null);
      const tel = fiche?.telephone ?? (String(a.lien) === "principal" ? dossier.client_phone : null);
      return {
        cle: `${nom}-${i}`,
        nom,
        source: nomFiche ? "fiche client" : nomRecueil ? "recueil" : "fiche du dossier",
        lien: LIENS_EMPRUNTEUR.find((l) => l.value === a.lien)?.label ?? String(a.lien),
        email,
        tel,
        clientId,
      };
    },
  );

  return (
    <div className="space-y-4">
      <Section title="Titulaire du dossier">
        <Row label="Nom">
          {titulaire ? `${titulaire.prenom ?? ""} ${titulaire.nom}`.trim() : dossier.client_nom}
        </Row>
        <Row label="Email">{titulaire?.email ?? dossier.client_email ?? "—"}</Row>
        <Row label="Téléphone">{titulaire?.telephone ?? dossier.client_phone ?? "—"}</Row>
        {dossier.client_id && (
          <Row label="Fiche client">
            <Link
              to="/espace/clients/$id"
              params={{ id: dossier.client_id }}
              className="text-sm text-ink underline"
            >
              Ouvrir la fiche pour modifier l'adresse et les coordonnées →
            </Link>
          </Row>
        )}
      </Section>

      <Section title="Emprunteurs du prêt">
        <ul className="space-y-3">
          {lignes.map((l) => (
            <li key={l.cle} className="rounded-xl border border-line bg-background/40 p-3">
              <p className="text-sm font-medium text-ink">
                {l.nom}
                <span className="text-ink-muted">{` · ${l.lien}`}</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {l.email ?? "email à compléter"} · {l.tel ?? "téléphone à compléter"} · identité
                reprise de la {l.source}
              </p>
              {l.clientId && (
                <Link
                  to="/espace/clients/$id"
                  params={{ id: l.clientId }}
                  className="mt-1 inline-block text-xs text-ink underline"
                >
                  Ouvrir la fiche client →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function StageContent({
  step,
  parcours = null,
  dossier,
  userId,
  canEdit,
  contreProposition,
  onChanged,
  onContreProposition,
}: {
  step: string;
  /** Étape visible du parcours emprunteur (présentation), si applicable. */
  parcours?: ParcoursKey | null;
  dossier: Dossier;
  userId: string;
  canEdit: boolean;
  contreProposition: { suggestion: string; motif: string; key: number } | null;
  onChanged: () => void;
  onContreProposition: (suggestion: string, motif: string) => void;
}) {
  const dossierId = dossier.id;
  // Une étape = une vue : dans le parcours emprunteur, les blocs transverses
  // (tous les documents, tous les messages) sont réservés à la vue globale.
  const documents = parcours ? null : <DocumentsPanel dossierId={dossierId} userId={userId} />;
  const messages = parcours ? null : <MessagesPanel dossierId={dossierId} userId={userId} />;
  const pieces = (
    <div id="section-pieces">
      <PiecesSection
        dossierId={dossierId}
        clientEmail={dossier.client_email}
        canValidate={canEdit}
      />
    </div>
  );
  const souscription = canEdit ? (
    <div id="section-souscription">
      <SouscriptionPanel
        dossierId={dossierId}
        statut={dossier.statut}
        emailCompagnie={dossier.souscription_email_compagnie}
        envoyeeLe={dossier.souscription_envoyee_le}
        relances={dossier.souscription_relances_nb}
        retourLe={dossier.souscription_retour_le}
        onChanged={onChanged}
      />
    </div>
  ) : null;

  let content: React.ReactNode;
  switch (step) {
    case "nouveau":
    case "en_cours":
      content = (
        <>
          <RecueilDossierPanel
            dossierId={dossierId}
            typeAssurance={dossier.type_assurance}
            recueil={dossier.recueil_besoins}
            canEdit={canEdit}
            onSaved={onChanged}
            client={{
              id: dossier.client_id,
              nom: dossier.client_nom,
              email: dossier.client_email,
              telephone: dossier.client_phone,
              reference: dossier.reference,
            }}
          />

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Informations client">
              <Row label="Email">{dossier.client_email ?? "—"}</Row>
              <Row label="Téléphone">{dossier.client_phone ?? "—"}</Row>
              <Row label="Âge">{dossier.age ?? "—"}</Row>
              <Row label="Fumeur">{dossier.fumeur ? "Oui" : "Non"}</Row>
            </Section>
            <Section title="Projet">
              <Row label="Capital">
                {dossier.capital ? `${Number(dossier.capital).toLocaleString("fr-FR")} €` : "—"}
              </Row>
              <Row label="Durée">{dossier.duree_mois ? `${dossier.duree_mois} mois` : "—"}</Row>
              <Row label="Économie estimée">
                {dossier.economie_estimee
                  ? `${Number(dossier.economie_estimee).toLocaleString("fr-FR")} €`
                  : "—"}
              </Row>
              <Row label="Étape">{etapeLabel(dossier.statut)}</Row>
            </Section>
          </div>
          {dossier.notes && (
            <Section title="Notes">
              <p className="whitespace-pre-wrap text-sm text-ink-soft">{dossier.notes}</p>
            </Section>
          )}
          {documents}
          {messages}
        </>
      );
      break;
    case "lettre_mission_envoyee":
      content = (
        <>
          {canEdit && (
            <LettreMissionPanel dossierId={dossierId} clientEmail={dossier.client_email} />
          )}
          {documents}
        </>
      );
      break;
    case "dda_validee":
      content = (
        <>
          {canEdit && (
            <LettreMissionPanel dossierId={dossierId} clientEmail={dossier.client_email} />
          )}
          <CompagnieProduitSection dossier={dossier} canEdit={canEdit} onSaved={onChanged} />
          {documents}
        </>
      );
      break;
    case "devis_en_cours":
      content = (
        <>
          <CompagnieProduitSection dossier={dossier} canEdit={canEdit} onSaved={onChanged} />
          {canEdit && (
            <DossierDevisPanel
              dossierId={dossierId}
              branche={labelForBranche(dossier.type_assurance)}
              userId={userId}
              onChanged={onChanged}
            />
          )}
          {canEdit && dossier.type_assurance === "emprunteur" && (
            <SimulassurConsole dossierId={dossierId} clientEmail={dossier.client_email} />
          )}
          {documents}
        </>
      );
      break;
    case "devoir_conseil_envoye":
    case "devoir_conseil_signe":
    case "devoir_conseil_refuse":
      content = (
        <>
          {canEdit && (
            <DevoirConseilRefusAnalysePanel
              dossierId={dossierId}
              userId={userId}
              onContreProposition={onContreProposition}
              onChanged={onChanged}
            />
          )}
          {canEdit && (
            <DevoirConseilPanel
              dossierId={dossierId}
              clientEmail={dossier.client_email}
              branche={dossier.type_assurance}
              onChanged={onChanged}
              contreProposition={contreProposition}
            />
          )}
          {documents}
        </>
      );
      break;
    case "souscription_envoyee":
    case "contrat_valide":
    case "contrat_actif":
      content = (
        <>
          {souscription}
          {pieces}
          {documents}
          {messages}
        </>
      );
      break;
    default:
      content = (
        <>
          {documents}
          {messages}
        </>
      );
  }

  // Étape 0 du parcours emprunteur : import initial des documents de prêt.
  if (parcours === "import") {
    content = (
      <>
        <ImportDocumentsEmprunteur
          dossierId={dossierId}
          recueil={dossier.recueil_besoins}
          onChanged={onChanged}
          client={{
            id: dossier.client_id,
            nom: dossier.client_nom,
            email: dossier.client_email,
            telephone: dossier.client_phone,
            reference: dossier.reference,
          }}
        />
      </>
    );
  }

  /** Une section du recueil rendue seule (une étape = une vue). */
  const sectionRecueil = (motif: RegExp) => (
    <RecueilDossierPanel
      dossierId={dossierId}
      typeAssurance={dossier.type_assurance}
      recueil={dossier.recueil_besoins}
      canEdit={canEdit}
      onSaved={onChanged}
      sectionUnique
      filtreSections={(titre) => motif.test(titre)}
      client={{
        id: dossier.client_id,
        nom: dossier.client_nom,
        email: dossier.client_email,
        telephone: dossier.client_phone,
        reference: dossier.reference,
      }}
    />
  );

  // Étape 1 — Coordonnées : identité et contacts, sans les champs du prêt.
  if (parcours === "coordonnees") {
    content = <CoordonneesEtape dossier={dossier} />;
  }

  // Étape 2 — Informations personnelles : les assurés à couvrir uniquement.
  if (parcours === "informations") {
    content = sectionRecueil(/assur/i);
  }

  // Étape 3 — Prêts : capital, taux, durée, date d'effet.
  if (parcours === "prets") {
    content = sectionRecueil(/pr[eê]t/i);
  }

  // Étape 4 — Prêteur : contrat d'assurance actuel de la banque.
  if (parcours === "preteur") {
    content = sectionRecueil(/contrat actuel/i);
  }

  // Étape 6 — Simulations : produits notés, prix saisis, classement.
  // Toujours affichée : sans droit d'édition, le comparatif reste consultable.
  if (parcours === "simulations") {
    content = (
      <DossierDevisPanel
        dossierId={dossierId}
        branche={dossier.type_assurance}
        userId={userId}
        onChanged={onChanged}
      />
    );
  }

  // Étape 7 — Devoir de conseil : le seul endroit où ce composant s'affiche.
  if (parcours === "devoir_conseil") {
    content = canEdit ? (
      <>
        <DevoirConseilRefusAnalysePanel
          dossierId={dossierId}
          userId={userId}
          onContreProposition={onContreProposition}
          onChanged={onChanged}
        />
        <DevoirConseilPanel
          dossierId={dossierId}
          clientEmail={dossier.client_email}
          branche={dossier.type_assurance}
          onChanged={onChanged}
          contreProposition={contreProposition}
        />
      </>
    ) : (
      <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-ink-muted">
        Devoir de conseil indisponible : le dossier est gelé tant que la conformité du client est
        insuffisante.
      </p>
    );
  }

  // Étape 8 — Informations adhésion : pièces d'adhésion par assuré.
  if (parcours === "adhesion") {
    content = <>{pieces}</>;
  }

  // Étape 9 — Substitution : demande auprès de la banque et du contrat résilié.
  if (parcours === "substitution") {
    content = (
      <>
        <div className="rounded-2xl border border-line bg-surface-elevated p-5">
          <h3 className="font-serif text-lg font-medium text-ink">Demande de substitution</h3>
          <p className="mt-2 text-sm text-ink-soft">
            Demande adressée à la banque prêteuse et au contrat à résilier, à la date d'effet
            retenue. Déposez ici les courriers et accusés liés à la substitution.
          </p>
        </div>
        <DocumentsPretPanel
          dossierId={dossierId}
          titre="Courriers de substitution"
          filtre="assureur"
          typeDocument="substitution"
        />
      </>
    );
  }

  // Étape 10 — Souscription : transmission à la compagnie et relances.
  if (parcours === "souscription") {
    content = <>{souscription}</>;
  }



  // Étape 5 du parcours emprunteur : lettre de mission, objectif fixe rappelé.
  if (parcours === "lettre_mission") {
    content = (
      <>
        <div className="rounded-2xl border border-line bg-surface-elevated p-5">
          <h3 className="font-serif text-lg font-medium text-ink">Objectif de la mission</h3>
          <p className="mt-2 text-sm text-ink-soft">
            Faire des économies en conservant l'équivalence des garanties. La lettre de mission est
            générée à partir des informations du client et du prêt déjà enregistrées, puis envoyée
            au client pour signature.
          </p>
        </div>
        {canEdit && (
          <LettreMissionPanel dossierId={dossierId} clientEmail={dossier.client_email} />
        )}
        {documents}
      </>
    );
  }

  // Étape 11 du parcours emprunteur : documents reçus de l'assureur.
  if (parcours === "analyse") {
    content = (
      <>
        {souscription}
        <div className="rounded-2xl border border-line bg-surface-elevated p-5">
          <h3 className="font-serif text-lg font-medium text-ink">
            Documents reçus de l'assureur
          </h3>
          <p className="mt-2 text-sm text-ink-soft">
            Déposez ici le devis final, la lettre de mission signée et le devoir de conseil signé
            reçus de la compagnie : chaque document est classé et rattaché au dossier.
          </p>
        </div>
        <DocumentsPretPanel
          dossierId={dossierId}
          titre="Devis final, lettre de mission signée, devoir de conseil signé"
          filtre="assureur"
          typeDocument="document_assureur"
        />
        <DossierReferencesExternesPanel dossierId={dossierId} />
        <DossierTachesPanel dossierId={dossierId} />

        {pieces}
        {documents}
      </>
    );
  }

  const titreEtape = parcours
    ? `${parcoursEtape(parcours)?.numero}. ${parcoursEtape(parcours)?.label}`
    : etapeLabel(step);

  return (
    <section className="space-y-6" aria-label={`Contenu de l'étape ${titreEtape}`}>
      <div className="flex items-center justify-between border-b border-line pb-3">
        <h2 className="font-serif text-xl font-medium text-ink">{titreEtape}</h2>
        {!parcours && step !== dossier.statut && (
          <span className="text-xs text-ink-muted">Étape précédente</span>
        )}
      </div>
      {/* Une étape = une vue : l'analyse IA transverse et le copilote ne
          s'affichent que hors parcours (vue réglementaire classique). */}
      {!parcours && canEdit && (
        <AnalyseRecueilPanel
          dossierId={dossierId}
          analyseInitiale={(dossier.analyse_ia ?? null) as never}
          analyseLe={dossier.analyse_ia_le}
          onAnalyse={onChanged}
        />
      )}
      {canEdit && dossier.type_assurance === "epargne_retraite" && (
        <EtudeEpargnePanel dossierId={dossierId} />
      )}
      {!parcours && canEdit && <CopilotePanel dossierId={dossierId} />}
      {content}


    </section>
  );
}

function PiecesSection({
  dossierId,
  clientEmail,
  canValidate,
}: {
  dossierId: string;
  clientEmail: string | null;
  canValidate: boolean;
}) {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: piece } = await supabase
        .from("dossier_pieces_requises")
        .select("client_id")
        .eq("dossier_id", dossierId)
        .not("client_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (piece?.client_id) {
        setClientId(piece.client_id);
        return;
      }
      if (clientEmail) {
        const { data: c } = await supabase
          .from("clients")
          .select("id")
          .eq("email", clientEmail)
          .maybeSingle();
        setClientId(c?.id ?? null);
      }
    })();
  }, [dossierId, clientEmail]);

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <DossierPiecesPanel dossierId={dossierId} clientId={clientId} canValidate={canValidate} />
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className="scroll-mt-6 rounded-2xl border border-line bg-surface-elevated p-5 transition-all"
    >
      <h2 className="font-serif text-lg font-medium text-ink">{title}</h2>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{children}</span>
    </div>
  );
}

type Msg = { id: string; auteur_id: string; contenu: string; created_at: string };

function MessagesPanel({ dossierId, userId }: { dossierId: string; userId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("messages")
      .select("id,auteur_id,contenu,created_at")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: true });
    setMsgs(data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`msgs-${dossierId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `dossier_id=eq.${dossierId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [dossierId]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      dossier_id: dossierId,
      auteur_id: userId,
      contenu: text.trim(),
    });
    setSending(false);
    if (!error) setText("");
  };

  return (
    <Section title="Messagerie">
      <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
        {msgs.length === 0 && <p className="text-ink-muted">Aucun message.</p>}
        {msgs.map((m) => {
          const mine = m.auteur_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  "max-w-[80%] rounded-2xl px-4 py-2 text-sm " +
                  (mine ? "bg-ink text-primary-foreground" : "bg-surface text-ink")
                }
              >
                <p className="whitespace-pre-wrap">{m.contenu}</p>
                <p
                  className={
                    "mt-1 text-[10px] " + (mine ? "text-primary-foreground/70" : "text-ink-muted")
                  }
                >
                  {new Date(m.created_at).toLocaleString("fr-FR")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écrire un message…"
          className="flex-1 rounded-full border border-line bg-background px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
    </Section>
  );
}

type Doc = {
  id: string;
  file_name: string;
  file_size: number | null;
  storage_path: string;
  created_at: string;
  uploader_id: string;
};

function DocumentsPanel({ dossierId, userId }: { dossierId: string; userId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const traiterDocument = useServerFn(traiterDocumentDepose);

  const load = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id,file_name,file_size,storage_path,created_at,uploader_id")
      .eq("dossier_id", dossierId)
      .is("archive_le", null)
      .order("created_at", { ascending: false });
    setDocs(data ?? []);
  };

  useEffect(() => {
    load();
  }, [dossierId]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const path = `${dossierId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("dossier-documents").upload(path, file);
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { data: cree, error: dbErr } = await supabase
      .from("documents")
      .insert({
        dossier_id: dossierId,
        uploader_id: userId,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
      })
      .select("id")
      .maybeSingle();
    if (dbErr) {
      setUploading(false);
      setError(dbErr.message);
      return;
    }
    // Analyse IA du document déposé : classification, extraction puis
    // exploitation métier (recueil emprunteur ou étude épargne).
    if (cree?.id) {
      try {
        await traiterDocument({ data: { document_id: cree.id } });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Analyse du document indisponible");
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  const download = async (path: string, name: string) => {
    const { data, error } = await supabase.storage
      .from("dossier-documents")
      .createSignedUrl(path, 60);
    if (error || !data) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  };

  const remove = async (doc: Doc) => {
    await supabase.storage.from("dossier-documents").remove([doc.storage_path]);
    await supabase.from("documents").update({ archive_le: new Date().toISOString() }).eq("id", doc.id);
    load();
  };

  return (
    <Section title="Documents">
      <div className="flex items-center gap-3">
        <label className="cursor-pointer rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground">
          {uploading ? "Envoi…" : "Ajouter un document"}
          <input
            ref={fileRef}
            type="file"
            onChange={onUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      <ul className="mt-4 space-y-2">
        {docs.length === 0 && <li className="text-ink-muted">Aucun document.</li>}
        {docs.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between rounded-md border border-line bg-background px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{d.file_name}</p>
              <p className="text-xs text-ink-muted">
                {d.file_size ? `${(d.file_size / 1024).toFixed(0)} Ko · ` : ""}
                {new Date(d.created_at).toLocaleDateString("fr-FR")}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => download(d.storage_path, d.file_name)}
                className="rounded-full border border-line px-3 py-1 text-xs hover:bg-surface"
              >
                Télécharger
              </button>
              {d.uploader_id === userId && (
                <button
                  onClick={() => remove(d)}
                  className="rounded-full border border-line px-3 py-1 text-xs text-destructive hover:bg-surface"
                >
                  Supprimer
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function BrancheLegacyBanner({
  dossierId,
  canEdit,
  onReclassified,
}: {
  dossierId: string;
  canEdit: boolean;
  onReclassified: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reclassifier = async (type: "sante" | "prevoyance") => {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("dossiers")
      .update({ type_assurance: type })
      .eq("id", dossierId);
    if (error) setError(error.message);
    else onReclassified();
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <p className="font-serif text-base text-amber-950">
        Ancienne branche combinée — à reclassifier en Santé ou Prévoyance avant de poursuivre le
        recueil ou le devoir de conseil
      </p>
      <p className="mt-1 text-sm text-amber-900">
        Le recueil déjà saisi est conservé tel quel : il restera lisible après reclassification et
        pourra être complété par le staff dans le nouveau recueil dédié.
      </p>
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => reclassifier("sante")}
            disabled={busy}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Reclassifier en Complémentaire santé
          </button>
          <button
            onClick={() => reclassifier("prevoyance")}
            disabled={busy}
            className="rounded-full border border-amber-400 px-4 py-2 text-sm font-medium text-amber-950 disabled:opacity-50"
          >
            Reclassifier en Prévoyance
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function RecueilPanel({ dossier }: { dossier: Dossier }) {
  const branche = getBranche(dossier.type_assurance);
  const r = dossier.recueil_besoins ?? {};
  if (!branche) return null;
  return (
    <Section id="section-recueil" title={`Recueil des besoins — ${branche.label}`}>
      {branche.sections.map((s) => {
        const rows = s.fields
          .map((f) => {
            const v = (r as Record<string, unknown>)[f.key];
            if (v === undefined || v === null || v === "" || v === false) return null;
            if (f.type === "assures_emprunteur") {
              const list = assuresEmprunteur(v);
              if (list.length === 0) return null;
              return (
                <div key={f.key} className="border-b border-line py-1 text-sm">
                  <span className="text-ink-muted">{f.label}</span>
                  <ul className="mt-1 space-y-0.5">
                    {list.map((p, i) => {
                      const lien =
                        LIENS_EMPRUNTEUR.find((l) => l.value === p.lien)?.label ?? "Assuré";
                      const age = ageDepuisDateNaissance(p.date_naissance);
                      const csp = CSP_EMPRUNTEUR.find((c) => c.value === p.csp)?.label;
                      return (
                        <li key={i} className="font-medium">
                          {[
                            lien,
                            age !== null ? `${age} ans` : null,
                            p.quotite_pct != null ? `quotité ${p.quotite_pct} %` : null,
                            csp,
                            p.fumeur ? "fumeur" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            }
            if (f.type === "personnes") {
              const list = personnesAssurees(v);
              if (list.length === 0) return null;
              return (
                <div key={f.key} className="border-b border-line py-1 text-sm">
                  <span className="text-ink-muted">{f.label}</span>
                  <ul className="mt-1 space-y-0.5">
                    {list.map((p, i) => {
                      const lien = LIENS_ASSURE.find((l) => l.value === p.lien)?.label ?? "Assuré";
                      const age = ageDepuisDateNaissance(p.date_naissance);
                      const regime = REGIMES_OBLIGATOIRES.find(
                        (rg) => rg.value === p.regime,
                      )?.label;
                      return (
                        <li key={i} className="font-medium">
                          {[lien, age !== null ? `${age} ans` : null, regime]
                            .filter(Boolean)
                            .join(" · ")}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            }
            const val =
              typeof v === "boolean"
                ? "Oui"
                : (f.options?.find((o) => o.value === v)?.label ?? String(v));

            return (
              <div
                key={f.key}
                className="flex justify-between gap-4 border-b border-line py-1 text-sm"
              >
                <span className="text-ink-muted">{f.label}</span>
                <span className="text-right font-medium">{val}</span>
              </div>
            );
          })
          .filter(Boolean);
        if (rows.length === 0) return null;
        return (
          <div key={s.title} className="mt-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">{s.title}</p>
            <div className="mt-1">{rows}</div>
          </div>
        );
      })}
    </Section>
  );
}

type LettreRow = {
  id: string;
  statut: string;
  envoye_le: string | null;
  signed_at: string | null;
  email_destinataire: string | null;
};

function LettreMissionPanel({
  dossierId,
  clientEmail,
}: {
  dossierId: string;
  clientEmail: string | null;
}) {
  const envoyer = useServerFn(creerEtEnvoyerLettreMission);
  const [lettre, setLettre] = useState<LettreRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("lettres_mission")
      .select("id, statut, envoye_le, signed_at, email_destinataire")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLettre((data as LettreRow | null) ?? null);
  };

  useEffect(() => {
    load();
  }, [dossierId]);

  const onSend = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await envoyer({ data: { dossier_id: dossierId } });
      setMsg("Lettre de mission envoyée au client.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    }
    setBusy(false);
  };

  const badge =
    lettre?.statut === "signee"
      ? "bg-emerald-100 text-emerald-900"
      : lettre?.statut === "envoyee"
        ? "bg-amber-100 text-amber-900"
        : "bg-surface text-ink-soft";

  return (
    <Section title="Lettre de mission">
      {lettre ? (
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>
              {lettre.statut === "signee"
                ? "Signée"
                : lettre.statut === "envoyee"
                  ? "Envoyée · en attente de signature"
                  : lettre.statut}
            </span>
          </div>
          {lettre.envoye_le && (
            <p className="text-xs text-ink-muted">
              Envoyée le {new Date(lettre.envoye_le).toLocaleString("fr-FR")} à{" "}
              {lettre.email_destinataire}
            </p>
          )}
          {lettre.signed_at && (
            <p className="text-xs text-emerald-800">
              Signée le {new Date(lettre.signed_at).toLocaleString("fr-FR")}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Aucune lettre de mission générée pour ce dossier.</p>
      )}

      {lettre?.statut !== "signee" && (
        <div className="mt-3">
          <button
            onClick={onSend}
            disabled={busy || !clientEmail}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {busy
              ? "Envoi…"
              : lettre
                ? "Renvoyer la lettre de mission"
                : "Générer et envoyer la lettre de mission"}
          </button>
          {!clientEmail && (
            <p className="mt-2 text-xs text-destructive">
              Renseignez un email client pour pouvoir envoyer.
            </p>
          )}
          {msg && <p className="mt-2 text-xs text-ink-muted">{msg}</p>}
        </div>
      )}
    </Section>
  );
}
