import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { FamilleTab, EntrepriseTab, EquipementsTab } from "@/components/client-360-tabs";
import { ContratsTab } from "@/components/contrats-tab";
import { DerTab } from "@/components/der-tab";
import { ConformiteClientTab } from "@/components/conformite-client-tab";
import { DeleteClientButton } from "@/components/delete-client-button";
import { CrmBrandPanel } from "@/components/crm-brand-panel";
import { NewDossierForm } from "@/routes/_authenticated/espace.dossiers.index";

export const Route = createFileRoute("/_authenticated/espace/clients/$id")({
  component: ClientDetail,
});

type Client = {
  id: string;
  reference: string;
  civilite: string | null;
  prenom: string | null;
  nom: string;
  nom_naissance: string | null;
  date_naissance: string | null;
  situation_familiale: string | null;
  nationalite: string | null;
  ville_naissance: string | null;
  pays_naissance: string | null;
  email: string | null;
  email2: string | null;
  mobile: string | null;
  mobile2: string | null;
  telephone: string | null;
  telephone2: string | null;
  adresse: string | null;
  complement_adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  pays: string | null;
  statut: string;
  origine: string | null;
  preference_contact: string | null;
  fumeur: boolean | null;
  csp: string | null;
  metier: string | null;
  numero_secu: string | null;
  remarque: string | null;
  etiquettes: string[] | null;
  nb_enfants: number | null;
  revenus_annuels: number | null;
  ppe: boolean | null;
  ppe_fonction: string | null;
  ppe_pays: string | null;
  created_at: string;
};

type Tache = {
  id: string;
  titre: string;
  description: string | null;
  echeance: string | null;
  priorite: string;
  statut: string;
  created_at: string;
};

type Activite = {
  id: string;
  type: string;
  titre: string | null;
  contenu: string | null;
  created_at: string;
};

type Dossier = {
  id: string;
  reference: string;
  statut: string;
  capital: number | null;
  economie_estimee: number | null;
  created_at: string;
};

type Doc = {
  id: string;
  file_name: string;
  storage_path: string;
  file_size: number | null;
  created_at: string;
};

type Tab =
  | "identite"
  | "famille"
  | "entreprise"
  | "equipements"
  | "contrats"
  | "taches"
  | "historique"
  | "documents"
  | "dossiers"
  | "der"
  | "conformite";

function ClientDetail() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [tab, setTab] = useState<Tab>("identite");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
    setClient(data as Client | null);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (!client)
    return (
      <div>
        <p className="text-sm text-ink-muted">Fiche introuvable.</p>
        <Link to="/espace/clients" className="mt-4 inline-block text-sm underline">
          ← Retour aux clients
        </Link>
      </div>
    );

  const fullName = [client.civilite, client.prenom, client.nom].filter(Boolean).join(" ");
  const canEdit = role === "admin" || role === "mandataire";

  return (
    <div>
      <Link to="/espace/clients" className="text-xs text-ink-muted hover:underline">
        ← Clients
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{fullName}</h1>
          <p className="mt-1 text-xs text-ink-muted">
            <span className="font-mono">{client.reference}</span> · Créé le{" "}
            {new Date(client.created_at).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-line bg-surface-elevated px-3 py-1 text-xs font-medium">
            {client.statut}
          </span>
          {role === "admin" && (
            <DeleteClientButton
              clientId={client.id}
              clientLabel={fullName}
              onDeleted={() => navigate({ to: "/espace/clients" })}
            />
          )}
        </div>
      </div>

      <div className="mt-4">
        <CrmBrandPanel clientId={client.id} canEdit={canEdit} />
      </div>



      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {(
          [
            ["identite", "Identité"],
            ["famille", "Famille"],
            ["entreprise", "Entreprise"],
            ["equipements", "Équipements"],
            ["contrats", "Contrats"],
            ["taches", "Tâches"],
            ["historique", "Historique"],
            ["documents", "Documents"],
            ["dossiers", "Dossiers"],
            ["der", "DER"],
            ["conformite", "Conformité"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "shrink-0 border-b-2 px-4 py-2 text-sm transition-colors " +
              (tab === key ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "identite" && <IdentiteTab client={client} canEdit={canEdit} onSaved={load} />}
        {tab === "famille" && <FamilleTab clientId={client.id} canEdit={canEdit} />}
        {tab === "entreprise" && <EntrepriseTab clientId={client.id} canEdit={canEdit} />}
        {tab === "equipements" && <EquipementsTab clientId={client.id} canEdit={canEdit} />}
        {tab === "contrats" && <ContratsTab clientId={client.id} canEdit={canEdit} />}
        {tab === "taches" && <TachesTab clientId={client.id} canEdit={canEdit} />}
        {tab === "historique" && <HistoriqueTab clientId={client.id} />}
        {tab === "documents" && <DocumentsTab clientId={client.id} canEdit={canEdit} />}
        {tab === "dossiers" && <DossiersTab client={client} />}
        {tab === "der" && <DerTab clientId={client.id} clientEmail={client.email} />}
        {tab === "conformite" && (
          <ConformiteClientTab clientId={client.id} clientEmail={client.email} canEdit={canEdit} />
        )}
      </div>
    </div>
  );
}

/* -------------------- IDENTITÉ -------------------- */

function IdentiteTab({ client, canEdit, onSaved }: { client: Client; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Client>(client);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(client), [client]);

  const save = async () => {
    setSaving(true);
    const { id, reference, created_at, ...rest } = form;
    void id;
    void reference;
    void created_at;
    const { error } = await supabase
      .from("clients")
      .update(rest as never)
      .eq("id", client.id);
    setSaving(false);
    if (!error) {
      setEditing(false);
      onSaved();
    }
  };

  if (!editing) {
    return (
      <div>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="mb-4 rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface"
          >
            Modifier
          </button>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="État civil">
            <Row label="Civilité" value={client.civilite} />
            <Row label="Prénom" value={client.prenom} />
            <Row label="Nom" value={client.nom} />
            <Row label="Nom de naissance" value={client.nom_naissance} />
            <Row label="Date de naissance" value={client.date_naissance} />
            <Row label="Ville de naissance" value={client.ville_naissance} />
            <Row label="Pays de naissance" value={client.pays_naissance} />
            <Row label="Nationalité" value={client.nationalite} />
            <Row label="Situation familiale" value={client.situation_familiale} />
          </Section>

          <Section title="Coordonnées">
            <Row label="Email" value={client.email} />
            <Row label="Email secondaire" value={client.email2} />
            <Row label="Mobile" value={client.mobile} />
            <Row label="Mobile 2" value={client.mobile2} />
            <Row label="Téléphone" value={client.telephone} />
            <Row label="Préférence contact" value={client.preference_contact} />
          </Section>

          <Section title="Adresse">
            <Row label="Adresse" value={client.adresse} />
            <Row label="Complément" value={client.complement_adresse} />
            <Row label="Code postal" value={client.code_postal} />
            <Row label="Ville" value={client.ville} />
            <Row label="Pays" value={client.pays} />
          </Section>

          <Section title="Profil">
            <Row label="Statut" value={client.statut} />
            <Row label="Origine" value={client.origine} />
            <Row label="CSP" value={client.csp} />
            <Row label="Métier" value={client.metier} />
            <Row label="Fumeur" value={client.fumeur ? "Oui" : "Non"} />
            <Row label="N° Sécu" value={client.numero_secu} />
            <Row label="Nb enfants" value={client.nb_enfants} />
            <Row
              label="Revenus annuels"
              value={client.revenus_annuels ? Number(client.revenus_annuels).toLocaleString("fr-FR") + " €" : null}
            />
          </Section>

          <Section title="Personne politiquement exposée (PPE)">
            <Row label="PPE" value={client.ppe ? "Oui" : "Non"} />
            {client.ppe && (
              <>
                <Row label="Fonction" value={client.ppe_fonction} />
                <Row label="Pays" value={client.ppe_pays} />
              </>
            )}
          </Section>

          {client.remarque && (
            <Section title="Remarque" className="md:col-span-2">
              <p className="whitespace-pre-wrap text-sm text-ink-soft">{client.remarque}</p>
            </Section>
          )}
        </div>
      </div>
    );
  }

  const F = (label: string, key: keyof Client, type: "text" | "date" | "email" = "text") => (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <input
        type={type}
        value={(form[key] as string) ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
    </label>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="État civil">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Civilité</span>
          <select
            value={form.civilite ?? ""}
            onChange={(e) => setForm({ ...form, civilite: e.target.value })}
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option>M.</option>
            <option>Mme</option>
            <option>Autre</option>
          </select>
        </label>
        {F("Prénom", "prenom")}
        {F("Nom", "nom")}
        {F("Nom de naissance", "nom_naissance")}
        {F("Date de naissance", "date_naissance", "date")}
        {F("Ville de naissance", "ville_naissance")}
        {F("Pays de naissance", "pays_naissance")}
        {F("Nationalité", "nationalite")}
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Situation familiale</span>
          <select
            value={form.situation_familiale ?? ""}
            onChange={(e) => setForm({ ...form, situation_familiale: e.target.value })}
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option>Célibataire</option>
            <option>Marié(e)</option>
            <option>Pacsé(e)</option>
            <option>Concubinage</option>
            <option>Divorcé(e)</option>
            <option>Veuf(ve)</option>
          </select>
        </label>
      </Section>

      <Section title="Coordonnées">
        {F("Email", "email", "email")}
        {F("Email secondaire", "email2", "email")}
        {F("Mobile", "mobile")}
        {F("Mobile 2", "mobile2")}
        {F("Téléphone", "telephone")}
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Préférence contact</span>
          <select
            value={form.preference_contact ?? ""}
            onChange={(e) => setForm({ ...form, preference_contact: e.target.value })}
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option>Email</option>
            <option>Téléphone</option>
            <option>SMS</option>
            <option>Courrier</option>
          </select>
        </label>
      </Section>

      <Section title="Adresse">
        {F("Adresse", "adresse")}
        {F("Complément", "complement_adresse")}
        {F("Code postal", "code_postal")}
        {F("Ville", "ville")}
        {F("Pays", "pays")}
      </Section>

      <Section title="Profil">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Statut</span>
          <select
            value={form.statut}
            onChange={(e) => setForm({ ...form, statut: e.target.value })}
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            {["prospect", "actif", "inactif", "perdu", "ancien"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Origine</span>
          <select
            value={form.origine ?? ""}
            onChange={(e) => setForm({ ...form, origine: e.target.value || null })}
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {["internet", "assurlead", "telephone", "apporteur", "reseau", "autre"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {F("CSP", "csp")}
        {F("Métier", "metier")}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!form.fumeur}
            onChange={(e) => setForm({ ...form, fumeur: e.target.checked })}
          />
          Fumeur
        </label>
        {F("N° Sécu", "numero_secu")}
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Nb enfants</span>
          <input
            type="number"
            value={form.nb_enfants ?? ""}
            onChange={(e) => setForm({ ...form, nb_enfants: e.target.value ? Number(e.target.value) : null })}
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-ink-muted">Revenus annuels (€)</span>
          <input
            type="number"
            value={form.revenus_annuels ?? ""}
            onChange={(e) => setForm({ ...form, revenus_annuels: e.target.value ? Number(e.target.value) : null })}
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
        </label>
      </Section>

      <Section title="PPE (personne politiquement exposée)">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.ppe} onChange={(e) => setForm({ ...form, ppe: e.target.checked })} />
          Personne politiquement exposée
        </label>
        {form.ppe && (
          <>
            {F("Fonction", "ppe_fonction")}
            {F("Pays", "ppe_pays")}
          </>
        )}
      </Section>

      <Section title="Remarque" className="md:col-span-2">
        <textarea
          value={form.remarque ?? ""}
          onChange={(e) => setForm({ ...form, remarque: e.target.value })}
          rows={4}
          className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
      </Section>

      <div className="flex gap-2 md:col-span-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          onClick={() => {
            setForm(client);
            setEditing(false);
          }}
          className="rounded-full border border-line px-4 py-2 text-sm"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"rounded-2xl border border-line bg-surface-elevated p-5 " + className}>
      <h3 className="font-serif text-base font-medium text-ink">{title}</h3>
      <div className="mt-3 grid gap-2">{children}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink">{value || <span className="text-ink-muted">—</span>}</span>
    </div>
  );
}

/* -------------------- TÂCHES -------------------- */

function TachesTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const [items, setItems] = useState<Tache[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ titre: "", description: "", echeance: "", priorite: "normale" });

  const load = async () => {
    const { data } = await supabase
      .from("taches")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Tache[]);
  };
  useEffect(() => {
    load();
  }, [clientId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titre.trim()) return;
    await supabase.from("taches").insert({
      client_id: clientId,
      titre: form.titre,
      description: form.description || null,
      echeance: form.echeance || null,
      priorite: form.priorite as "basse" | "normale" | "haute" | "urgente",
    });
    setForm({ titre: "", description: "", echeance: "", priorite: "normale" });
    setShowForm(false);
    load();
  };

  const toggle = async (t: Tache) => {
    await supabase
      .from("taches")
      .update({ statut: t.statut === "terminee" ? "a_faire" : "terminee" })
      .eq("id", t.id);
    load();
  };

  return (
    <div>
      {canEdit && (
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {showForm ? "Annuler" : "Nouvelle tâche"}
        </button>
      )}
      {showForm && (
        <form
          onSubmit={submit}
          className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface-elevated p-5 sm:grid-cols-2"
        >
          <input
            required
            placeholder="Titre *"
            value={form.titre}
            onChange={(e) => setForm({ ...form, titre: e.target.value })}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            type="date"
            value={form.echeance}
            onChange={(e) => setForm({ ...form, echeance: e.target.value })}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
          <select
            value={form.priorite}
            onChange={(e) => setForm({ ...form, priorite: e.target.value })}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            <option value="basse">Priorité basse</option>
            <option value="normale">Priorité normale</option>
            <option value="haute">Priorité haute</option>
            <option value="urgente">Urgente</option>
          </select>
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:col-span-2"
          />
          <button className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2">
            Créer la tâche
          </button>
        </form>
      )}

      <div className="mt-6 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucune tâche.</p>
        ) : (
          items.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-xl border border-line bg-surface-elevated p-4">
              <input type="checkbox" checked={t.statut === "terminee"} onChange={() => toggle(t)} className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={
                      "text-sm font-medium " + (t.statut === "terminee" ? "text-ink-muted line-through" : "text-ink")
                    }
                  >
                    {t.titre}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full border border-line px-2 py-0.5">{t.priorite}</span>
                    {t.echeance && (
                      <span className="text-ink-muted">{new Date(t.echeance).toLocaleDateString("fr-FR")}</span>
                    )}
                  </div>
                </div>
                {t.description && <p className="mt-1 text-sm text-ink-soft">{t.description}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------- HISTORIQUE -------------------- */

function HistoriqueTab({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<Activite[]>([]);
  const [form, setForm] = useState({ type: "note", titre: "", contenu: "" });

  const load = async () => {
    const { data } = await supabase
      .from("activites")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Activite[]);
  };
  useEffect(() => {
    load();
  }, [clientId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contenu.trim()) return;
    await supabase.from("activites").insert({
      client_id: clientId,
      type: form.type as "note" | "appel" | "email" | "sms" | "rdv" | "systeme",
      titre: form.titre || null,
      contenu: form.contenu,
    });
    setForm({ type: "note", titre: "", contenu: "" });
    load();
  };

  return (
    <div>
      <form
        onSubmit={submit}
        className="grid gap-3 rounded-2xl border border-line bg-surface-elevated p-5 sm:grid-cols-[160px_1fr]"
      >
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        >
          <option value="note">Note</option>
          <option value="appel">Appel</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="rdv">Rendez-vous</option>
        </select>
        <input
          placeholder="Titre (optionnel)"
          value={form.titre}
          onChange={(e) => setForm({ ...form, titre: e.target.value })}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
        <textarea
          required
          placeholder="Contenu…"
          value={form.contenu}
          onChange={(e) => setForm({ ...form, contenu: e.target.value })}
          rows={3}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:col-span-2"
        />
        <button className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2">
          Ajouter à l'historique
        </button>
      </form>

      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucune activité.</p>
        ) : (
          items.map((a) => (
            <div key={a.id} className="rounded-xl border border-line bg-surface-elevated p-4">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span className="rounded-full border border-line px-2 py-0.5 uppercase tracking-wide">{a.type}</span>
                <span>{new Date(a.created_at).toLocaleString("fr-FR")}</span>
              </div>
              {a.titre && <p className="mt-2 text-sm font-medium text-ink">{a.titre}</p>}
              {a.contenu && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{a.contenu}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------- DOCUMENTS -------------------- */

function DocumentsTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id,file_name,storage_path,file_size,created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Doc[]);
  };
  useEffect(() => {
    load();
  }, [clientId]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const path = `clients/${clientId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("dossier-documents").upload(path, file);
    if (!upErr) {
      await supabase.from("documents").insert({
        client_id: clientId,
        uploader_id: user.id,
        file_name: file.name,
        storage_path: path,
        file_size: file.size,
      });
      load();
    }
    setUploading(false);
    e.target.value = "";
  };

  const download = async (d: Doc) => {
    const { data } = await supabase.storage.from("dossier-documents").createSignedUrl(d.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div>
      {canEdit && (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground">
          {uploading ? "Envoi…" : "Ajouter un document"}
          <input type="file" onChange={upload} className="hidden" disabled={uploading} />
        </label>
      )}
      <div className="mt-6 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun document.</p>
        ) : (
          items.map((d) => (
            <button
              key={d.id}
              onClick={() => download(d)}
              className="flex w-full items-center justify-between rounded-xl border border-line bg-surface-elevated p-4 text-left hover:bg-background/50"
            >
              <div>
                <p className="text-sm font-medium text-ink">{d.file_name}</p>
                <p className="text-xs text-ink-muted">
                  {new Date(d.created_at).toLocaleDateString("fr-FR")}
                  {d.file_size ? ` · ${(d.file_size / 1024).toFixed(0)} Ko` : ""}
                </p>
              </div>
              <span className="text-xs text-ink-muted">Télécharger →</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------- DOSSIERS -------------------- */

function DossiersTab({ client }: { client: Client }) {
  const { user, role } = useAuth();
  const canCreate = role === "admin" || role === "mandataire" || role === "prescripteur";
  const [items, setItems] = useState<Dossier[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    const filters: string[] = [`client_id.eq.${client.id}`];
    if (client.email) filters.push(`client_email.eq.${client.email}`);
    filters.push(`client_nom.ilike.%${client.nom}%`);
    const { data } = await supabase
      .from("dossiers")
      .select("id,reference,statut,capital,economie_estimee,created_at")
      .or(filters.join(","))
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Dossier[]);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  return (
    <div>
      {canCreate && (
        <button
          onClick={() => setShowForm((v) => !v)}
          className="mb-4 rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {showForm ? "Annuler" : "Nouveau dossier"}
        </button>
      )}

      {showForm && canCreate && (
        <NewDossierForm
          userId={user!.id}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
          presetClient={{
            id: client.id,
            prenom: client.prenom,
            nom: client.nom,
            email: client.email,
            mobile: client.mobile,
            telephone: client.telephone,
            fumeur: client.fumeur,
          }}
        />
      )}

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">Aucun dossier lié à ce client.</p>
      ) : (
        <div className="space-y-2">
          {items.map((d) => (
            <Link
              key={d.id}
              to="/espace/dossiers/$id"
              params={{ id: d.id }}
              className="flex items-center justify-between rounded-xl border border-line bg-surface-elevated p-4 hover:bg-background/50"
            >
              <div>
                <p className="font-mono text-xs text-ink-muted">{d.reference}</p>
                <p className="text-sm text-ink">{d.statut}</p>
              </div>
              <div className="text-right text-sm">
                <p className="text-ink">{d.capital ? Number(d.capital).toLocaleString("fr-FR") + " €" : "—"}</p>
                <p className="text-xs text-ink-muted">
                  Éco. {d.economie_estimee ? Number(d.economie_estimee).toLocaleString("fr-FR") + " €" : "—"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
