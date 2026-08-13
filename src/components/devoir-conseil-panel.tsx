import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { envoyerDevoirConseilFn, pdfDevoirConseil } from "@/lib/devoir-conseil.functions";
import { prefillDevoirConseil, STATUT_OFFRE_LABEL, type StatutOffre } from "@/lib/devoir-conseil-modeles";

type Devoir = {
  id: string;
  statut: string;
  recommandation: string | null;
  motifs: string | null;
  mises_en_garde: string | null;
  envoye_le: string | null;
  signed_at: string | null;
  refus_motif: string | null;
  refuse_le: string | null;
  hash: string | null;
  email_destinataire: string | null;
};

type DevisLigne = {
  id: string;
  compagnie: string;
  produit: string;
  formule: string;
  cotisation_mensuelle: number | null;
  garanties_resume: string | null;
};

type OffreForm = {
  compagnie: string;
  produit: string;
  formule: string;
  cotisation_mensuelle: string;
  cout_total: string;
  statut: StatutOffre;
  commentaire: string;
};

const STATUT_LABEL: Record<string, string> = {
  envoye: "Envoyé — en attente du client",
  signe: "Signé par le client",
  refuse: "Refusé par le client",
};

const offreVide = (statut: StatutOffre): OffreForm => ({
  compagnie: "",
  produit: "",
  formule: "",
  cotisation_mensuelle: "",
  cout_total: "",
  statut,
  commentaire: "",
});

export function DevoirConseilPanel({
  dossierId,
  clientEmail,
  branche = "",
  onChanged,
  contreProposition = null,
}: {
  dossierId: string;
  clientEmail: string | null;
  branche?: string;
  onChanged: () => void;
  /** Pré-remplissage d'une nouvelle saisie après refus (analyse IA). */
  contreProposition?: { suggestion: string; motif: string; key: number } | null;
}) {
  const envoyer = useServerFn(envoyerDevoirConseilFn);
  const getPdf = useServerFn(pdfDevoirConseil);
  const [devoir, setDevoir] = useState<Devoir | null>(null);
  const [devisDossier, setDevisDossier] = useState<DevisLigne[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const emprunteur = branche === "emprunteur";

  const [form, setForm] = useState({
    recommandation: "",
    motifs: "",
    mises_en_garde: "",
    compagnie: "",
    produit: "",
    garanties: "",
    exigences_client: "",
    cotisation_mensuelle: "",
    frais_dossier: "",
    frais_souscription: "",
    economie_estimee: "",
    assiette: "capital_restant_du" as "capital_initial" | "capital_restant_du",
    capital_assure: "",
    capital_restant_du: "",
    quotite: "",
    duree_mois: "",
    ipid_remis: true,
    cg_remis: true,
    tarifs_remis: true,
    der_remis: true,
  });

  const [offres, setOffres] = useState<OffreForm[]>([
    offreVide("retenue"),
    offreVide("equivalente"),
    offreVide("ecartee"),
  ]);

  const load = async () => {
    const { data } = await supabase
      .from("devoirs_conseil")
      .select(
        "id, statut, recommandation, motifs, mises_en_garde, envoye_le, signed_at, refus_motif, refuse_le, hash, email_destinataire",
      )
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const d = (data as Devoir | null) ?? null;
    setDevoir(d);
    if (d) {
      setForm((f) => ({
        ...f,
        recommandation: d.recommandation ?? f.recommandation,
        motifs: d.motifs ?? f.motifs,
        mises_en_garde: d.mises_en_garde ?? f.mises_en_garde,
      }));
    }
  };

  useEffect(() => {
    load();
  }, [dossierId]);

  // Contre-proposition demandée depuis l'analyse IA du refus : ouvre et pré-remplit la saisie.
  useEffect(() => {
    if (!contreProposition) return;
    setOpen(true);
    setForm((f) => ({
      ...f,
      recommandation: contreProposition.suggestion || f.recommandation,
      motifs: `Contre-proposition suite au refus du client (motif : ${contreProposition.motif}).\n${f.motifs}`.trim(),
    }));
  }, [contreProposition?.key]);


  // Devis saisis sur le dossier : base de pré-remplissage du tableau comparatif.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("dossier_devis")
        .select(
          "id, cotisation_mensuelle, garanties_resume, compagnies:compagnie_id(nom), produits:produit_id(nom), produit_formules:formule_id(nom)",
        )
        .eq("dossier_id", dossierId)
        .order("created_at", { ascending: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = ((data as any[]) ?? []).map((d) => ({
        id: d.id as string,
        compagnie: d.compagnies?.nom ?? "",
        produit: d.produits?.nom ?? "",
        formule: d.produit_formules?.nom ?? "",
        cotisation_mensuelle: d.cotisation_mensuelle as number | null,
        garanties_resume: (d.garanties_resume as string | null) ?? null,
      }));
      setDevisDossier(list);
    })();
  }, [dossierId]);

  const prefillDepuisDevis = () => {
    if (devisDossier.length === 0) return;
    setOffres(
      devisDossier.map((d, i) => ({
        compagnie: d.compagnie,
        produit: d.produit,
        formule: d.formule,
        cotisation_mensuelle: d.cotisation_mensuelle != null ? String(d.cotisation_mensuelle) : "",
        cout_total: "",
        statut: (i === 0 ? "retenue" : "equivalente") as StatutOffre,
        commentaire: d.garanties_resume ?? "",
      })),
    );
  };

  const offresRemplies = offres.filter((o) => o.compagnie.trim() && o.produit.trim());

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await envoyer({
        data: {
          dossier_id: dossierId,
          recommandation: form.recommandation.trim(),
          motifs: form.motifs.trim(),
          mises_en_garde: form.mises_en_garde.trim() || undefined,
          compagnie: form.compagnie.trim() || undefined,
          produit: form.produit.trim() || undefined,
          garanties: form.garanties.trim() || undefined,
          exigences_client: form.exigences_client.trim() || undefined,
          cotisation_mensuelle: form.cotisation_mensuelle ? Number(form.cotisation_mensuelle) : null,
          frais_dossier: form.frais_dossier ? Number(form.frais_dossier) : null,
          frais_souscription: form.frais_souscription ? Number(form.frais_souscription) : null,
          economie_estimee: form.economie_estimee ? Number(form.economie_estimee) : null,
          offres:
            offresRemplies.length > 0
              ? offresRemplies.map((o) => ({
                  compagnie: o.compagnie.trim(),
                  produit: o.produit.trim(),
                  formule: o.formule.trim() || null,
                  cotisation_mensuelle: o.cotisation_mensuelle ? Number(o.cotisation_mensuelle) : null,
                  cout_total: o.cout_total ? Number(o.cout_total) : null,
                  statut: o.statut,
                  commentaire: o.commentaire.trim() || null,
                }))
              : undefined,
          ...(emprunteur
            ? {
                assiette: form.assiette,
                capital_assure: form.capital_assure ? Number(form.capital_assure) : null,
                capital_restant_du: form.capital_restant_du ? Number(form.capital_restant_du) : null,
                quotite: form.quotite ? Number(form.quotite) : null,
                duree_mois: form.duree_mois ? Number(form.duree_mois) : null,
              }
            : {}),
          ipid_remis: form.ipid_remis,
          cg_remis: form.cg_remis,
          tarifs_remis: form.tarifs_remis,
          der_remis: form.der_remis,
        },
      });
      setMsg("Devoir de conseil généré et envoyé au client.");
      setOpen(false);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'envoi");
    }
    setBusy(false);
  };

  const telechargerPdf = async () => {
    if (!devoir) return;
    setError(null);
    try {
      const res = await getPdf({ data: { devoir_id: devoir.id } });
      window.open(res.url, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF indisponible");
    }
  };

  const troisOffres = !emprunteur || offresRemplies.length >= 3;
  const valide = form.recommandation.trim().length >= 10 && form.motifs.trim().length >= 10 && troisOffres;

  const appliquerModele = () => {
    const pre = prefillDevoirConseil({
      branche,
      compagnie: form.compagnie || null,
      produit: form.produit || null,
      garanties: form.garanties || null,
      exigences: form.exigences_client || undefined,
      cotisation_mensuelle: form.cotisation_mensuelle ? Number(form.cotisation_mensuelle) : null,
      economie_estimee: form.economie_estimee ? Number(form.economie_estimee) : null,
    });
    setForm((f) => ({
      ...f,
      recommandation: pre.recommandation,
      motifs: pre.motifs,
      mises_en_garde: pre.mises_en_garde,
      exigences_client: pre.exigences_client,
    }));
    setOffres((list) =>
      list.map((o, i) =>
        i === 0 && form.compagnie
          ? { ...o, compagnie: form.compagnie, produit: form.produit, statut: "retenue" }
          : o,
      ),
    );
  };

  const majOffre = (index: number, patch: Partial<OffreForm>) =>
    setOffres((list) => list.map((o, i) => (i === index ? { ...o, ...patch } : o)));

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-medium text-ink">Devoir de conseil</h2>
        {devoir && (
          <span className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft">
            {STATUT_LABEL[devoir.statut] ?? devoir.statut}
          </span>
        )}
      </div>

      {devoir ? (
        <div className="mt-3 space-y-1 text-sm text-ink-soft">
          <p>
            Destinataire : {devoir.email_destinataire ?? "—"}
            {devoir.envoye_le && ` · envoyé le ${new Date(devoir.envoye_le).toLocaleString("fr-FR")}`}
          </p>
          {devoir.signed_at && (
            <p className="text-emerald-700">Signé le {new Date(devoir.signed_at).toLocaleString("fr-FR")}</p>
          )}
          {devoir.refuse_le && (
            <p className="text-destructive">
              Refusé le {new Date(devoir.refuse_le).toLocaleString("fr-FR")} — motif : {devoir.refus_motif}
            </p>
          )}
          {devoir.hash && <p className="text-xs text-ink-muted">Empreinte SHA-256 : {devoir.hash.slice(0, 24)}…</p>}
          {devoir.recommandation && (
            <p className="mt-2 whitespace-pre-wrap rounded-md bg-surface p-3 text-sm">{devoir.recommandation}</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">Aucun devoir de conseil généré pour ce projet.</p>
      )}

      {!clientEmail && (
        <p className="mt-3 text-xs text-destructive">
          Renseignez l'email du client pour pouvoir envoyer le devoir de conseil.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={!clientEmail}
          className="rounded-full border border-line px-4 py-2 text-sm hover:bg-surface disabled:opacity-50"
        >
          {open ? "Fermer" : devoir ? "Regénérer / renvoyer" : "Rédiger le devoir de conseil"}
        </button>
        {devoir && (
          <button
            onClick={telechargerPdf}
            className="rounded-full border border-line px-4 py-2 text-sm hover:bg-surface"
          >
            Télécharger le PDF
          </button>
        )}
        {open && (
          <button onClick={appliquerModele} className="rounded-full border border-line px-4 py-2 text-sm hover:bg-surface">
            Pré-remplir depuis le modèle
          </button>
        )}
        {open && devisDossier.length > 0 && (
          <button
            onClick={prefillDepuisDevis}
            className="rounded-full border border-line px-4 py-2 text-sm hover:bg-surface"
          >
            Reprendre les {devisDossier.length} devis du dossier
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <Field label="1. Exigences et besoins exprimés par le client">
            <textarea
              rows={3}
              value={form.exigences_client}
              onChange={(e) => setForm({ ...form, exigences_client: e.target.value })}
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </Field>

          {/* Offres comparées */}
          <div className="rounded-xl border border-line p-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              2. Offres comparées {emprunteur && <span className="text-destructive">(3 minimum en emprunteur)</span>}
            </p>
            <div className="mt-3 space-y-3">
              {offres.map((o, i) => (
                <div key={i} className="grid gap-2 rounded-md border border-line bg-surface p-3 sm:grid-cols-6">
                  <input
                    placeholder="Compagnie"
                    value={o.compagnie}
                    onChange={(e) => majOffre(i, { compagnie: e.target.value })}
                    className="rounded-md border border-line bg-background px-2 py-1.5 text-sm sm:col-span-2"
                  />
                  <input
                    placeholder="Produit"
                    value={o.produit}
                    onChange={(e) => majOffre(i, { produit: e.target.value })}
                    className="rounded-md border border-line bg-background px-2 py-1.5 text-sm sm:col-span-2"
                  />
                  <input
                    placeholder="Formule (santé)"
                    value={o.formule}
                    onChange={(e) => majOffre(i, { formule: e.target.value })}
                    className="rounded-md border border-line bg-background px-2 py-1.5 text-sm sm:col-span-2"
                  />
                  <input
                    type="number"
                    placeholder="€/mois"
                    value={o.cotisation_mensuelle}
                    onChange={(e) => majOffre(i, { cotisation_mensuelle: e.target.value })}
                    className="rounded-md border border-line bg-background px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Coût total €"
                    value={o.cout_total}
                    onChange={(e) => majOffre(i, { cout_total: e.target.value })}
                    className="rounded-md border border-line bg-background px-2 py-1.5 text-sm"
                  />
                  <select
                    value={o.statut}
                    onChange={(e) => majOffre(i, { statut: e.target.value as StatutOffre })}
                    className="rounded-md border border-line bg-background px-2 py-1.5 text-sm sm:col-span-2"
                  >
                    {(Object.keys(STATUT_OFFRE_LABEL) as StatutOffre[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUT_OFFRE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Appréciation motivée (pas de note chiffrée)"
                    value={o.commentaire}
                    onChange={(e) => majOffre(i, { commentaire: e.target.value })}
                    className="rounded-md border border-line bg-background px-2 py-1.5 text-sm sm:col-span-4"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => setOffres((l) => [...l, offreVide("ecartee")])}
              className="mt-2 text-xs text-ink-muted underline"
            >
              + Ajouter une offre
            </button>
          </div>

          {/* Base de calcul (emprunteur) */}
          {emprunteur && (
            <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
              <p className="text-xs uppercase tracking-wide text-ink-muted sm:col-span-2">
                3. Base de calcul du coût
              </p>
              <Field label="Assiette">
                <select
                  value={form.assiette}
                  onChange={(e) =>
                    setForm({ ...form, assiette: e.target.value as "capital_initial" | "capital_restant_du" })
                  }
                  className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
                >
                  <option value="capital_initial">Capital initial (tarif fixe)</option>
                  <option value="capital_restant_du">Capital restant dû (tarif dégressif)</option>
                </select>
              </Field>
              <Field label="Capital assuré (€)">
                <input
                  type="number"
                  value={form.capital_assure}
                  onChange={(e) => setForm({ ...form, capital_assure: e.target.value })}
                  className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Capital restant dû (€)">
                <input
                  type="number"
                  value={form.capital_restant_du}
                  onChange={(e) => setForm({ ...form, capital_restant_du: e.target.value })}
                  className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Quotité assurée (%)">
                <input
                  type="number"
                  value={form.quotite}
                  onChange={(e) => setForm({ ...form, quotite: e.target.value })}
                  className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Durée résiduelle (mois)">
                <input
                  type="number"
                  value={form.duree_mois}
                  onChange={(e) => setForm({ ...form, duree_mois: e.target.value })}
                  className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Compagnie recommandée">
              <input
                value={form.compagnie}
                onChange={(e) => setForm({ ...form, compagnie: e.target.value })}
                className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Produit / contrat">
              <input
                value={form.produit}
                onChange={(e) => setForm({ ...form, produit: e.target.value })}
                className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Cotisation mensuelle (€)">
              <input
                type="number"
                value={form.cotisation_mensuelle}
                onChange={(e) => setForm({ ...form, cotisation_mensuelle: e.target.value })}
                className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Frais de dossier (€)">
              <input
                type="number"
                value={form.frais_dossier}
                onChange={(e) => setForm({ ...form, frais_dossier: e.target.value })}
                className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Frais de souscription (€)">
              <input
                type="number"
                value={form.frais_souscription}
                onChange={(e) => setForm({ ...form, frais_souscription: e.target.value })}
                className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Économie estimée (€)">
              <input
                type="number"
                value={form.economie_estimee}
                onChange={(e) => setForm({ ...form, economie_estimee: e.target.value })}
                className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="Garanties retenues">
            <textarea
              rows={3}
              value={form.garanties}
              onChange={(e) => setForm({ ...form, garanties: e.target.value })}
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Recommandation (obligatoire)">
            <textarea
              rows={4}
              value={form.recommandation}
              onChange={(e) => setForm({ ...form, recommandation: e.target.value })}
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Motifs du conseil (obligatoire — renvoyer aux exigences du point 1)">
            <textarea
              rows={4}
              value={form.motifs}
              onChange={(e) => setForm({ ...form, motifs: e.target.value })}
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Mises en garde">
            <textarea
              rows={3}
              value={form.mises_en_garde}
              onChange={(e) => setForm({ ...form, mises_en_garde: e.target.value })}
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </Field>

          <div className="rounded-xl border border-line p-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Accusé de remise des documents</p>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {(
                [
                  ["ipid_remis", "IPID remis"],
                  ["cg_remis", "Conditions générales / tableau de garanties"],
                  ["tarifs_remis", "Grille tarifaire / proposition"],
                  ["der_remis", "DER remis"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={submit}
            disabled={busy || !valide}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Envoi…" : "Générer et envoyer au client"}
          </button>
          {!valide && (
            <p className="text-xs text-ink-muted">
              Recommandation et motifs doivent contenir au moins 10 caractères (exigence DDA)
              {emprunteur && ", et 3 offres comparées doivent être renseignées"}.
            </p>
          )}
        </div>
      )}

      {msg && <p className="mt-3 text-xs text-emerald-700">{msg}</p>}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
