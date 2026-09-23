import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { SignaturePad } from "@/components/signature-pad";
import { signerDevoirConseil, refuserDevoirConseil, pdfDevoirConseil } from "@/lib/devoir-conseil.functions";
import { signalerInteretAssuranceVie, signalerNonInteretAssuranceVie } from "@/lib/interet-assurance-vie.functions";
import { labelForBranche } from "@/lib/recueil-besoins-schemas";
import { STATUT_OFFRE_LABEL, type StatutOffre } from "@/lib/devoir-conseil-modeles";
import { COUVERTURE_LABEL, type Couverture } from "@/lib/garanties-grille";
import { ouvrirPdf } from "@/lib/ouvrir-pdf";


import { SITE } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { IconFileCheck } from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/espace/signer-devoir-conseil")({
  component: SignerDevoirConseil,
});

type Devoir = {
  id: string;
  statut: string;
  type_assurance: string;
  recommandation: string | null;
  motifs: string | null;
  mises_en_garde: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contenu: any;
};

function SignerDevoirConseil() {
  const navigate = useNavigate();
  const signer = useServerFn(signerDevoirConseil);
  const refuser = useServerFn(refuserDevoirConseil);
  const getPdf = useServerFn(pdfDevoirConseil);
  const [devoir, setDevoir] = useState<Devoir | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepte, setAccepte] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [echelonnementSouhaite, setEchelonnementSouhaite] = useState(false);
  const [echelonnementPopupOuvert, setEchelonnementPopupOuvert] = useState(false);
  const [echelonnementConfirme, setEchelonnementConfirme] = useState(false);
  const [motifRefus, setMotifRefus] = useState("");
  const [refusOpen, setRefusOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("devoirs_conseil")
        .select("id, statut, type_assurance, recommandation, motifs, mises_en_garde, contenu")
        .eq("statut", "envoye")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setDevoir((data as Devoir | null) ?? null);
      setLoading(false);
    })();
  }, []);

  const [afficherChoixVie, setAfficherChoixVie] = useState(false);
  const [choixVieEnCours, setChoixVieEnCours] = useState(false);
  const [choixVieFait, setChoixVieFait] = useState<"interesse" | "pas_interesse" | null>(null);
  const interesseVie = useServerFn(signalerInteretAssuranceVie);
  const nonInteresseVie = useServerFn(signalerNonInteretAssuranceVie);

  const submitSignature = async () => {
    if (!devoir || !accepte || !signature) return;
    if (echelonnementSouhaite && !echelonnementConfirme) {
      setEchelonnementPopupOuvert(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signer({
        data: { devoir_id: devoir.id, signature_png: signature, echelonnement_demande: echelonnementSouhaite },
      });
      if (devoir.type_assurance === "emprunteur") {
        setAfficherChoixVie(true);
        setSubmitting(false);
      } else {
        navigate({ to: "/espace/mon-espace" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setSubmitting(false);
    }
  };

  const choisirVie = async (interesse: boolean) => {
    if (!devoir) return;
    setChoixVieEnCours(true);
    try {
      if (interesse) {
        await interesseVie({ data: { devoir_id: devoir.id } });
        setChoixVieFait("interesse");
      } else {
        await nonInteresseVie({ data: { devoir_id: devoir.id } });
        setChoixVieFait("pas_interesse");
      }
    } finally {
      setChoixVieEnCours(false);
    }
  };

  const submitRefus = async () => {
    if (!devoir || motifRefus.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    try {
      await refuser({ data: { devoir_id: devoir.id, motif: motifRefus.trim() } });
      navigate({ to: "/espace/mon-espace" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setSubmitting(false);
    }
  };

  if (loading) return <p className="p-6 text-sm text-ink-muted">Chargement…</p>;

  if (!devoir) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="font-serif text-2xl">Aucun devoir de conseil à valider</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Vous n'avez aucun document de conseil en attente de réponse.
        </p>
      </div>
    );
  }

  const c = devoir.contenu ?? {};
  const conseil = c.conseil ?? {};

  if (afficherChoixVie) {
    if (choixVieFait) {
      return (
        <div className="mx-auto max-w-xl p-8 text-center">
          <p className="font-serif text-2xl font-medium text-ink">Merci !</p>
          <p className="mt-3 text-sm text-ink-soft">
            {choixVieFait === "interesse"
              ? "Votre devoir de conseil est signé. Un conseiller vous recontactera prochainement pour organiser un rendez-vous téléphonique de mise en place de votre assurance vie. Vous allez également recevoir un mail pour renseigner votre profil épargne."
              : "Votre devoir de conseil est signé. Merci pour votre confiance."}
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/espace/mon-espace" })}
            className="mt-6 rounded-full bg-[#0A192F] px-5 py-2 text-sm font-medium text-white"
          >
            Retour à mon espace
          </button>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-xl space-y-6 p-8 text-center">
        <p className="font-serif text-2xl font-medium text-ink">Votre devoir de conseil est signé.</p>
        <div className="crm-card space-y-3 rounded-2xl p-6 text-left">
          <p className="text-sm font-medium text-ink">Et vos économies ?</p>
          <p className="text-sm text-ink-soft">
            Nous vous proposons de placer les économies réalisées grâce à cette substitution sur
            une assurance vie, sans frais sur les versements. Souhaitez-vous que nous vous
            recontactions pour en discuter ?
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={choixVieEnCours}
            onClick={() => void choisirVie(true)}
            className="flex-1 rounded-full bg-[color:var(--crm-gold)] px-5 py-3 text-sm font-semibold text-[color:var(--crm-navy)] disabled:opacity-50"
          >
            Je suis intéressé(e) par l'assurance vie
          </button>
          <button
            type="button"
            disabled={choixVieEnCours}
            onClick={() => void choisirVie(false)}
            className="flex-1 rounded-full border border-line px-5 py-3 text-sm font-medium text-ink disabled:opacity-50"
          >
            Je ne suis pas intéressé(e)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        eyebrow="Document réglementaire"
        title="Devoir de conseil"
        description={`${SITE.shortName} · ORIAS ${SITE.orias} · Dossier ${c.dossier?.reference ?? ""} — ${labelForBranche(devoir.type_assurance)}`}
        icon={IconFileCheck}
      />
      <div>
        <button
          onClick={async () => {
            setError(null);
            try {
              await ouvrirPdf(async () => (await getPdf({ data: { devoir_id: devoir.id } })).url);
            } catch (e) {
              setError(e instanceof Error ? e.message : "PDF indisponible");
            }
          }}
          className="mt-3 rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface"
        >
          Ouvrir / imprimer le PDF
        </button>

      </div>

      <div className="space-y-4 rounded-2xl border border-line bg-surface-elevated p-5 text-sm">
        {conseil.exigences_client && (
          <Bloc titre="Vos exigences et besoins">{conseil.exigences_client}</Bloc>
        )}
        {(conseil.compagnie || conseil.produit) && (
          <Bloc titre="Solution recommandée">
            {[conseil.compagnie, conseil.produit].filter(Boolean).join(" — ")}
            {conseil.cotisation_mensuelle ? ` · ${conseil.cotisation_mensuelle} €/mois` : ""}
            {devoir.type_assurance === "emprunteur" && conseil.economie_estimee
              ? ` · économie estimée ${Number(conseil.economie_estimee).toLocaleString("fr-FR")} €`
              : ""}
          </Bloc>
        )}
        {Array.isArray(conseil.offres) && conseil.offres.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Offres comparées</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="py-1 pr-3">Compagnie</th>
                    <th className="py-1 pr-3">Produit</th>
                    <th className="py-1 pr-3">Cotisation</th>
                    <th className="py-1 pr-3">Appréciation</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {conseil.offres.map((o: any, i: number) => (
                    <tr key={i} className="border-b border-line align-top">
                      <td className="py-1 pr-3">{o.compagnie}</td>
                      <td className="py-1 pr-3">{o.produit}</td>
                      <td className="py-1 pr-3">
                        {o.cotisation_mensuelle ? `${o.cotisation_mensuelle} €/mois` : "—"}
                      </td>
                      <td className="py-1 pr-3">
                        {STATUT_OFFRE_LABEL[o.statut as StatutOffre] ?? o.statut}
                        {o.commentaire ? ` · ${o.commentaire}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {Array.isArray(c.garanties_produit?.detail) && c.garanties_produit.detail.length > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Garanties du contrat proposé</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th className="py-1 pr-3">Poste</th>
                    <th className="py-1 pr-3">Couverture</th>
                    <th className="py-1 pr-3">Maximum de prise en charge</th>
                    <th className="py-1 pr-3">Délai de carence</th>
                  </tr>
                </thead>
                <tbody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {c.garanties_produit.detail.map((l: any) => (
                    <tr key={l.code} className="border-b border-line align-top">
                      <td className="py-1 pr-3">{l.libelle}</td>
                      <td
                        className={
                          "py-1 pr-3 font-medium " +
                          (l.couverture === "oui"
                            ? "text-emerald-700"
                            : l.couverture === "non"
                              ? "text-rose-700"
                              : "text-ink-soft")
                        }
                      >
                        {COUVERTURE_LABEL[l.couverture as Couverture] ?? l.couverture}
                      </td>
                      <td className="py-1 pr-3">{l.plafond ?? "—"}</td>
                      <td className="py-1 pr-3">{l.delai_carence ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Relevé établi d'après les conditions générales et l'IPID du produit, vérifiés et validés par le
              cabinet.
            </p>
          </div>
        ) : (
          conseil.garanties && <Bloc titre="Garanties retenues">{conseil.garanties}</Bloc>
        )}

        {(conseil.assiette || conseil.capital_assure) && (
          <Bloc titre="Base de calcul du coût">
            {conseil.assiette === "capital_initial"
              ? "Tarif calculé sur le capital initial (cotisation fixe)"
              : "Tarif calculé sur le capital restant dû (cotisation dégressive)"}
            {conseil.capital_assure
              ? ` · capital assuré ${Number(conseil.capital_assure).toLocaleString("fr-FR")} €`
              : ""}
            {conseil.quotite ? ` · quotité ${conseil.quotite} %` : ""}
          </Bloc>
        )}
        <Bloc titre="Recommandation">{devoir.recommandation ?? "—"}</Bloc>
        <Bloc titre="Motifs du conseil">{devoir.motifs ?? "—"}</Bloc>
        {devoir.mises_en_garde && <Bloc titre="Mises en garde">{devoir.mises_en_garde}</Bloc>}
      </div>

      {!refusOpen ? (
        <div className="space-y-4 rounded-2xl border border-line bg-surface-elevated p-5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={accepte}
              onChange={(e) => setAccepte(e.target.checked)}
              className="mt-1"
            />
            <span>
              Je reconnais avoir reçu et compris le présent devoir de conseil et j'accepte la
              recommandation formulée par {SITE.shortName}.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={echelonnementSouhaite}
              onChange={(e) => {
                setEchelonnementSouhaite(e.target.checked);
                setEchelonnementConfirme(false);
              }}
              className="mt-1"
            />
            <span>Je souhaite régler les frais de distribution en 12 fois.</span>
          </label>
          {echelonnementPopupOuvert && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
              <div className="w-full max-w-md space-y-4 rounded-2xl bg-background p-6">
                <p className="font-serif text-lg font-medium text-ink">Échelonnement des frais de distribution</p>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={echelonnementConfirme}
                    onChange={(e) => setEchelonnementConfirme(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Je reconnais que les frais de{" "}
                    {Number(devoir?.contenu?.conseil?.frais_courtage ?? 0).toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    € correspondant aux frais de distribution seront prélevés en 12 fois, en complément des
                    mensualités d'assurance, soit{" "}
                    {(Number(devoir?.contenu?.conseil?.frais_courtage ?? 0) / 12).toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    € en plus de la mensualité pendant 12 mois. Les frais de dossier restent, eux, prélevés en
                    une seule fois.
                  </span>
                </label>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setEchelonnementPopupOuvert(false);
                      setEchelonnementSouhaite(false);
                      setEchelonnementConfirme(false);
                    }}
                    className="rounded-full border border-line px-4 py-2 text-sm"
                  >
                    Annuler
                  </button>
                  <button
                    disabled={!echelonnementConfirme}
                    onClick={() => setEchelonnementPopupOuvert(false)}
                    className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0A192F] disabled:opacity-50"
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            </div>
          )}
          <SignaturePad onChange={setSignature} />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={submitSignature}
              disabled={submitting || !accepte || !signature}
              className="rounded-full bg-[#D4AF37] px-5 py-2 text-sm font-semibold text-[#0A192F] transition-colors hover:bg-[#c8a233] disabled:opacity-50"
            >
              {submitting ? "Envoi…" : "Signer le devoir de conseil"}
            </button>
            <button
              onClick={() => setRefusOpen(true)}
              className="rounded-full border border-line px-5 py-2 text-sm hover:bg-surface"
            >
              Refuser la recommandation
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-line bg-surface-elevated p-5">
          <p className="text-sm font-medium text-ink">Motif de votre refus</p>
          <textarea
            rows={4}
            value={motifRefus}
            onChange={(e) => setMotifRefus(e.target.value)}
            placeholder="Indiquez pourquoi la recommandation ne vous convient pas."
            className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={submitRefus}
              disabled={submitting || motifRefus.trim().length < 3}
              className="rounded-full bg-[#D4AF37] px-5 py-2 text-sm font-semibold text-[#0A192F] transition-colors hover:bg-[#c8a233] disabled:opacity-50"
            >
              {submitting ? "Envoi…" : "Confirmer le refus"}
            </button>
            <button
              onClick={() => setRefusOpen(false)}
              className="rounded-full border border-line px-5 py-2 text-sm hover:bg-surface"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-muted">{titre}</p>
      <p className="mt-1 whitespace-pre-wrap text-ink">{children}</p>
    </div>
  );
}
