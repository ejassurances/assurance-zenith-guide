import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { SignaturePad } from "@/components/signature-pad";
import { supabase } from "@/integrations/supabase/client";
import {
  souscriptionDocumentsAsigner,
  souscriptionSignerParClient,
} from "@/lib/neoliane-signature-client.functions";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { IconWritingSign } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/espace/signer-souscription")({
  component: SignerSouscription,
  head: () => ({
    meta: [
      { title: "Signer mes documents de souscription — EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Espace client sécurisé : consultez et signez électroniquement votre bulletin d'adhésion et votre mandat de prélèvement.",
      },
      { property: "og:title", content: "Signer mes documents de souscription" },
      {
        property: "og:description",
        content: "Signature électronique de votre bulletin d'adhésion et de votre mandat SEPA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Parcours = {
  id: string;
  product_type: string;
  signature_client_statut: string;
  signature_erreur: string | null;
};

type Doc = {
  contractId: string;
  cle: string;
  libelle: string;
  pdf_base64: string;
  signataires: string[];
};

const LABEL_MEMBRE: Record<string, string> = {
  holder: "Titulaire",
  spouse: "Conjoint",
};

function SignerSouscription() {
  const navigate = useNavigate();
  const chargerDocs = useServerFn(souscriptionDocumentsAsigner);
  const signer = useServerFn(souscriptionSignerParClient);

  const [parcours, setParcours] = useState<Parcours | null>(null);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [signataire, setSignataire] = useState("");
  const [paraphes, setParaphes] = useState<Record<string, string>>({});
  const [accepte, setAccepte] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("neoliane_parcours")
        .select("id, product_type, signature_client_statut, signature_erreur")
        .in("signature_client_statut", ["demandee", "echec_depot"])
        .order("signature_demandee_le", { ascending: false })
        .limit(1)
        .maybeSingle();
      const p = (data as Parcours | null) ?? null;
      setParcours(p);
      if (p) {
        try {
          const res = await chargerDocs({ data: { parcours_id: p.id } });
          setDocuments((res.documents ?? []) as Doc[]);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Documents indisponibles");
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const membres = Array.from(new Set(documents.flatMap((d) => d.signataires)));

  const ouvrirPdf = (doc: Doc) => {
    const octets = Uint8Array.from(atob(doc.pdf_base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([octets], { type: "application/pdf" }));
    window.open(url, "_blank");
  };

  const soumettre = async () => {
    if (!parcours || !accepte || signataire.trim().length < 2) return;
    if (!paraphes["holder"] && Object.keys(paraphes).length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await signer({
        data: { parcours_id: parcours.id, signataire: signataire.trim(), paraphes },
      });
      navigate({ to: "/espace/mon-espace" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setSubmitting(false);
    }
  };

  if (loading) return <p className="p-6 text-sm text-ink-muted">Chargement…</p>;

  if (!parcours) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="font-serif text-2xl">Aucun document de souscription à signer</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Vous n'avez aucun bulletin d'adhésion en attente de signature.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        eyebrow="Souscription"
        title="Signature de votre souscription"
        description={`${SITE.shortName} · ORIAS ${SITE.orias} — signez votre bulletin d'adhésion et votre mandat de prélèvement pour finaliser votre contrat.`}
        icon={IconWritingSign}
      />

      {parcours.signature_client_statut === "echec_depot" && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          Une précédente tentative de transmission à l'assureur n'a pas abouti. Notre équipe a été
          alertée ; vous pouvez signer à nouveau si vous le souhaitez.
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface-elevated p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Documents à signer
        </h2>
        {documents.length === 0 ? (
          <p className="text-sm text-ink-muted">Documents en cours de préparation.</p>
        ) : (
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={`${d.contractId}-${d.cle}`} className="flex items-center justify-between gap-3">
                <span className="text-sm">{d.libelle}</span>
                <button
                  onClick={() => ouvrirPdf(d)}
                  className="rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface"
                >
                  Lire le document (PDF)
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface-elevated p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Votre signature
        </h2>
        <label className="mb-3 block text-xs font-medium text-ink-muted">
          Nom et prénom du signataire
          <input
            value={signataire}
            onChange={(e) => setSignataire(e.target.value)}
            placeholder="Jean Dupont"
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          {(membres.length > 0 ? membres : ["holder"]).map((membre) => (
            <div key={membre}>
              <p className="mb-1 text-xs text-ink-muted">
                Signature {LABEL_MEMBRE[membre] ?? membre}
              </p>
              <SignaturePad
                height={140}
                onChange={(url) =>
                  setParaphes((prev) => {
                    const suivant = { ...prev };
                    if (url) suivant[membre] = url;
                    else delete suivant[membre];
                    return suivant;
                  })
                }
              />
            </div>
          ))}
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={accepte}
            onChange={(e) => setAccepte(e.target.checked)}
            className="mt-1"
          />
          <span>
            J'ai lu les documents ci-dessus et j'appose ma signature électronique. J'accepte que la
            date, l'heure et mon adresse IP soient conservées comme preuve de signature.
          </span>
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          disabled={
            submitting || !accepte || signataire.trim().length < 2 || Object.keys(paraphes).length === 0
          }
          onClick={soumettre}
          className="mt-4 rounded-full bg-[#D4AF37] px-6 py-2 text-sm font-semibold text-[#0A192F] transition-colors hover:bg-[#c8a233] disabled:opacity-50"
        >
          {submitting ? "Signature en cours…" : "Signer et transmettre à l'assureur"}
        </button>
      </section>
    </div>
  );
}
