import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { envoyerDevoirConseilFn } from "@/lib/devoir-conseil.functions";
import { prefillDevoirConseil } from "@/lib/devoir-conseil-modeles";

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

const STATUT_LABEL: Record<string, string> = {
  envoye: "Envoyé — en attente du client",
  signe: "Signé par le client",
  refuse: "Refusé par le client",
};

export function DevoirConseilPanel({
  dossierId,
  clientEmail,
  branche = "",
  onChanged,
}: {
  dossierId: string;
  clientEmail: string | null;
  branche?: string;
  onChanged: () => void;
}) {
  const envoyer = useServerFn(envoyerDevoirConseilFn);
  const [devoir, setDevoir] = useState<Devoir | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    recommandation: "",
    motifs: "",
    mises_en_garde: "",
    compagnie: "",
    produit: "",
    garanties: "",
    exigences_client: "",
    cotisation_mensuelle: "",
    economie_estimee: "",
  });

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
          economie_estimee: form.economie_estimee ? Number(form.economie_estimee) : null,
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

  const valide = form.recommandation.trim().length >= 10 && form.motifs.trim().length >= 10;

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
  };

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
            <p className="text-emerald-700">
              Signé le {new Date(devoir.signed_at).toLocaleString("fr-FR")}
            </p>
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
        <p className="mt-3 text-sm text-ink-muted">
          Aucun devoir de conseil généré pour ce projet.
        </p>
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
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <Field label="Exigences et besoins exprimés par le client">
            <textarea
              rows={3}
              value={form.exigences_client}
              onChange={(e) => setForm({ ...form, exigences_client: e.target.value })}
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </Field>
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
          <Field label="Motifs du conseil (obligatoire)">
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
          <button
            onClick={submit}
            disabled={busy || !valide}
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Envoi…" : "Générer et envoyer au client"}
          </button>
          {!valide && (
            <p className="text-xs text-ink-muted">
              Recommandation et motifs doivent contenir au moins 10 caractères (exigence DDA).
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
