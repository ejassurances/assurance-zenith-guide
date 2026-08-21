import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SignaturePad } from "@/components/signature-pad";
import { signerLettreMission } from "@/lib/lettres-mission.functions";
import { maLettreMissionUrl } from "@/lib/espace-client.functions";
import { ouvrirPdf } from "@/lib/ouvrir-pdf";
import { labelForBranche, getBranche } from "@/lib/recueil-besoins-schemas";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { IconFileDescription } from "@tabler/icons-react";


export const Route = createFileRoute("/_authenticated/espace/signer-lettre-mission")({
  component: SignerLettreMission,
});

type Lettre = {
  id: string;
  statut: string;
  type_assurance: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contenu: any;
  signed_at: string | null;
};

function SignerLettreMission() {
  const navigate = useNavigate();
  const sign = useServerFn(signerLettreMission);
  const getPdf = useServerFn(maLettreMissionUrl);

  const [lettre, setLettre] = useState<Lettre | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepte, setAccepte] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lettres_mission")
        .select("id, statut, type_assurance, contenu, signed_at")
        .neq("statut", "signee")
        .neq("statut", "annulee")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLettre((data as Lettre | null) ?? null);
      setLoading(false);
    })();
  }, []);

  const submit = async () => {
    if (!lettre || !accepte || !signature) return;
    setSubmitting(true);
    setError(null);
    try {
      await sign({ data: { lettre_id: lettre.id, signature_png: signature } });
      navigate({ to: "/espace" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setSubmitting(false);
    }
  };

  if (loading) return <p className="p-6 text-sm text-ink-muted">Chargement…</p>;

  if (!lettre) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="font-serif text-2xl">Aucune lettre de mission à signer</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Vous n'avez aucune lettre de mission en attente de signature.
        </p>
      </div>
    );
  }

  const branche = getBranche(lettre.type_assurance);
  const c = lettre.contenu ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        eyebrow="Document réglementaire"
        title="Lettre de mission"
        description={`${labelForBranche(lettre.type_assurance)} · Dossier ${c?.dossier?.reference ?? ""} · ${SITE.shortName}`}
        icon={IconFileDescription}
      />
      <div>
        <button
          onClick={async () => {
            setError(null);
            try {
              await ouvrirPdf(async () => (await getPdf({ data: { lettre_id: lettre.id } })).url);
            } catch (e) {
              setError(e instanceof Error ? e.message : "PDF indisponible");
            }
          }}
          className="mt-3 rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface"
        >
          Ouvrir / imprimer le PDF
        </button>
      </div>


      <div className="rounded-2xl border border-line bg-surface-elevated p-6 space-y-4 text-sm leading-relaxed">
        <p>
          Je soussigné(e) <strong>{c?.client?.nom}</strong>, donne mandat au cabinet{" "}
          <strong>{c?.cabinet?.nom}</strong> (SIRET {c?.cabinet?.siret}, ORIAS {c?.cabinet?.orias}),
          situé {c?.cabinet?.adresse}, en qualité de courtier en assurances, afin de :
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Analyser mes besoins en <strong>{labelForBranche(lettre.type_assurance).toLowerCase()}</strong>&nbsp;;</li>
          <li>Rechercher et présenter les solutions les plus adaptées auprès des compagnies partenaires&nbsp;;</li>
          <li>M'accompagner dans la souscription, le suivi et, le cas échéant, la gestion des sinistres.</li>
        </ul>

        <div>
          <p className="font-medium mt-4">Recueil des besoins</p>
          {branche?.sections.map((s) => {
            const rows = s.fields
              .map((f) => {
                const v = c?.recueil_besoins?.[f.key];
                if (v === undefined || v === null || v === "" || v === false) return null;
                const value = typeof v === "boolean" ? "Oui" : String(v);
                return (
                  <div key={f.key} className="flex justify-between gap-4 border-b border-line py-1">
                    <span className="text-ink-muted">{f.label}</span>
                    <span className="text-right font-medium">{value}</span>
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
        </div>

        <p className="text-xs text-ink-muted mt-4">
          La rémunération du courtier s'effectue par commission versée par la compagnie retenue, conformément au DER signé.
          Le présent mandat peut être révoqué à tout moment sur simple demande écrite.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface-elevated p-5 space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={accepte}
            onChange={(e) => setAccepte(e.target.checked)}
            className="mt-1"
          />
          <span>
            Je reconnais avoir pris connaissance des informations ci-dessus et confie au cabinet {SITE.shortName}{" "}
            la mission de recherche et d'accompagnement décrite dans la présente lettre de mission.
          </span>
        </label>

        <div>
          <div className="mb-2 text-sm font-medium">Votre signature</div>
          <SignaturePad onChange={setSignature} />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={!accepte || !signature || submitting}
            className="rounded-full bg-[#D4AF37] px-5 py-2 text-sm font-semibold text-[#0A192F] transition-colors hover:bg-[#c8a233] disabled:opacity-40"
          >
            {submitting ? "Signature en cours…" : "Signer électroniquement"}
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          Signature électronique simple au sens du règlement eIDAS (art. 25).
          Date, heure, adresse IP et empreinte du document sont conservées.
        </p>
      </div>
    </div>
  );
}
