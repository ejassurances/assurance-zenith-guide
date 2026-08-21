import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SignaturePad } from "@/components/signature-pad";
import { signerDer } from "@/lib/der-sign.functions";
import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { IconFileCertificate } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/espace/signer-der")({
  component: SignerDER,
});

type Envoi = {
  id: string;
  client_id: string;
  statut: string;
  signed_at: string | null;
  der_modele_id: string | null;
  der_modele: { nom: string; version: string; storage_path: string } | null;
};

function SignerDER() {
  const navigate = useNavigate();
  const sign = useServerFn(signerDer);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepte, setAccepte] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("client_der_envois")
        .select("id, client_id, statut, signed_at, der_modele_id, der_modele:der_modele_id(nom,version,storage_path)")
        .neq("statut", "signe")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const e = data as unknown as Envoi | null;
      setEnvoi(e);
      if (e?.der_modele?.storage_path) {
        const { data: url } = await supabase.storage
          .from("conformite-documents")
          .createSignedUrl(e.der_modele.storage_path, 3600);
        setPdfUrl(url?.signedUrl ?? null);
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
        <h1 className="font-serif text-2xl">Aucun DER à signer</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Vous n'avez aucun Document d'Entrée en Relation en attente de signature.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        eyebrow="Document réglementaire"
        title="Signature de votre DER"
        description={`Document d'Entrée en Relation — ${SITE.name}${envoi.der_modele ? ` · v${envoi.der_modele.version}` : ""}`}
        icon={IconFileCertificate}
      />

      {pdfUrl && (
        <div className="overflow-hidden rounded-2xl border border-line">
          <iframe title="DER" src={pdfUrl} className="h-[520px] w-full" />
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface-elevated p-5 space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={accepte}
            onChange={(e) => setAccepte(e.target.checked)}
            className="mt-1"
          />
          <span>
            Je reconnais avoir pris connaissance du Document d'Entrée en Relation du cabinet {SITE.shortName}
            {" "}(statut, ORIAS, compagnies partenaires, modalités de rémunération et de traitement des réclamations)
            et j'en accepte les termes.
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
          Nous enregistrons la date, l'heure, votre adresse IP et l'empreinte du document signé.
        </p>
      </div>
    </div>
  );
}
