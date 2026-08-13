import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { creerEtEnvoyerLettreMission } from "@/lib/lettres-mission.functions";
import { getBranche, labelForBranche } from "@/lib/recueil-besoins-schemas";
import { DossierPiecesPanel } from "@/components/dossier-pieces-panel";
import { CompagnieProduitPicker } from "@/components/compagnie-produit-picker";
import { ProduitDocumentsLink } from "@/components/produit-documents-link";
import { DossierPipeline } from "@/components/dossier-pipeline";
import { DevoirConseilPanel } from "@/components/devoir-conseil-panel";
import { DossierDevisPanel } from "@/components/dossier-devis-panel";
import { etapeLabel } from "@/lib/pipeline-dossier";


export const Route = createFileRoute("/_authenticated/espace/dossiers/$id")({
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
  capital: number | null;
  duree_mois: number | null;
  age: number | null;
  fumeur: boolean | null;
  economie_estimee: number | null;
  notes: string | null;
  compagnie_id: string | null;
  produit_id: string | null;
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
    await supabase.from("dossiers").update({ compagnie_id: compagnie, produit_id: produit }).eq("id", dossier.id);
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

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("dossiers").select("*").eq("id", id).maybeSingle();
    if (error) setError(error.message);
    setDossier(data as Dossier | null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!dossier) return <p className="text-sm text-ink-muted">Dossier introuvable ou accès refusé.</p>;

  const canEdit = role === "admin" || role === "mandataire" || role === "prescripteur";

  const scrollToStep = (key: string) => {
    const mapping: Record<string, string[]> = {
      nouveau: ["section-recueil"],
      en_cours: ["section-recueil"],
      lettre_mission_envoyee: ["section-lettre-mission"],
      dda_validee: ["section-lettre-mission"],
      devis_en_cours: ["section-devis", "section-compagnie-produit"],
      devoir_conseil_envoye: ["section-devoir-conseil"],
      devoir_conseil_signe: ["section-devoir-conseil"],
      souscription_envoyee: ["section-pieces"],
      contrat_valide: ["section-pieces"],
      contrat_actif: ["section-pieces"],
    };
    const ids = mapping[key] ?? [];
    for (const sectionId of ids) {
      const el = document.getElementById(sectionId);
      if (!el) continue;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-2", "ring-[#D4AF37]", "ring-offset-2");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-[#D4AF37]", "ring-offset-2"), 1500);
      break;
    }
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
      </div>

      <DossierPipeline
        dossierId={id}
        statut={dossier.statut}
        canEdit={canEdit}
        onChanged={load}
        onStepClick={(key) => scrollToStep(key)}
      />

      <CompagnieProduitSection dossier={dossier} canEdit={canEdit} onSaved={load} />

      <RecueilPanel dossier={dossier} />
      {canEdit && (
        <div id="section-lettre-mission">
          <LettreMissionPanel dossierId={id} clientEmail={dossier.client_email} />
        </div>
      )}
      {canEdit && (
        <div id="section-devis">
          <DossierDevisPanel
            dossierId={id}
            branche={labelForBranche(dossier.type_assurance)}
            userId={user!.id}
            onChanged={load}
          />
        </div>
      )}
      {canEdit && (
        <div id="section-devoir-conseil">
          <DevoirConseilPanel
            dossierId={id}
            clientEmail={dossier.client_email}
            branche={dossier.type_assurance}
            onChanged={load}
          />
        </div>
      )}


      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Informations client">
          <Row label="Email">{dossier.client_email ?? "—"}</Row>
          <Row label="Téléphone">{dossier.client_phone ?? "—"}</Row>
          <Row label="Âge">{dossier.age ?? "—"}</Row>
          <Row label="Fumeur">{dossier.fumeur ? "Oui" : "Non"}</Row>
        </Section>
        <Section title="Prêt">
          <Row label="Capital">
            {dossier.capital ? `${Number(dossier.capital).toLocaleString("fr-FR")} €` : "—"}
          </Row>
          <Row label="Durée">{dossier.duree_mois ? `${dossier.duree_mois} mois` : "—"}</Row>
          <Row label="Économie estimée">
            {dossier.economie_estimee ? `${Number(dossier.economie_estimee).toLocaleString("fr-FR")} €` : "—"}
          </Row>
          <Row label="Étape">{etapeLabel(dossier.statut)}</Row>

        </Section>
      </div>

      {dossier.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap text-sm text-ink-soft">{dossier.notes}</p>
        </Section>
      )}

      <div id="section-pieces">
        <PiecesSection dossierId={id} clientEmail={dossier.client_email} canValidate={canEdit} />
      </div>

      <MessagesPanel dossierId={id} userId={user!.id} />
      <DocumentsPanel dossierId={id} userId={user!.id} />
    </div>
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
        const { data: c } = await supabase.from("clients").select("id").eq("email", clientEmail).maybeSingle();
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

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-6 rounded-2xl border border-line bg-surface-elevated p-5 transition-all">
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
        { event: "INSERT", schema: "public", table: "messages", filter: `dossier_id=eq.${dossierId}` },
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
                <p className={"mt-1 text-[10px] " + (mine ? "text-primary-foreground/70" : "text-ink-muted")}>
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

  const load = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id,file_name,file_size,storage_path,created_at,uploader_id")
      .eq("dossier_id", dossierId)
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
    const { error: dbErr } = await supabase.from("documents").insert({
      dossier_id: dossierId,
      uploader_id: userId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
    });
    setUploading(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  const download = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("dossier-documents").createSignedUrl(path, 60);
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
    await supabase.from("documents").delete().eq("id", doc.id);
    load();
  };

  return (
    <Section title="Documents">
      <div className="flex items-center gap-3">
        <label className="cursor-pointer rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground">
          {uploading ? "Envoi…" : "Ajouter un document"}
          <input ref={fileRef} type="file" onChange={onUpload} className="hidden" disabled={uploading} />
        </label>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      <ul className="mt-4 space-y-2">
        {docs.length === 0 && <li className="text-ink-muted">Aucun document.</li>}
        {docs.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-md border border-line bg-background px-3 py-2">
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

function RecueilPanel({ dossier }: { dossier: Dossier }) {
  const branche = getBranche(dossier.type_assurance);
  const r = dossier.recueil_besoins ?? {};
  if (!branche) return null;
  return (
    <Section title={`Recueil des besoins — ${branche.label}`}>
      {branche.sections.map((s) => {
        const rows = s.fields
          .map((f) => {
            const v = (r as Record<string, unknown>)[f.key];
            if (v === undefined || v === null || v === "" || v === false) return null;
            const val =
              typeof v === "boolean" ? "Oui" : (f.options?.find((o) => o.value === v)?.label ?? String(v));
            return (
              <div key={f.key} className="flex justify-between gap-4 border-b border-line py-1 text-sm">
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

function LettreMissionPanel({ dossierId, clientEmail }: { dossierId: string; clientEmail: string | null }) {
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
              {lettre.statut === "signee" ? "Signée" : lettre.statut === "envoyee" ? "Envoyée · en attente de signature" : lettre.statut}
            </span>
          </div>
          {lettre.envoye_le && (
            <p className="text-xs text-ink-muted">
              Envoyée le {new Date(lettre.envoye_le).toLocaleString("fr-FR")} à {lettre.email_destinataire}
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
            {busy ? "Envoi…" : lettre ? "Renvoyer la lettre de mission" : "Générer et envoyer la lettre de mission"}
          </button>
          {!clientEmail && (
            <p className="mt-2 text-xs text-destructive">Renseignez un email client pour pouvoir envoyer.</p>
          )}
          {msg && <p className="mt-2 text-xs text-ink-muted">{msg}</p>}
        </div>
      )}
    </Section>
  );
}
