import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  THEMES_FORMATION,
  expirationParDefaut,
  type StatutFormation,
} from "@/lib/formations-personnel";

/* Formation du personnel : suivi des formations LCB-FT / RGPD / DDA et attestations. */

type Formation = {
  id: string;
  collaborateur_id: string;
  theme: string;
  date_formation: string;
  date_expiration: string | null;
  attestation_url: string | null;
  statut: StatutFormation;
};

const STATUT_LABEL: Record<StatutFormation, string> = {
  valide: "Valide",
  a_renouveler: "À renouveler",
  expiree: "Expirée",
};

const STATUT_STYLE: Record<StatutFormation, string> = {
  valide: "bg-emerald-100 text-emerald-900 border-emerald-300",
  a_renouveler: "bg-amber-100 text-amber-900 border-amber-300",
  expiree: "bg-red-100 text-red-900 border-red-300",
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export function FormationsPersonnelPanel({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const [formations, setFormations] = useState<Formation[]>([]);
  const [profils, setProfils] = useState<{ id: string; nom: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: p }] = await Promise.all([
      supabase
        .from("formations_personnel")
        .select("id,collaborateur_id,theme,date_formation,date_expiration,attestation_url,statut")
        .order("date_formation", { ascending: false }),
      supabase.from("profiles").select("id,full_name,email"),
    ]);
    setFormations((data as unknown as Formation[]) ?? []);
    setProfils(
      (((p as any[]) ?? []).map((r) => ({ id: r.id, nom: r.full_name || r.email || "—" }))),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nomDe = useCallback(
    (id: string) => profils.find((x) => x.id === id)?.nom ?? "—",
    [profils],
  );

  const parCollaborateur = useMemo(() => {
    const map = new Map<string, Formation[]>();
    for (const f of formations) map.set(f.collaborateur_id, [...(map.get(f.collaborateur_id) ?? []), f]);
    return Array.from(map.entries());
  }, [formations]);

  const ouvrirAttestation = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("conformite-documents")
      .createSignedUrl(path, 60);
    if (error || !data) {
      toast.error(error?.message ?? "Document indisponible.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface-elevated p-6">
        <h3 className="font-serif text-lg font-medium">Formation du personnel</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Suivi des formations obligatoires (LCB-FT initiale et continue, RGPD, DDA) et de leurs
          attestations. Les formations LCB-FT continues sont à renouveler chaque année.
        </p>
      </div>

      {isAdmin && <AjoutFormation profils={profils} userId={user?.id ?? null} onAdded={load} />}

      {loading ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : formations.length === 0 ? (
        <p className="text-sm text-ink-muted">Aucune formation enregistrée.</p>
      ) : (
        parCollaborateur.map(([id, items]) => (
          <div key={id} className="rounded-2xl border border-line bg-surface-elevated p-5">
            <h4 className="font-serif text-base font-medium">{nomDe(id)}</h4>
            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Thème</TableHead>
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead className="w-32">Expiration</TableHead>
                  <TableHead className="w-32">Statut</TableHead>
                  <TableHead className="w-32">Attestation</TableHead>
                  {isAdmin && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="text-sm">{f.theme}</TableCell>
                    <TableCell className="text-sm">{fmtDate(f.date_formation)}</TableCell>
                    <TableCell className="text-sm">{fmtDate(f.date_expiration)}</TableCell>
                    <TableCell>
                      <span
                        className={
                          "inline-block rounded-full border px-2 py-0.5 text-xs " + STATUT_STYLE[f.statut]
                        }
                      >
                        {STATUT_LABEL[f.statut]}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {f.attestation_url ? (
                        <button
                          onClick={() => ouvrirAttestation(f.attestation_url!)}
                          className="text-ink underline hover:no-underline"
                        >
                          Ouvrir
                        </button>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <button
                          onClick={async () => {
                            const { error } = await supabase
                              .from("formations_personnel")
                              .delete()
                              .eq("id", f.id);
                            if (error) toast.error(error.message);
                            else load();
                          }}
                          className="text-xs text-red-700 hover:underline"
                        >
                          Supprimer
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))
      )}
    </div>
  );
}

function AjoutFormation({
  profils,
  userId,
  onAdded,
}: {
  profils: { id: string; nom: string }[];
  userId: string | null;
  onAdded: () => void;
}) {
  const [collaborateur, setCollaborateur] = useState("");
  const [theme, setTheme] = useState<string>(THEMES_FORMATION[0]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiration, setExpiration] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!collaborateur || !date) {
      toast.error("Collaborateur et date requis.");
      return;
    }
    setBusy(true);
    try {
      let path: string | null = null;
      const file = fileRef.current?.files?.[0];
      if (file) {
        if (file.size > 15 * 1024 * 1024) throw new Error("Fichier > 15 Mo.");
        path = `${collaborateur}/formations/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const up = await supabase.storage.from("conformite-documents").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
      }
      const { error } = await supabase.from("formations_personnel").insert({
        collaborateur_id: collaborateur,
        theme,
        date_formation: date,
        date_expiration: expiration || expirationParDefaut(theme, date),
        attestation_url: path,
        created_by: userId,
      } as never);
      if (error) throw error;
      toast.success("Formation enregistrée.");
      setExpiration("");
      if (fileRef.current) fileRef.current.value = "";
      onAdded();
    } catch (e: any) {
      toast.error(e?.message ?? "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5">
      <h4 className="font-serif text-base font-medium">Ajouter une formation</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Collaborateur</label>
          <Select value={collaborateur} onValueChange={setCollaborateur}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              {profils.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Thème</label>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THEMES_FORMATION.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Date de formation</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">
            Expiration (optionnel)
          </label>
          <Input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Attestation</label>
          <input
            ref={fileRef}
            type="file"
            className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-end">
          <Button onClick={submit} disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
