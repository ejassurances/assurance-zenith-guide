import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { monFichierUrl } from "@/lib/espace-client.functions";
import {
  CATEGORIE_LABEL,
  STATUT_PIECE_LABEL,
  toutesPiecesConnues,
  type CategoriePiece,
} from "@/lib/pieces-requises";


type Piece = {
  id: string;
  code: string;
  libelle: string;
  categorie: string;
  obligatoire: boolean;
  statut: string;
  recue_le: string | null;
  document_id: string | null;
  kyc_document_id: string | null;
};

const KYC_TYPES: Record<string, "cni" | "justificatif_domicile" | "rib"> = {
  cni: "cni",
  justificatif_domicile: "justificatif_domicile",
  rib: "rib",
};

const STATUT_STYLE: Record<string, string> = {
  manquante: "border-amber-300 bg-amber-50 text-amber-800",
  recue: "border-sky-300 bg-sky-50 text-sky-800",
  validee: "border-emerald-300 bg-emerald-50 text-emerald-800",
  refusee: "border-red-300 bg-red-50 text-red-800",
};

const CATALOGUE = toutesPiecesConnues();

function slug(txt: string) {
  return (
    txt
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "autre"
  );
}

export function DossierPiecesPanel({
  dossierId,
  clientId,
  canValidate = false,
}: {
  dossierId: string;
  clientId: string | null;
  canValidate?: boolean;
}) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [expirations, setExpirations] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [precision, setPrecision] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const fichierUrl = useServerFn(monFichierUrl);
  const [telechargement, setTelechargement] = useState<string | null>(null);

  /** Ouvre le fichier déjà déposé (KYC ou document) via une URL signée. */
  async function telecharger(piece: Piece) {
    const source: "kyc" | "document" = piece.document_id ? "document" : "kyc";
    const id = piece.document_id ?? piece.kyc_document_id;
    if (!id) return;
    setTelechargement(piece.id);
    setError(null);
    try {
      const res = await fichierUrl({ data: { source, id } });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Téléchargement impossible");
    }
    setTelechargement(null);
  }


  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("dossier_pieces_requises")
      .select("id,code,libelle,categorie,obligatoire,statut,recue_le,document_id,kyc_document_id")
      .eq("dossier_id", dossierId)
      .order("categorie")
      .order("libelle");
    if (err) setError(err.message);
    const rows = (data ?? []) as Piece[];
    setPieces(rows);

    const docIds = rows.map((p) => p.document_id).filter(Boolean) as string[];
    const kycIds = rows.map((p) => p.kyc_document_id).filter(Boolean) as string[];
    const map: Record<string, string | null> = {};
    if (docIds.length > 0) {
      const { data: docs } = await supabase.from("documents").select("id,date_expiration").in("id", docIds);
      for (const d of (docs ?? []) as { id: string; date_expiration: string | null }[]) {
        map[`doc:${d.id}`] = d.date_expiration;
      }
    }
    if (kycIds.length > 0) {
      const { data: kyc } = await supabase
        .from("client_kyc_documents")
        .select("id,date_expiration")
        .in("id", kycIds);
      for (const d of (kyc ?? []) as { id: string; date_expiration: string | null }[]) {
        map[`kyc:${d.id}`] = d.date_expiration;
      }
    }
    setExpirations(map);
    setLoading(false);
  }, [dossierId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(piece: Piece, file: File) {
    if (!clientId) {
      setError("Fiche client introuvable — impossible de rattacher la pièce.");
      return;
    }
    setBusy(piece.id);
    setError(null);
    const kycType = KYC_TYPES[piece.code];
    const bucket = kycType ? "conformite-documents" : "dossier-documents";
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
    const path = `${clientId}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (upErr) {
      setBusy(null);
      setError(upErr.message);
      return;
    }

    if (kycType) {
      const { data: kyc, error: kErr } = await supabase
        .from("client_kyc_documents")
        .insert({ client_id: clientId, type: kycType, nom: file.name, storage_path: path, statut: "a_valider" } as never)
        .select("id")
        .single();
      if (kErr) {
        setBusy(null);
        setError(kErr.message);
        return;
      }
      await supabase
        .from("dossier_pieces_requises")
        .update({ statut: "recue", recue_le: new Date().toISOString(), kyc_document_id: kyc!.id } as never)
        .eq("id", piece.id);
      // Pièce d'identité : lecture IA + relance automatique du LCB-FT en attente.
      if (kycType === "cni") {
        try {
          await traiterPiece({ data: { kyc_document_id: kyc!.id } });
        } catch (e) {
          console.error("[CNI] lecture automatique impossible", e);
        }
      }
    } else {
      const { data: userRes } = await supabase.auth.getUser();
      const { data: doc, error: dErr } = await supabase
        .from("documents")
        .insert({
          dossier_id: dossierId,
          client_id: clientId,
          uploader_id: userRes.user!.id,
          storage_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
          categorie: piece.categorie,
        } as never)
        .select("id")
        .single();
      if (dErr) {
        setBusy(null);
        setError(dErr.message);
        return;
      }
      await supabase
        .from("dossier_pieces_requises")
        .update({ statut: "recue", recue_le: new Date().toISOString(), document_id: doc!.id } as never)
        .eq("id", piece.id);
    }

    setBusy(null);
    await load();
  }

  async function setStatut(piece: Piece, statut: string) {
    setBusy(piece.id);
    await supabase.from("dossier_pieces_requises").update({ statut } as never).eq("id", piece.id);
    setBusy(null);
    await load();
  }

  /** Classement manuel d'une pièce « à qualifier ». */
  async function classer(piece: Piece) {
    const code = choix[piece.id];
    if (!code) return;
    setBusy(piece.id);
    setError(null);

    if (code === "autre") {
      const libelle = (precision[piece.id] ?? "").trim();
      if (!libelle) {
        setBusy(null);
        setError("Précisez la nature du document.");
        return;
      }
      await supabase
        .from("dossier_pieces_requises")
        .update({ code: `autre_${slug(libelle)}`, libelle, categorie: "dossier" } as never)
        .eq("id", piece.id);
      if (piece.document_id) {
        await supabase.from("documents").update({ categorie: "dossier" } as never).eq("id", piece.document_id);
      }
    } else {
      const cible = CATALOGUE.find((p) => p.code === code);
      if (!cible) {
        setBusy(null);
        return;
      }
      const patch: Record<string, unknown> = {
        code: cible.code,
        libelle: cible.libelle,
        categorie: cible.categorie,
      };

      // Une pièce KYC déposée en tant que document de dossier est rebasculée
      // dans le référentiel de conformité client.
      if (cible.kyc_type && clientId && piece.document_id && !piece.kyc_document_id) {
        const { data: doc } = await supabase
          .from("documents")
          .select("file_name,storage_path")
          .eq("id", piece.document_id)
          .maybeSingle();
        if (doc) {
          const { data: kyc } = await supabase
            .from("client_kyc_documents")
            .insert({
              client_id: clientId,
              type: cible.kyc_type,
              nom: (doc as { file_name: string }).file_name,
              storage_path: (doc as { storage_path: string }).storage_path,
              statut: "a_valider",
            } as never)
            .select("id")
            .single();
          if (kyc) patch.kyc_document_id = (kyc as { id: string }).id;
        }
      } else if (piece.document_id) {
        await supabase
          .from("documents")
          .update({ categorie: cible.categorie } as never)
          .eq("id", piece.document_id);
      }

      await supabase.from("dossier_pieces_requises").update(patch as never).eq("id", piece.id);
    }

    setBusy(null);
    await load();
  }

  async function setExpiration(piece: Piece, valeur: string) {
    const date = valeur || null;
    setBusy(piece.id);
    if (piece.kyc_document_id) {
      await supabase
        .from("client_kyc_documents")
        .update({ date_expiration: date, rappel_expiration_envoye_le: null } as never)
        .eq("id", piece.kyc_document_id);
    } else if (piece.document_id) {
      await supabase
        .from("documents")
        .update({ date_expiration: date, rappel_expiration_envoye_le: null } as never)
        .eq("id", piece.document_id);
    }
    setBusy(null);
    await load();
  }

  const manquantes = pieces.filter((p) => p.obligatoire && p.statut === "manquante").length;
  const groupes = ["kyc", "dossier", "contrat", "a_qualifier"].filter((c) => pieces.some((p) => p.categorie === c));

  if (loading) return <p className="text-sm text-ink-muted">Chargement des pièces…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-serif text-lg">Pièces du dossier</h3>
        <span
          className={
            "rounded-full border px-2.5 py-0.5 text-xs font-medium " +
            (manquantes === 0 ? STATUT_STYLE.validee : STATUT_STYLE.manquante)
          }
        >
          {manquantes === 0 ? "Dossier complet" : `${manquantes} pièce(s) obligatoire(s) manquante(s)`}
        </span>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {groupes.map((cat) => (
        <div key={cat} className="rounded-lg border border-line bg-surface">
          <div className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {CATEGORIE_LABEL[cat as CategoriePiece]}
          </div>
          <ul className="divide-y divide-line">
            {pieces
              .filter((p) => p.categorie === cat)
              .map((p) => {
                const cleExp = p.kyc_document_id
                  ? `kyc:${p.kyc_document_id}`
                  : p.document_id
                    ? `doc:${p.document_id}`
                    : null;
                const expiration = cleExp ? (expirations[cleExp] ?? null) : null;
                const expiree = expiration ? new Date(expiration) < new Date() : false;
                return (
                  <li key={p.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">
                          {p.libelle}
                          {p.obligatoire && <span className="ml-1 text-red-600">*</span>}
                        </p>
                        {p.recue_le && (
                          <p className="text-xs text-ink-muted">
                            Reçue le {new Date(p.recue_le).toLocaleDateString("fr-FR")}
                            {expiration && (
                              <span className={expiree ? "text-red-700" : ""}>
                                {" · "}
                                {expiree ? "Expirée le " : "Valide jusqu'au "}
                                {new Date(expiration).toLocaleDateString("fr-FR")}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "rounded-full border px-2 py-0.5 text-xs " + (STATUT_STYLE[p.statut] ?? STATUT_STYLE.manquante)
                          }
                        >
                          {STATUT_PIECE_LABEL[p.statut] ?? p.statut}
                        </span>
                        {(p.document_id || p.kyc_document_id) && (
                          <button
                            onClick={() => void telecharger(p)}
                            disabled={telechargement === p.id}
                            className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-background disabled:opacity-60"
                          >
                            {telechargement === p.id ? "Ouverture…" : "Télécharger"}
                          </button>
                        )}
                        {canValidate && p.statut === "recue" && (
                          <>
                            <button
                              onClick={() => setStatut(p, "validee")}
                              disabled={busy === p.id}
                              className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-background"
                            >
                              Valider
                            </button>
                            <button
                              onClick={() => setStatut(p, "refusee")}
                              disabled={busy === p.id}
                              className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-background"
                            >
                              Refuser
                            </button>
                          </>
                        )}
                        {p.statut !== "validee" && (
                          <>
                            <input
                              ref={(el) => {
                                inputs.current[p.id] = el;
                              }}
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void upload(p, f);
                                e.target.value = "";
                              }}
                            />
                            <button
                              onClick={() => inputs.current[p.id]?.click()}
                              disabled={busy === p.id}
                              className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
                            >
                              {busy === p.id ? "Envoi…" : p.statut === "manquante" ? "Déposer" : "Remplacer"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Classement manuel des pièces non identifiées */}
                    {canValidate && p.categorie === "a_qualifier" && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line bg-background px-3 py-2">
                        <label className="text-xs text-ink-muted">Nature du document</label>
                        <select
                          value={choix[p.id] ?? ""}
                          onChange={(e) => setChoix((s) => ({ ...s, [p.id]: e.target.value }))}
                          className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
                        >
                          <option value="">Sélectionner…</option>
                          {CATALOGUE.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.libelle}
                            </option>
                          ))}
                          <option value="autre">Autre (préciser)</option>
                        </select>
                        {choix[p.id] === "autre" && (
                          <input
                            type="text"
                            placeholder="Préciser la nature du document"
                            value={precision[p.id] ?? ""}
                            onChange={(e) => setPrecision((s) => ({ ...s, [p.id]: e.target.value }))}
                            className="min-w-[220px] flex-1 rounded-md border border-line bg-surface px-2 py-1 text-xs"
                          />
                        )}
                        <button
                          onClick={() => void classer(p)}
                          disabled={busy === p.id || !choix[p.id]}
                          className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
                        >
                          Classer
                        </button>
                      </div>
                    )}

                    {/* Date de fin de validité */}
                    {canValidate && cleExp && (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <label>Fin de validité</label>
                        <input
                          type="date"
                          defaultValue={expiration ?? ""}
                          onChange={(e) => void setExpiration(p, e.target.value)}
                          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                        />
                        <span>Un rappel est envoyé automatiquement 30 jours avant l'échéance.</span>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
