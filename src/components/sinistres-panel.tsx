import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BRANCHES_SINISTRE,
  ETAPES_SINISTRE,
  indexEtapeSinistre,
  labelEtapeSinistre,
  piecesPourBranche,
  type EtapeSinistre,
} from "@/lib/sinistres-referentiel";

type Sinistre = {
  id: string;
  reference: string | null;
  branche: string | null;
  type: string | null;
  description: string | null;
  date_survenance: string | null;
  montant: number | null;
  montant_indemnise: number | null;
  numero_compagnie: string | null;
  etape: string;
  statut: string | null;
  declare_par_client: boolean;
  declare_le: string | null;
  declare_compagnie_le: string | null;
  clos_le: string | null;
  created_at: string;
};

type Piece = {
  id: string;
  code: string;
  libelle: string;
  obligatoire: boolean;
  statut: string;
  storage_path: string | null;
  nom_fichier: string | null;
};

type Evenement = {
  id: string;
  type: string;
  ancienne_etape: string | null;
  nouvelle_etape: string | null;
  contenu: string | null;
  created_at: string;
};

const BUCKET = "dossier-documents";

/**
 * Suivi des sinistres d'un client : déclaration, collecte des pièces,
 * expertise, indemnisation puis clôture.
 * `mode="client"` limite l'interface à la déclaration et au dépôt de pièces.
 */
export function SinistresPanel({
  clientId,
  mode,
  canEdit = true,
}: {
  clientId: string;
  mode: "staff" | "client";
  canEdit?: boolean;
}) {
  const staff = mode === "staff";
  const [sinistres, setSinistres] = useState<Sinistre[]>([]);
  const [contrats, setContrats] = useState<{ id: string; numero: string | null; produit: string | null }[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creation, setCreation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, c] = await Promise.all([
      supabase
        .from("sinistres")
        .select(
          "id, reference, branche, type, description, date_survenance, montant, montant_indemnise, numero_compagnie, etape, statut, declare_par_client, declare_le, declare_compagnie_le, clos_le, created_at",
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase.from("contrats").select("id, numero, produit").eq("client_id", clientId).limit(50),
    ]);
    setSinistres((s.data as Sinistre[] | null) ?? []);
    setContrats((c.data as typeof contrats | null) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [clientId]);

  if (loading) return <p className="text-sm text-ink-muted">Chargement…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Sinistres</h2>
          <p className="text-sm text-ink-muted">
            {staff
              ? "Déclaration, pièces, expertise, indemnisation et clôture."
              : "Déclarez un sinistre et déposez les justificatifs demandés."}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setCreation((v) => !v)}
            className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface"
          >
            {creation ? "Annuler" : "Déclarer un sinistre"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {creation && canEdit && (
        <FormulaireSinistre
          clientId={clientId}
          contrats={contrats}
          declareParClient={!staff}
          onCancel={() => setCreation(false)}
          onCreated={async (id) => {
            setCreation(false);
            await load();
            setSelection(id);
          }}
          onError={setError}
        />
      )}

      {sinistres.length === 0 && !creation && (
        <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-muted">
          Aucun sinistre enregistré.
        </p>
      )}

      {sinistres.map((s) => (
        <article key={s.id} className="rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-ink">
                {s.type || "Sinistre"} ·{" "}
                <span className="font-mono text-xs text-ink-muted">{s.reference}</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {BRANCHES_SINISTRE.find((b) => b.value === s.branche)?.label ?? s.branche ?? "Branche non précisée"}
                {s.date_survenance
                  ? ` · survenu le ${new Date(s.date_survenance).toLocaleDateString("fr-FR")}`
                  : ""}
                {s.declare_par_client ? " · déclaré par le client" : ""}
              </p>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink">
              {labelEtapeSinistre(s.etape)}
            </span>
          </div>

          <EtapierSinistre etape={s.etape} />

          {s.description && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{s.description}</p>}

          <dl className="mt-3 grid gap-3 text-xs text-ink-muted sm:grid-cols-3">
            <div>
              <dt>Montant estimé</dt>
              <dd className="text-ink">{s.montant != null ? `${s.montant.toLocaleString("fr-FR")} €` : "—"}</dd>
            </div>
            <div>
              <dt>Indemnisation</dt>
              <dd className="text-ink">
                {s.montant_indemnise != null ? `${s.montant_indemnise.toLocaleString("fr-FR")} €` : "—"}
              </dd>
            </div>
            <div>
              <dt>N° compagnie</dt>
              <dd className="text-ink">{s.numero_compagnie || "—"}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={() => setSelection(selection === s.id ? null : s.id)}
            className="mt-4 text-sm underline"
          >
            {selection === s.id ? "Masquer le détail" : "Pièces et suivi"}
          </button>

          {selection === s.id && (
            <div className="mt-4 space-y-5 border-t border-line pt-4">
              <PiecesSinistre
                sinistreId={s.id}
                clientId={clientId}
                branche={s.branche}
                canEdit={canEdit}
                onError={setError}
              />
              {staff && (
                <GestionStaff sinistre={s} onError={setError} onChanged={load} />
              )}
              <JournalSinistre sinistreId={s.id} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function EtapierSinistre({ etape }: { etape: string }) {
  const courant = indexEtapeSinistre(etape);
  const parcours = ETAPES_SINISTRE.filter((e) => !e.horsParcours);
  if (etape === "refuse") {
    return (
      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
        Prise en charge refusée par la compagnie.
      </p>
    );
  }
  return (
    <ol className="mt-3 flex flex-wrap gap-2">
      {parcours.map((e, i) => (
        <li
          key={e.key}
          className={
            "rounded-full px-3 py-1 text-xs " +
            (i <= courant ? "bg-ink text-surface" : "border border-line text-ink-muted")
          }
          title={e.description}
        >
          {e.label}
        </li>
      ))}
    </ol>
  );
}

function FormulaireSinistre({
  clientId,
  contrats,
  declareParClient,
  onCancel,
  onCreated,
  onError,
}: {
  clientId: string;
  contrats: { id: string; numero: string | null; produit: string | null }[];
  declareParClient: boolean;
  onCancel: () => void;
  onCreated: (id: string) => void;
  onError: (m: string | null) => void;
}) {
  const [form, setForm] = useState({
    branche: "emprunteur",
    contrat_id: "",
    type: "",
    date_survenance: "",
    description: "",
    montant: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    onError(null);
    if (!form.type.trim() || !form.date_survenance) {
      onError("Renseignez la nature du sinistre et sa date de survenance.");
      return;
    }
    if (!form.contrat_id) {
      onError("Sélectionnez le contrat concerné par le sinistre.");
      return;
    }
    setBusy(true);
    try {
      // La référence officielle EJ-AAAA-SIN-XXXX est générée par la base.
      const { data, error } = await supabase
        .from("sinistres")
        .insert({
          client_id: clientId,
          contrat_id: form.contrat_id,

          branche: form.branche,
          type: form.type.trim(),
          date_survenance: form.date_survenance,
          description: form.description.trim() || null,
          montant: form.montant ? Number(form.montant) : null,
          etape: "declare",
          statut: "ouvert",
          declare_le: new Date().toISOString(),
          declare_par_client: declareParClient,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const pieces = piecesPourBranche(form.branche).map((p) => ({
        sinistre_id: data.id,
        code: p.code,
        libelle: p.libelle,
        obligatoire: p.obligatoire,
        statut: "manquante",
      }));
      if (pieces.length) await supabase.from("sinistre_pieces").insert(pieces);

      onCreated(data.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-elevated p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ink-muted">
          Branche
          <select
            value={form.branche}
            onChange={(e) => setForm({ ...form, branche: e.target.value })}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            {BRANCHES_SINISTRE.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-muted">
          Contrat concerné
          <select
            value={form.contrat_id}
            onChange={(e) => setForm({ ...form, contrat_id: e.target.value })}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">—</option>
            {contrats.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.numero, c.produit].filter(Boolean).join(" — ") || c.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-muted">
          Nature du sinistre
          <input
            type="text"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            placeholder="Arrêt de travail, dégât des eaux…"
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink-muted">
          Date de survenance
          <input
            type="date"
            value={form.date_survenance}
            onChange={(e) => setForm({ ...form, date_survenance: e.target.value })}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink-muted">
          Montant estimé (€)
          <input
            type="number"
            min="0"
            value={form.montant}
            onChange={(e) => setForm({ ...form, montant: e.target.value })}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>
      <label className="block text-xs text-ink-muted">
        Circonstances
        <textarea
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : "Enregistrer la déclaration"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3 py-2 text-sm">
          Annuler
        </button>
      </div>
    </div>
  );
}

function PiecesSinistre({
  sinistreId,
  clientId,
  branche,
  canEdit,
  onError,
}: {
  sinistreId: string;
  clientId: string;
  branche: string | null;
  canEdit: boolean;
  onError: (m: string | null) => void;
}) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("sinistre_pieces")
      .select("id, code, libelle, obligatoire, statut, storage_path, nom_fichier")
      .eq("sinistre_id", sinistreId)
      .order("obligatoire", { ascending: false })
      .order("libelle");
    setPieces((data as Piece[] | null) ?? []);
  };

  useEffect(() => {
    load();
  }, [sinistreId]);

  const initialiser = async () => {
    const attendues = piecesPourBranche(branche);
    const existantes = new Set(pieces.map((p) => p.code));
    const nouvelles = attendues
      .filter((p) => !existantes.has(p.code))
      .map((p) => ({
        sinistre_id: sinistreId,
        code: p.code,
        libelle: p.libelle,
        obligatoire: p.obligatoire,
        statut: "manquante",
      }));
    if (!nouvelles.length) return;
    const { error } = await supabase.from("sinistre_pieces").insert(nouvelles);
    if (error) onError(error.message);
    await load();
  };

  const televerser = async (piece: Piece, file: File) => {
    setBusy(piece.id);
    onError(null);
    try {
      const chemin = `${clientId}/sinistres/${sinistreId}/${piece.code}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(chemin, file, { upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { error } = await supabase
        .from("sinistre_pieces")
        .update({
          statut: "recue",
          storage_path: chemin,
          nom_fichier: file.name,
          mime_type: file.type || null,
          taille: file.size,
        })
        .eq("id", piece.id);
      if (error) throw new Error(error.message);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Téléversement impossible");
    } finally {
      setBusy(null);
    }
  };

  const telecharger = async (piece: Piece) => {
    if (!piece.storage_path) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(piece.storage_path, 300);
    if (error || !data) {
      onError("Téléchargement impossible");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Pièces justificatives</h3>
        {canEdit && (
          <button type="button" onClick={initialiser} className="text-xs underline text-ink-muted">
            Ajouter les pièces attendues
          </button>
        )}
      </div>
      {pieces.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Aucune pièce listée pour ce sinistre.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {pieces.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span className="text-sm text-ink">
                {p.libelle}
                {p.obligatoire && <span className="ml-1 text-red-600">*</span>}
                <span className="ml-2 text-xs text-ink-muted">
                  {p.statut === "recue" ? "reçue" : p.statut === "refusee" ? "à refaire" : "manquante"}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {p.storage_path && (
                  <button type="button" onClick={() => telecharger(p)} className="text-xs underline">
                    Voir
                  </button>
                )}
                {canEdit && (
                  <label className="cursor-pointer text-xs underline">
                    {busy === p.id ? "Envoi…" : p.storage_path ? "Remplacer" : "Déposer"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) televerser(p, f);
                      }}
                    />
                  </label>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GestionStaff({
  sinistre,
  onError,
  onChanged,
}: {
  sinistre: Sinistre;
  onError: (m: string | null) => void;
  onChanged: () => void;
}) {
  const [numero, setNumero] = useState(sinistre.numero_compagnie ?? "");
  const [indemnise, setIndemnise] = useState(
    sinistre.montant_indemnise != null ? String(sinistre.montant_indemnise) : "",
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const journaliser = async (
    type: "etape" | "note" | "echange_compagnie",
    contenu: string,
    ancienne?: string,
    nouvelle?: string,
  ) => {
    await supabase.from("sinistre_evenements").insert({
      sinistre_id: sinistre.id,
      type,
      contenu,
      ancienne_etape: ancienne ?? null,
      nouvelle_etape: nouvelle ?? null,
    });
  };

  const changerEtape = async (etape: EtapeSinistre) => {
    setBusy(true);
    onError(null);
    try {
      const cloture = etape === "clos" || etape === "refuse";
      const patch = {
        etape,
        declare_compagnie_le:
          etape === "expertise" ? new Date().toISOString() : sinistre.declare_compagnie_le,
        clos_le: cloture ? new Date().toISOString() : null,
        statut: cloture ? (etape === "clos" ? "clos" : "refuse") : "ouvert",
      };
      const { error } = await supabase.from("sinistres").update(patch).eq("id", sinistre.id);
      if (error) throw new Error(error.message);
      await journaliser(
        "etape",
        `Passage à l'étape « ${labelEtapeSinistre(etape)} »`,
        sinistre.etape,
        etape,
      );
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Changement d'étape impossible");
    } finally {
      setBusy(false);
    }
  };

  const enregistrer = async () => {
    setBusy(true);
    onError(null);
    try {
      const { error } = await supabase
        .from("sinistres")
        .update({
          numero_compagnie: numero.trim() || null,
          montant_indemnise: indemnise ? Number(indemnise) : null,
        })
        .eq("id", sinistre.id);
      if (error) throw new Error(error.message);
      await journaliser(
        "echange_compagnie",
        `Suivi compagnie mis à jour${numero ? ` — n° ${numero}` : ""}${indemnise ? ` — indemnisation ${indemnise} €` : ""}`,
      );
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  const ajouterNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    await journaliser("note", note.trim());
    setNote("");
    setBusy(false);
    onChanged();
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink">Gestion cabinet</h3>
      <div className="flex flex-wrap gap-2">
        {ETAPES_SINISTRE.filter((e) => e.key !== sinistre.etape).map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => changerEtape(e.key)}
            disabled={busy}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-surface-elevated disabled:opacity-50"
            title={e.description}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ink-muted">
          N° de sinistre compagnie
          <input
            type="text"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink-muted">
          Montant indemnisé (€)
          <input
            type="number"
            min="0"
            value={indemnise}
            onChange={(e) => setIndemnise(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={enregistrer}
          disabled={busy}
          className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-surface disabled:opacity-50"
        >
          Enregistrer le suivi
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grow text-xs text-ink-muted">
          Note de gestion
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
        </label>
        <button
          type="button"
          onClick={ajouterNote}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

function JournalSinistre({ sinistreId }: { sinistreId: string }) {
  const [events, setEvents] = useState<Evenement[]>([]);

  useEffect(() => {
    supabase
      .from("sinistre_evenements")
      .select("id, type, ancienne_etape, nouvelle_etape, contenu, created_at")
      .eq("sinistre_id", sinistreId)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => setEvents((data as Evenement[] | null) ?? []));
  }, [sinistreId]);

  if (!events.length) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">Journal du sinistre</h3>
      <ul className="mt-2 space-y-2">
        {events.map((e) => (
          <li key={e.id} className="text-xs text-ink-muted">
            <span className="font-mono">{new Date(e.created_at).toLocaleString("fr-FR")}</span> ·{" "}
            <span className="text-ink">{e.contenu}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
