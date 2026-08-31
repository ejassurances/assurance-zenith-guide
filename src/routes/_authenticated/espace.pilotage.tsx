/**
 * D8 — Pilotage & reporting : vision direction consolidée (lecture seule).
 * Les chiffres proviennent des mêmes lectures que les pages métier (file OAV,
 * portefeuille de contrats, synthèse des commissions, pilotage des délais).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  IconChartHistogram,
  IconCoins,
  IconFileCheck,
  IconShieldCheck,
  IconFileText,
} from "@tabler/icons-react";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { supabase } from "@/integrations/supabase/client";
import { fileSouscriptionFn } from "@/lib/souscription-file.functions";
import { portefeuilleContratsFn } from "@/lib/portefeuille-contrats.functions";
import { getSyntheseAnneeCommissions } from "@/lib/dashboard.functions";
import {
  pilotageDelais,
  type Gravite,
  type PieceDelai,
  type ReclamationDelai,
  type SinistreDelai,
} from "@/lib/delais-pilotage";
import { visionDirection, type VisionDirection } from "@/lib/pilotage-consolide";

export const Route = createFileRoute("/_authenticated/espace/pilotage")({
  head: () => ({
    meta: [
      { title: "Vision direction — EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Tableau de pilotage consolidé du cabinet : production, portefeuille, commissions et délais réglementaires.",
      },
      { property: "og:title", content: "Vision direction — EJ Partners Assurances" },
      {
        property: "og:description",
        content: "Production, portefeuille, finance et conformité réunis dans une seule vue de pilotage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pilotage,
});

const euros = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function Bloc({
  titre,
  description,
  lien,
  lienLabel,
  children,
}: {
  titre: string;
  description: string;
  lien: string;
  lienLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-ink">{titre}</h2>
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        </div>
        <Link
          to={lien}
          className="text-[10px] font-bold uppercase tracking-widest text-ink-muted hover:text-ink"
        >
          {lienLabel} →
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function Pilotage() {
  const chargerFile = useServerFn(fileSouscriptionFn);
  const chargerPortefeuille = useServerFn(portefeuilleContratsFn);
  const chargerSynthese = useServerFn(getSyntheseAnneeCommissions);
  const [vision, setVision] = useState<VisionDirection | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [file, portefeuille, synthese, rec, sin, pie] = await Promise.all([
          chargerFile({ data: { limite: 200 } }),
          chargerPortefeuille({ data: { limite: 300 } }),
          chargerSynthese(),
          supabase
            .from("reclamations")
            .select("id, reference, statut, date_ouverture, date_accuse_reception, date_cloture")
            .limit(500),
          supabase
            .from("sinistres")
            .select("id, reference, statut, etape, declare_le, declare_compagnie_le, updated_at, clos_le")
            .limit(500),
          supabase
            .from("sinistre_pieces")
            .select("sinistre_id, libelle, obligatoire, statut")
            .limit(2000),
        ]);
        let delais: Record<Gravite, number> | null = null;
        if (!rec.error && !sin.error && !pie.error) {
          delais = pilotageDelais({
            reclamations: (rec.data ?? []) as ReclamationDelai[],
            sinistres: (sin.data ?? []) as SinistreDelai[],
            pieces: (pie.data ?? []) as PieceDelai[],
          }).compteurs;
        }
        setVision(
          visionDirection({
            file: file.lignes,
            portefeuille: portefeuille.agregats,
            synthese,
            delais,
          }),
        );
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Chargement impossible");
      }
    })();
  }, [chargerFile, chargerPortefeuille, chargerSynthese]);

  return (
    <div className="space-y-2">
      <PageHeader
        eyebrow="Pilotage & reporting"
        title="Vision direction"
        description="Production, portefeuille, finance et conformité consolidés à partir des mêmes données que les pages métier."
        icon={IconChartHistogram}
      />

      {erreur ? (
        <p className="mt-6 text-sm text-red-600">{erreur}</p>
      ) : !vision ? (
        <p className="mt-6 text-sm text-ink-muted">Consolidation des indicateurs…</p>
      ) : (
        <>
          <Bloc
            titre="Production & transformation"
            description="Dossiers de souscription en cours, prêts à transmettre ou en attente de retour compagnie."
            lien="/espace/dossiers"
            lienLabel="Ouvrir la file OAV"
          >
            <StatCard label="Dossiers en file" value={vision.production.enFile} icon={IconFileText} />
            <StatCard
              label="Prêts à transmettre"
              value={vision.production.prets}
              sub={`${vision.production.tauxPrets} % de la file`}
              accent
              icon={IconFileCheck}
            />
            <StatCard label="Bloqués" value={vision.production.bloques} />
            <StatCard label="Transmis" value={vision.production.transmis} />
          </Bloc>

          <Bloc
            titre="Portefeuille"
            description="Contrats vivants, échéances à anticiper et suivis périodiques à réaliser."
            lien="/espace/contrats"
            lienLabel="Ouvrir le portefeuille"
          >
            <StatCard
              label="Contrats en portefeuille"
              value={vision.portefeuille.contrats}
              sub={`Prime moyenne ${euros(vision.portefeuille.primeMoyenne)}`}
              icon={IconFileText}
            />
            <StatCard
              label="Primes annuelles"
              value={euros(vision.portefeuille.primeAnnuelle)}
              accent
              icon={IconCoins}
            />
            <StatCard label="Échéances ≤ 60 jours" value={vision.portefeuille.echeancesProches} />
            <StatCard
              label="Suivis à faire"
              value={vision.portefeuille.suivisDus}
              sub={`${vision.portefeuille.suivisNonPlanifies} sans suivi planifié`}
            />
          </Bloc>

          <Bloc
            titre="Finance"
            description="Commissions réellement encaissées et prévisionnel restant sur l'année civile."
            lien="/espace/commissions"
            lienLabel="Ouvrir les commissions"
          >
            <StatCard
              label={`Encaissé ${vision.finance.annee}`}
              value={euros(vision.finance.encaisse)}
              sub={`${vision.finance.tauxRealisation} % du total attendu`}
              accent
              icon={IconCoins}
            />
            <StatCard label="Reste à encaisser" value={euros(vision.finance.previsionnelRestant)} />
            <StatCard label="Total attendu" value={euros(vision.finance.totalAttendu)} />
            <StatCard label="Exercice" value={vision.finance.annee} />
          </Bloc>

          <Bloc
            titre="Conformité & délais"
            description="Alertes de délais réglementaires sur les réclamations, sinistres et pièces obligatoires."
            lien="/espace/sinistres"
            lienLabel="Ouvrir le pilotage des délais"
          >
            <StatCard
              label="Hors délai"
              value={vision.conformite.critique}
              accent
              icon={IconShieldCheck}
            />
            <StatCard label="Échéance proche" value={vision.conformite.alerte} />
            <StatCard label="À surveiller" value={vision.conformite.vigilance} />
            <StatCard label="Total des alertes" value={vision.conformite.total} />
          </Bloc>
        </>
      )}
    </div>
  );
}
