import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SignaturePad } from "@/components/signature-pad";
import {
  monContratAttente,
  signerContratMandataire,
} from "@/lib/mandataire-contrat.functions";
import { sectionsContratMandataire, type ContratMandataireVariables } from "@/lib/mandataire-contrat-modele";
import { PageHeader } from "@/components/page-header";
import { IconFileDescription } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/espace/signer-contrat-mandataire")({
  component: SignerContratMandataire,
});

function SignerContratMandataire() {
  const navigate = useNavigate();
  const charger = useServerFn(monContratAttente);
  const signer = useServerFn(signerContratMandataire);

  const [contrat, setContrat] = useState<Awaited<ReturnType<typeof monContratAttente>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepte, setAccepte] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void charger().then((c) => {
      setContrat(c);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!contrat || !accepte || !signature) return;
    setSubmitting(true);
    setError(null);
    try {
      await signer({ data: { contrat_id: contrat.id, signature_png: signature } });
      navigate({ to: "/espace/mon-espace-mandataire" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setSubmitting(false);
    }
  };

  if (loading) return <p className="p-6 text-sm text-ink-muted">Chargement…</p>;

  if (!contrat) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="font-serif text-2xl">Aucun contrat à signer</h1>
        <p className="mt-2 text-sm text-ink-muted">Vous n'avez aucun contrat mandataire en attente.</p>
      </div>
    );
  }

  if (contrat.statut === "signe") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="font-serif text-2xl">Contrat déjà signé</h1>
        <p className="mt-2 text-sm text-ink-muted">Référence : {contrat.reference}</p>
      </div>
    );
  }

  const sections = sectionsContratMandataire(contrat.contenu as unknown as ContratMandataireVariables);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        eyebrow={`Référence ${contrat.reference}`}
        title="Votre contrat de mandataire"
        description="Merci de le lire attentivement avant de signer."
        icon={IconFileDescription}
      />

      <div className="crm-card space-y-5 p-6">
        {sections.map((s) => (
          <div key={s.titre}>
            <p className="text-sm font-semibold text-ink">{s.titre}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.texte}</p>
          </div>
        ))}
      </div>

      <div className="crm-card space-y-4 p-6">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} className="mt-1" />
          <span>J'ai lu et j'accepte les termes du présent contrat.</span>
        </label>
        <SignaturePad onChange={setSignature} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!accepte || !signature || submitting}
          className="rounded-full bg-[#0A192F] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Envoi…" : "Signer le contrat"}
        </button>
      </div>
    </div>
  );
}
