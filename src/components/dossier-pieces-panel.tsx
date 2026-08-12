import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIE_LABEL, STATUT_PIECE_LABEL, type CategoriePiece } from "@/lib/pieces-requises";

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("dossier_pieces_requises")
      .select("id,code,libelle,categorie,obligatoire,statut,recue_le,document_id,kyc_document_id")
      .eq("dossier_id", dossierId)
      .order("categorie")
      .order("libelle");
    if (err) setError(err.message);
    setPieces((data ?? []) as Piece[]);
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
              .map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {p.libelle}
                      {p.obligatoire && <span className="ml-1 text-red-600">*</span>}
                    </p>
                    {p.recue_le && (
                      <p className="text-xs text-ink-muted">
                        Reçue le {new Date(p.recue_le).toLocaleDateString("fr-FR")}
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
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
