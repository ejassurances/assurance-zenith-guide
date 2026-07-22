import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ============ FAMILLE (Conjoint + Enfants) ============ */

type Conjoint = {
  id?: string;
  client_id: string;
  nom: string | null;
  prenom: string | null;
  date_naissance: string | null;
  profession: string | null;
  fumeur: boolean;
  notes: string | null;
};

type Enfant = {
  id: string;
  client_id: string;
  prenom: string;
  date_naissance: string | null;
  a_charge: boolean;
  notes: string | null;
};

export function FamilleTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const [conjoint, setConjoint] = useState<Conjoint | null>(null);
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [editingC, setEditingC] = useState(false);
  const [savingC, setSavingC] = useState(false);
  const [showEnfantForm, setShowEnfantForm] = useState(false);
  const [enfantForm, setEnfantForm] = useState({ prenom: "", date_naissance: "", a_charge: true });

  const load = async () => {
    const [c, e] = await Promise.all([
      supabase.from("client_conjoint").select("*").eq("client_id", clientId).maybeSingle(),
      supabase.from("client_enfants").select("*").eq("client_id", clientId).order("date_naissance", { ascending: true, nullsFirst: false }),
    ]);
    setConjoint((c.data as Conjoint | null) ?? null);
    setEnfants((e.data ?? []) as Enfant[]);
  };
  useEffect(() => {
    load();
  }, [clientId]);

  const emptyConjoint: Conjoint = {
    client_id: clientId,
    nom: "",
    prenom: "",
    date_naissance: null,
    profession: "",
    fumeur: false,
    notes: "",
  };
  const [formC, setFormC] = useState<Conjoint>(emptyConjoint);

  useEffect(() => {
    setFormC(conjoint ?? emptyConjoint);
  }, [conjoint, clientId]);

  const saveConjoint = async () => {
    setSavingC(true);
    if (conjoint?.id) {
      const { id, ...rest } = formC;
      void id;
      await supabase.from("client_conjoint").update(rest).eq("id", conjoint.id);
    } else {
      await supabase.from("client_conjoint").insert({ ...formC, client_id: clientId });
    }
    setSavingC(false);
    setEditingC(false);
    load();
  };
  const deleteConjoint = async () => {
    if (!conjoint?.id) return;
    await supabase.from("client_conjoint").delete().eq("id", conjoint.id);
    load();
  };

  const addEnfant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enfantForm.prenom.trim()) return;
    await supabase.from("client_enfants").insert({
      client_id: clientId,
      prenom: enfantForm.prenom,
      date_naissance: enfantForm.date_naissance || null,
      a_charge: enfantForm.a_charge,
    });
    setEnfantForm({ prenom: "", date_naissance: "", a_charge: true });
    setShowEnfantForm(false);
    load();
  };
  const deleteEnfant = async (id: string) => {
    await supabase.from("client_enfants").delete().eq("id", id);
    load();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Conjoint">
        {editingC && canEdit ? (
          <div className="grid gap-2">
            {F("Prénom", formC.prenom ?? "", (v) => setFormC({ ...formC, prenom: v }))}
            {F("Nom", formC.nom ?? "", (v) => setFormC({ ...formC, nom: v }))}
            {F("Date de naissance", formC.date_naissance ?? "", (v) => setFormC({ ...formC, date_naissance: v || null }), "date")}
            {F("Profession", formC.profession ?? "", (v) => setFormC({ ...formC, profession: v }))}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formC.fumeur} onChange={(e) => setFormC({ ...formC, fumeur: e.target.checked })} />
              Fumeur
            </label>
            <textarea
              placeholder="Notes"
              value={formC.notes ?? ""}
              onChange={(e) => setFormC({ ...formC, notes: e.target.value })}
              rows={2}
              className="rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={saveConjoint} disabled={savingC} className="rounded-full bg-ink px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-60">
                {savingC ? "…" : "Enregistrer"}
              </button>
              <button onClick={() => setEditingC(false)} className="rounded-full border border-line px-4 py-1.5 text-sm">
                Annuler
              </button>
              {conjoint?.id && (
                <button onClick={deleteConjoint} className="ml-auto text-xs text-red-600 hover:underline">
                  Supprimer
                </button>
              )}
            </div>
          </div>
        ) : conjoint ? (
          <div className="grid gap-2">
            <Row label="Prénom" value={conjoint.prenom} />
            <Row label="Nom" value={conjoint.nom} />
            <Row label="Naissance" value={conjoint.date_naissance} />
            <Row label="Profession" value={conjoint.profession} />
            <Row label="Fumeur" value={conjoint.fumeur ? "Oui" : "Non"} />
            {conjoint.notes && <Row label="Notes" value={conjoint.notes} />}
            {canEdit && (
              <button onClick={() => setEditingC(true)} className="mt-2 self-start rounded-full border border-line px-3 py-1 text-xs">
                Modifier
              </button>
            )}
          </div>
        ) : (
          canEdit && (
            <button onClick={() => setEditingC(true)} className="rounded-full border border-line px-3 py-1.5 text-sm">
              + Ajouter un conjoint
            </button>
          )
        )}
      </Section>

      <Section title={`Enfants (${enfants.length})`}>
        {canEdit && (
          <button onClick={() => setShowEnfantForm((v) => !v)} className="mb-3 self-start rounded-full border border-line px-3 py-1 text-xs">
            {showEnfantForm ? "Annuler" : "+ Ajouter un enfant"}
          </button>
        )}
        {showEnfantForm && (
          <form onSubmit={addEnfant} className="mb-4 grid gap-2 rounded-lg border border-line bg-background p-3">
            <input
              required
              placeholder="Prénom *"
              value={enfantForm.prenom}
              onChange={(e) => setEnfantForm({ ...enfantForm, prenom: e.target.value })}
              className="rounded-md border border-line bg-surface-elevated px-3 py-1.5 text-sm"
            />
            <input
              type="date"
              value={enfantForm.date_naissance}
              onChange={(e) => setEnfantForm({ ...enfantForm, date_naissance: e.target.value })}
              className="rounded-md border border-line bg-surface-elevated px-3 py-1.5 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enfantForm.a_charge}
                onChange={(e) => setEnfantForm({ ...enfantForm, a_charge: e.target.checked })}
              />
              À charge
            </label>
            <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-primary-foreground">Ajouter</button>
          </form>
        )}
        {enfants.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun enfant renseigné.</p>
        ) : (
          <ul className="space-y-2">
            {enfants.map((en) => (
              <li key={en.id} className="flex items-center justify-between rounded-lg border border-line bg-background px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-ink">{en.prenom}</p>
                  <p className="text-xs text-ink-muted">
                    {en.date_naissance ? new Date(en.date_naissance).toLocaleDateString("fr-FR") : "—"}
                    {en.a_charge ? " · à charge" : ""}
                  </p>
                </div>
                {canEdit && (
                  <button onClick={() => deleteEnfant(en.id)} className="text-xs text-red-600 hover:underline">
                    Suppr.
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ============ ENTREPRISE ============ */

type Entreprise = {
  id?: string;
  client_id: string;
  raison_sociale: string | null;
  siret: string | null;
  code_ape: string | null;
  forme_juridique: string | null;
  effectif: number | null;
  chiffre_affaires: number | null;
  date_creation: string | null;
  notes: string | null;
};

export function EntrepriseTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [editing, setEditing] = useState(false);
  const empty: Entreprise = {
    client_id: clientId,
    raison_sociale: "",
    siret: "",
    code_ape: "",
    forme_juridique: "",
    effectif: null,
    chiffre_affaires: null,
    date_creation: null,
    notes: "",
  };
  const [form, setForm] = useState<Entreprise>(empty);

  const load = async () => {
    const { data } = await supabase.from("client_entreprise").select("*").eq("client_id", clientId).maybeSingle();
    setEntreprise((data as Entreprise | null) ?? null);
  };
  useEffect(() => {
    load();
  }, [clientId]);
  useEffect(() => {
    setForm(entreprise ?? empty);
  }, [entreprise, clientId]);

  const save = async () => {
    if (entreprise?.id) {
      const { id, ...rest } = form;
      void id;
      await supabase.from("client_entreprise").update(rest).eq("id", entreprise.id);
    } else {
      await supabase.from("client_entreprise").insert({ ...form, client_id: clientId });
    }
    setEditing(false);
    load();
  };
  const remove = async () => {
    if (!entreprise?.id) return;
    await supabase.from("client_entreprise").delete().eq("id", entreprise.id);
    load();
  };

  if (editing && canEdit) {
    return (
      <Section title="Entreprise">
        <div className="grid gap-3 md:grid-cols-2">
          {F("Raison sociale", form.raison_sociale ?? "", (v) => setForm({ ...form, raison_sociale: v }))}
          {F("SIRET", form.siret ?? "", (v) => setForm({ ...form, siret: v }))}
          {F("Code APE", form.code_ape ?? "", (v) => setForm({ ...form, code_ape: v }))}
          {F("Forme juridique", form.forme_juridique ?? "", (v) => setForm({ ...form, forme_juridique: v }))}
          {F("Effectif", form.effectif != null ? String(form.effectif) : "", (v) => setForm({ ...form, effectif: v ? Number(v) : null }), "number")}
          {F("Chiffre d'affaires (€)", form.chiffre_affaires != null ? String(form.chiffre_affaires) : "", (v) => setForm({ ...form, chiffre_affaires: v ? Number(v) : null }), "number")}
          {F("Date de création", form.date_creation ?? "", (v) => setForm({ ...form, date_creation: v || null }), "date")}
        </div>
        <textarea
          placeholder="Notes"
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          className="mt-3 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex gap-2">
          <button onClick={save} className="rounded-full bg-ink px-4 py-1.5 text-sm text-primary-foreground">
            Enregistrer
          </button>
          <button onClick={() => setEditing(false)} className="rounded-full border border-line px-4 py-1.5 text-sm">
            Annuler
          </button>
          {entreprise?.id && (
            <button onClick={remove} className="ml-auto text-xs text-red-600 hover:underline">
              Supprimer
            </button>
          )}
        </div>
      </Section>
    );
  }

  return (
    <Section title="Entreprise">
      {entreprise ? (
        <>
          <div className="grid gap-2 md:grid-cols-2">
            <Row label="Raison sociale" value={entreprise.raison_sociale} />
            <Row label="SIRET" value={entreprise.siret} />
            <Row label="Code APE" value={entreprise.code_ape} />
            <Row label="Forme juridique" value={entreprise.forme_juridique} />
            <Row label="Effectif" value={entreprise.effectif} />
            <Row label="CA" value={entreprise.chiffre_affaires ? entreprise.chiffre_affaires.toLocaleString("fr-FR") + " €" : null} />
            <Row label="Date création" value={entreprise.date_creation} />
          </div>
          {entreprise.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{entreprise.notes}</p>}
          {canEdit && (
            <button onClick={() => setEditing(true)} className="mt-3 rounded-full border border-line px-3 py-1 text-xs">
              Modifier
            </button>
          )}
        </>
      ) : canEdit ? (
        <button onClick={() => setEditing(true)} className="rounded-full border border-line px-3 py-1.5 text-sm">
          + Renseigner l'entreprise
        </button>
      ) : (
        <p className="text-sm text-ink-muted">Aucune entreprise renseignée.</p>
      )}
    </Section>
  );
}

/* ============ ÉQUIPEMENTS ============ */

type Equipement = {
  id: string;
  client_id: string;
  type: string;
  libelle: string;
  valeur: number | null;
  date_acquisition: string | null;
  notes: string | null;
};

const EQUIPEMENT_TYPES = ["auto", "moto", "immobilier", "animal", "do", "autre"];

export function EquipementsTab({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const [items, setItems] = useState<Equipement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "auto", libelle: "", valeur: "", date_acquisition: "", notes: "" });

  const load = async () => {
    const { data } = await supabase
      .from("client_equipements")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Equipement[]);
  };
  useEffect(() => {
    load();
  }, [clientId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.libelle.trim()) return;
    await supabase.from("client_equipements").insert({
      client_id: clientId,
      type: form.type,
      libelle: form.libelle,
      valeur: form.valeur ? Number(form.valeur) : null,
      date_acquisition: form.date_acquisition || null,
      notes: form.notes || null,
    });
    setForm({ type: "auto", libelle: "", valeur: "", date_acquisition: "", notes: "" });
    setShowForm(false);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("client_equipements").delete().eq("id", id);
    load();
  };

  return (
    <div>
      {canEdit && (
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {showForm ? "Annuler" : "Nouvel équipement"}
        </button>
      )}
      {showForm && (
        <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface-elevated p-5 sm:grid-cols-2">
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          >
            {EQUIPEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Libellé *"
            value={form.libelle}
            onChange={(e) => setForm({ ...form, libelle: e.target.value })}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Valeur (€)"
            value={form.valeur}
            onChange={(e) => setForm({ ...form, valeur: e.target.value })}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={form.date_acquisition}
            onChange={(e) => setForm({ ...form, date_acquisition: e.target.value })}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:col-span-2"
          />
          <button className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2">
            Ajouter
          </button>
        </form>
      )}

      <div className="mt-6 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun équipement.</p>
        ) : (
          items.map((eq) => (
            <div key={eq.id} className="flex items-start justify-between rounded-xl border border-line bg-surface-elevated p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs uppercase tracking-wide text-ink-muted">
                    {eq.type}
                  </span>
                  <p className="text-sm font-medium text-ink">{eq.libelle}</p>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {eq.valeur ? Number(eq.valeur).toLocaleString("fr-FR") + " €" : "—"}
                  {eq.date_acquisition ? ` · acquis le ${new Date(eq.date_acquisition).toLocaleDateString("fr-FR")}` : ""}
                </p>
                {eq.notes && <p className="mt-1 text-sm text-ink-soft">{eq.notes}</p>}
              </div>
              {canEdit && (
                <button onClick={() => remove(eq.id)} className="text-xs text-red-600 hover:underline">
                  Suppr.
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============ Shared UI helpers ============ */

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
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
function F(label: string, value: string, onChange: (v: string) => void, type: "text" | "date" | "number" | "email" = "text") {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
