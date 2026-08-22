import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SignaturePad } from "@/components/signature-pad";
import { signerDer } from "@/lib/der-sign.functions";
import { monDerCourant } from "@/lib/espace-client.functions";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { IconFileCertificate } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/espace/signer-der")({
  component: SignerDER,
});

type Envoi = {
  id: string;
  statut: string;
  signed_at: string | null;
  signed_ip: string | null;
  signature_png: string | null;
  document_hash: string | null;
  modele_nom: string | null;
  modele_version: string | null;
  url: string | null;
};

function SignerDER() {
  const navigate = useNavigate();
  const sign = useServerFn(signerDer);
  const charger = useServerFn(monDerCourant);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepte, setAccepte] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await charger({ data: undefined });
        setEnvoi((res.envoi as Envoi | null) ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur de chargement");
      }
      setLoading(false);
    })();
  }, []);

  const submit = async () => {
    if (!envoi || !accepte || !signature) return;
    setSubmitting(true);
    setError(null);
    try {
      await sign({ data: { envoi_id: envoi.id, signature_png: signature } });
      navigate({ to: "/espace" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setSubmitting(false);
    }
  };

  if (loading) return <p className="p-6 text-sm text-ink-muted">Chargement…</p>;

  if (!envoi) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="font-serif text-2xl">Aucun DER disponible</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Aucun Document d'Entrée en Relation n'est encore rattaché à votre dossier. Votre conseiller
          vous l'adressera prochainement.
        </p>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  const signe = envoi.statut === "signe" || !!envoi.signed_at;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        eyebrow="Document réglementaire"
        title={signe ? "Votre DER signé" : "Signature de votre DER"}
        description={`Document d'Entrée en Relation — ${SITE.name}${envoi.modele_version ? ` · v${envoi.modele_version}` : ""}`}
        icon={IconFileCertificate}
      />

      {envoi.url ? (
        <div className="overflow-hidden rounded-2xl border border-line">
          <iframe title="DER" src={envoi.url} className="h-[520px] w-full" />
        </div>
      ) : (
        <p className="rounded-2xl border border-line bg-surface-elevated p-5 text-sm text-amber-800">
          Le document n'est pas disponible en ligne pour le moment. Contactez votre conseiller.
        </p>
      )}

      {signe ? (
        <div className="space-y-3 rounded-2xl border border-line bg-surface-elevated p-5">
          <p className="text-sm text-ink">
            Ce document a été signé électroniquement — aucune action n'est requise de votre part.
          </p>
          <div className="flex flex-wrap items-start gap-4">
            {envoi.signature_png && (
              <img
                src={envoi.signature_png}
                alt="Votre signature"
                className="h-16 rounded border border-line bg-white"
              />
            )}
            <div className="text-xs text-ink-muted">
              <div>
                Signé le{" "}
                {envoi.signed_at ? new Date(envoi.signed_at).toLocaleString("fr-FR") : "—"}
              </div>
              <div>Adresse IP : {envoi.signed_ip ?? "—"}</div>
              {envoi.document_hash && (
                <div className="font-mono text-[10px]">
                  Empreinte : {envoi.document_hash.slice(0, 32)}…
                </div>
              )}
            </div>
          </div>
          {envoi.url && (
            <a
              href={envoi.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface"
            >
              Télécharger le document
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-line bg-surface-elevated p-5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={accepte}
              onChange={(e) => setAccepte(e.target.checked)}
              className="mt-1"
            />
            <span>
              Je reconnais avoir pris connaissance du Document d'Entrée en Relation du cabinet{" "}
              {SITE.shortName} (statut, ORIAS, compagnies partenaires, modalités de rémunération et de
              traitement des réclamations) et j'en accepte les termes.
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
            Signature électronique simple au sens du règlement eIDAS (art. 25). Nous enregistrons la
            date, l'heure, votre adresse IP et l'empreinte du document signé.
          </p>
        </div>
      )}
    </div>
  );
}
