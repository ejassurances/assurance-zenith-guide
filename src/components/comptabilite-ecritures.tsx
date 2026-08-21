import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Compte = { numero: string; libelle: string; classe: number; type: string; actif: boolean };
type Journal = { code: string; libelle: string; type: string };
type Exercice = { id: string; libelle: string; date_debut: string; date_fin: string; cloture: boolean };
type Tiers = { id: string; nom: string; type: string; compte_auxiliaire: string | null };
type Ecriture = {
  id: string;
  exercice_id: string;
  journal_code: string;
  date_ecriture: string;
  numero_piece: string | null;
  libelle: string;
  mandataire_id: string | null;
  statut: "brouillon" | "valide" | "cloture";
  source: string | null;
};
type Ligne = {
  id: string;
  ecriture_id: string;
  numero_ligne: number;
  compte_numero: string;
  libelle: string | null;
  debit: number;
  credit: number;
  tiers_id: string | null;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);

/* ================================================================
   PLAN COMPTABLE
================================================================ */
export function PlanComptableTab() {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [q, setQ] = useState("");
  const [classe, setClasse] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("plan_comptable").select("*").order("numero");
      setComptes((data as Compte[]) ?? []);
    })();
  }, []);

  const rows = useMemo(
    () =>
      comptes.filter((c) => {
        if (classe !== "all" && String(c.classe) !== classe) return false;
        if (q && !`${c.numero} ${c.libelle}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [comptes, q, classe],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Rechercher (numéro ou libellé)" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select value={classe} onValueChange={setClasse}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes classes</SelectItem>
            <SelectItem value="1">1 — Capitaux</SelectItem>
            <SelectItem value="2">2 — Immobilisations</SelectItem>
            <SelectItem value="4">4 — Tiers</SelectItem>
            <SelectItem value="5">5 — Financiers</SelectItem>
            <SelectItem value="6">6 — Charges</SelectItem>
            <SelectItem value="7">7 — Produits</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto self-center text-sm text-ink-muted">{rows.length} comptes</span>
      </div>
      <div className="overflow-x-auto crm-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Numéro</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.numero}>
                <TableCell className="font-mono">{c.numero}</TableCell>
                <TableCell>{c.libelle}</TableCell>
                <TableCell>{c.classe}</TableCell>
                <TableCell className="capitalize text-ink-muted">{c.type}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ================================================================
   SAISIE ÉCRITURE (dialog inline)
================================================================ */
function SaisieEcriture({
  journaux,
  exercices,
  comptes,
  onCreated,
  restrictJournal,
  mandataireId,
}: {
  journaux: Journal[];
  exercices: Exercice[];
  comptes: Compte[];
  onCreated: () => void;
  restrictJournal?: string;
  mandataireId?: string | null;
}) {
  const [header, setHeader] = useState({
    journal_code: restrictJournal ?? "OD",
    exercice_id: exercices[0]?.id ?? "",
    date_ecriture: new Date().toISOString().slice(0, 10),
    numero_piece: "",
    libelle: "",
  });
  const [lignes, setLignes] = useState<{ compte: string; libelle: string; debit: string; credit: string }[]>([
    { compte: "", libelle: "", debit: "", credit: "" },
    { compte: "", libelle: "", debit: "", credit: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!header.exercice_id && exercices[0]) setHeader((h) => ({ ...h, exercice_id: exercices[0].id }));
  }, [exercices, header.exercice_id]);

  const totalDebit = lignes.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lignes.reduce((s, l) => s + Number(l.credit || 0), 0);
  const equilibre = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.005;

  const addLigne = () => setLignes([...lignes, { compte: "", libelle: "", debit: "", credit: "" }]);
  const removeLigne = (i: number) => setLignes(lignes.filter((_, idx) => idx !== i));
  const updateLigne = (i: number, patch: Partial<(typeof lignes)[number]>) =>
    setLignes(lignes.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const save = async (validate: boolean) => {
    setError(null);
    if (!header.libelle || !header.journal_code || !header.exercice_id) {
      setError("Libellé, journal et exercice obligatoires.");
      return;
    }
    if (validate && !equilibre) {
      setError("Écriture non équilibrée.");
      return;
    }
    const filled = lignes.filter((l) => l.compte && (Number(l.debit || 0) > 0 || Number(l.credit || 0) > 0));
    if (filled.length < 2) {
      setError("Au moins 2 lignes valides.");
      return;
    }
    setSaving(true);
    const { data: ec, error: eErr } = await supabase
      .from("ecritures")
      .insert({
        ...header,
        numero_piece: header.numero_piece || null,
        mandataire_id: mandataireId ?? null,
        statut: "brouillon",
      })
      .select("id")
      .single();
    if (eErr || !ec) {
      setError(eErr?.message ?? "Erreur écriture");
      setSaving(false);
      return;
    }
    const { error: lErr } = await supabase.from("ecritures_lignes").insert(
      filled.map((l, idx) => ({
        ecriture_id: ec.id,
        numero_ligne: idx + 1,
        compte_numero: l.compte,
        libelle: l.libelle || null,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
      })),
    );
    if (lErr) {
      setError(lErr.message);
      setSaving(false);
      return;
    }
    if (validate) {
      const { error: vErr } = await supabase.from("ecritures").update({ statut: "valide" }).eq("id", ec.id);
      if (vErr) {
        setError(vErr.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setHeader({ ...header, libelle: "", numero_piece: "" });
    setLignes([
      { compte: "", libelle: "", debit: "", credit: "" },
      { compte: "", libelle: "", debit: "", credit: "" },
    ]);
    onCreated();
  };

  return (
    <div className="crm-card p-5">
      <h3 className="font-serif text-lg font-medium">Nouvelle écriture</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        {!restrictJournal && (
          <Select value={header.journal_code} onValueChange={(v) => setHeader({ ...header, journal_code: v })}>
            <SelectTrigger><SelectValue placeholder="Journal" /></SelectTrigger>
            <SelectContent>
              {journaux.map((j) => (
                <SelectItem key={j.code} value={j.code}>{j.code} — {j.libelle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={header.exercice_id} onValueChange={(v) => setHeader({ ...header, exercice_id: v })}>
          <SelectTrigger><SelectValue placeholder="Exercice" /></SelectTrigger>
          <SelectContent>
            {exercices.filter((e) => !e.cloture).map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.libelle}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={header.date_ecriture} onChange={(e) => setHeader({ ...header, date_ecriture: e.target.value })} />
        <Input placeholder="N° pièce" value={header.numero_piece} onChange={(e) => setHeader({ ...header, numero_piece: e.target.value })} />
        <Input className="sm:col-span-4" placeholder="Libellé général" value={header.libelle} onChange={(e) => setHeader({ ...header, libelle: e.target.value })} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Compte</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead className="w-32 text-right">Débit</TableHead>
              <TableHead className="w-32 text-right">Crédit</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((l, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Select value={l.compte} onValueChange={(v) => updateLigne(i, { compte: v })}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent className="max-h-80">
                      {comptes.filter((c) => c.actif).map((c) => (
                        <SelectItem key={c.numero} value={c.numero}>
                          <span className="font-mono text-xs">{c.numero}</span> — <span className="text-xs">{c.libelle}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input className="h-9" value={l.libelle} onChange={(e) => updateLigne(i, { libelle: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Input className="h-9 text-right" type="number" step="0.01" value={l.debit} onChange={(e) => updateLigne(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                </TableCell>
                <TableCell>
                  <Input className="h-9 text-right" type="number" step="0.01" value={l.credit} onChange={(e) => updateLigne(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
                </TableCell>
                <TableCell>
                  {lignes.length > 2 && (
                    <Button variant="ghost" size="sm" onClick={() => removeLigne(i)}>×</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-2 flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" onClick={addLigne}>+ Ajouter une ligne</Button>
          <div className="flex gap-6">
            <span>Total débit : <b>{fmt(totalDebit)}</b></span>
            <span>Total crédit : <b>{fmt(totalCredit)}</b></span>
            <span className={equilibre ? "text-emerald-700" : "text-amber-700"}>
              {equilibre ? "Équilibré ✓" : `Écart : ${fmt(totalDebit - totalCredit)}`}
            </span>
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button variant="outline" onClick={() => save(false)} disabled={saving}>Enregistrer en brouillon</Button>
        <Button onClick={() => save(true)} disabled={saving || !equilibre}>Valider l'écriture</Button>
      </div>
    </div>
  );
}

/* ================================================================
   ÉCRITURES (admin)
================================================================ */
export function EcrituresTab() {
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [ecritures, setEcritures] = useState<(Ecriture & { ecritures_lignes: Ligne[] })[]>([]);
  const [journalFilter, setJournalFilter] = useState<string>("all");
  const [statutFilter, setStatutFilter] = useState<string>("all");

  const load = async () => {
    const [{ data: j }, { data: ex }, { data: pc }, { data: ecr }] = await Promise.all([
      supabase.from("journaux").select("*").eq("actif", true).order("code"),
      supabase.from("exercices").select("*").order("date_debut", { ascending: false }),
      supabase.from("plan_comptable").select("*").eq("actif", true).order("numero"),
      supabase.from("ecritures").select("*, ecritures_lignes(*)").order("date_ecriture", { ascending: false }).limit(200),
    ]);
    setJournaux((j as Journal[]) ?? []);
    setExercices((ex as Exercice[]) ?? []);
    setComptes((pc as Compte[]) ?? []);
    setEcritures((ecr as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const rows = ecritures.filter((e) => {
    if (journalFilter !== "all" && e.journal_code !== journalFilter) return false;
    if (statutFilter !== "all" && e.statut !== statutFilter) return false;
    return true;
  });

  const validate = async (id: string) => {
    const { error } = await supabase.from("ecritures").update({ statut: "valide" }).eq("id", id);
    if (error) alert(error.message);
    else load();
  };
  const remove = async (id: string) => {
    if (!confirm("Supprimer cette écriture brouillon ?")) return;
    await supabase.from("ecritures").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      <SaisieEcriture journaux={journaux} exercices={exercices} comptes={comptes} onCreated={load} />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Journal</label>
          <Select value={journalFilter} onValueChange={setJournalFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {journaux.map((j) => (<SelectItem key={j.code} value={j.code}>{j.code}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Statut</label>
          <Select value={statutFilter} onValueChange={setStatutFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="brouillon">Brouillon</SelectItem>
              <SelectItem value="valide">Validée</SelectItem>
              <SelectItem value="cloture">Clôturée</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((e) => {
          const totalD = e.ecritures_lignes.reduce((s, l) => s + Number(l.debit), 0);
          return (
            <div key={e.id} className="crm-card">
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <span className="rounded bg-ink px-2 py-0.5 text-xs text-primary-foreground">{e.journal_code}</span>
                <span className="text-sm">{new Date(e.date_ecriture).toLocaleDateString("fr-FR")}</span>
                {e.numero_piece && <span className="text-xs text-ink-muted">Pièce {e.numero_piece}</span>}
                <span className="text-sm">{e.libelle}</span>
                <span className={
                  "ml-auto rounded-full px-2 py-0.5 text-xs " +
                  (e.statut === "brouillon" ? "bg-amber-100 text-amber-800" : e.statut === "valide" ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-700")
                }>{e.statut}</span>
                <span className="text-xs text-ink-muted">{fmt(totalD)}</span>
                {e.statut === "brouillon" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => validate(e.id)}>Valider</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(e.id)}>Supprimer</Button>
                  </>
                )}
              </div>
              <Table>
                <TableBody>
                  {e.ecritures_lignes.sort((a, b) => a.numero_ligne - b.numero_ligne).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="w-40 font-mono text-xs">{l.compte_numero}</TableCell>
                      <TableCell className="text-sm">{l.libelle ?? ""}</TableCell>
                      <TableCell className="w-32 text-right text-sm">{Number(l.debit) > 0 ? fmt(Number(l.debit)) : ""}</TableCell>
                      <TableCell className="w-32 text-right text-sm">{Number(l.credit) > 0 ? fmt(Number(l.credit)) : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-center text-sm text-ink-muted">Aucune écriture.</p>}
      </div>
    </div>
  );
}

/* ================================================================
   GRAND LIVRE
================================================================ */
export function GrandLivreTab({ mandataireOnly = false }: { mandataireOnly?: boolean }) {
  const { user } = useAuth();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [compte, setCompte] = useState<string>("");
  const [dateDeb, setDateDeb] = useState<string>(`${new Date().getFullYear()}-01-01`);
  const [dateFin, setDateFin] = useState<string>(`${new Date().getFullYear()}-12-31`);
  const [rows, setRows] = useState<(Ligne & { ecritures: Ecriture })[]>([]);

  useEffect(() => {
    supabase.from("plan_comptable").select("*").eq("actif", true).order("numero").then(({ data }) => setComptes((data as Compte[]) ?? []));
  }, []);

  useEffect(() => {
    if (!compte) return;
    (async () => {
      let query = supabase
        .from("ecritures_lignes")
        .select("*, ecritures!inner(id,journal_code,date_ecriture,numero_piece,libelle,statut,mandataire_id)")
        .eq("compte_numero", compte)
        .gte("ecritures.date_ecriture", dateDeb)
        .lte("ecritures.date_ecriture", dateFin)
        .in("ecritures.statut", ["valide", "cloture"]);
      if (mandataireOnly && user) query = query.eq("ecritures.mandataire_id", user.id);
      const { data } = await query.order("ecritures(date_ecriture)");
      setRows((data as any) ?? []);
    })();
  }, [compte, dateDeb, dateFin, mandataireOnly, user]);

  const totals = rows.reduce(
    (acc, l) => ({ debit: acc.debit + Number(l.debit), credit: acc.credit + Number(l.credit) }),
    { debit: 0, credit: 0 },
  );
  const solde = totals.debit - totals.credit;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64">
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Compte</label>
          <Select value={compte} onValueChange={setCompte}>
            <SelectTrigger><SelectValue placeholder="Choisir un compte" /></SelectTrigger>
            <SelectContent className="max-h-96">
              {comptes.map((c) => (
                <SelectItem key={c.numero} value={c.numero}>
                  <span className="font-mono text-xs">{c.numero}</span> — {c.libelle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Du</label>
          <Input type="date" value={dateDeb} onChange={(e) => setDateDeb(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Au</label>
          <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </div>
      </div>

      {compte && (
        <div className="overflow-x-auto crm-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Journal</TableHead>
                <TableHead>Pièce</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="text-right">Débit</TableHead>
                <TableHead className="text-right">Crédit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{new Date((l as any).ecritures.date_ecriture).toLocaleDateString("fr-FR")}</TableCell>
                  <TableCell>{(l as any).ecritures.journal_code}</TableCell>
                  <TableCell>{(l as any).ecritures.numero_piece ?? "—"}</TableCell>
                  <TableCell className="text-sm">{l.libelle ?? (l as any).ecritures.libelle}</TableCell>
                  <TableCell className="text-right">{Number(l.debit) > 0 ? fmt(Number(l.debit)) : ""}</TableCell>
                  <TableCell className="text-right">{Number(l.credit) > 0 ? fmt(Number(l.credit)) : ""}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-ink-muted">Aucun mouvement.</TableCell></TableRow>
              )}
              <TableRow>
                <TableCell colSpan={4} className="text-right font-medium">Totaux / solde</TableCell>
                <TableCell className="text-right font-medium">{fmt(totals.debit)}</TableCell>
                <TableCell className="text-right font-medium">{fmt(totals.credit)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-right text-sm text-ink-muted">Solde débiteur (+) / créditeur (-)</TableCell>
                <TableCell colSpan={2} className="text-right font-serif text-lg">{fmt(solde)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   BALANCE + COMPTE DE RÉSULTAT (agrégations)
================================================================ */
type BalanceRow = { compte: Compte; debit: number; credit: number };

function useBalance(dateDeb: string, dateFin: string, mandataireId?: string | null) {
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase
        .from("ecritures_lignes")
        .select("debit,credit,compte_numero,ecritures!inner(date_ecriture,statut,mandataire_id),plan_comptable!inner(numero,libelle,classe,type,actif)")
        .gte("ecritures.date_ecriture", dateDeb)
        .lte("ecritures.date_ecriture", dateFin)
        .in("ecritures.statut", ["valide", "cloture"]);
      if (mandataireId) query = query.eq("ecritures.mandataire_id", mandataireId);
      const { data } = await query;
      const acc: Record<string, BalanceRow> = {};
      for (const r of (data as any[]) ?? []) {
        const compte: Compte = r.plan_comptable;
        acc[compte.numero] = acc[compte.numero] ?? { compte, debit: 0, credit: 0 };
        acc[compte.numero].debit += Number(r.debit);
        acc[compte.numero].credit += Number(r.credit);
      }
      setRows(Object.values(acc).sort((a, b) => a.compte.numero.localeCompare(b.compte.numero)));
      setLoading(false);
    })();
  }, [dateDeb, dateFin, mandataireId]);

  return { rows, loading };
}

export function BalanceTab({ mandataireOnly = false }: { mandataireOnly?: boolean }) {
  const { user } = useAuth();
  const [dateDeb, setDateDeb] = useState<string>(`${new Date().getFullYear()}-01-01`);
  const [dateFin, setDateFin] = useState<string>(`${new Date().getFullYear()}-12-31`);
  const { rows, loading } = useBalance(dateDeb, dateFin, mandataireOnly ? user?.id : null);

  const totals = rows.reduce(
    (acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }),
    { debit: 0, credit: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Du</label>
          <Input type="date" value={dateDeb} onChange={(e) => setDateDeb(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Au</label>
          <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </div>
      </div>
      <div className="overflow-x-auto crm-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Compte</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead className="text-right">Débit</TableHead>
              <TableHead className="text-right">Crédit</TableHead>
              <TableHead className="text-right">Solde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center text-ink-muted">Chargement…</TableCell></TableRow>}
            {!loading && rows.map((r) => {
              const solde = r.debit - r.credit;
              return (
                <TableRow key={r.compte.numero}>
                  <TableCell className="font-mono text-xs">{r.compte.numero}</TableCell>
                  <TableCell className="text-sm">{r.compte.libelle}</TableCell>
                  <TableCell className="text-right">{fmt(r.debit)}</TableCell>
                  <TableCell className="text-right">{fmt(r.credit)}</TableCell>
                  <TableCell className={"text-right font-medium " + (solde >= 0 ? "" : "text-red-700")}>{fmt(solde)}</TableCell>
                </TableRow>
              );
            })}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-ink-muted">Aucun mouvement sur la période.</TableCell></TableRow>
            )}
            <TableRow>
              <TableCell colSpan={2} className="text-right font-medium">Totaux</TableCell>
              <TableCell className="text-right font-medium">{fmt(totals.debit)}</TableCell>
              <TableCell className="text-right font-medium">{fmt(totals.credit)}</TableCell>
              <TableCell className="text-right font-medium">{fmt(totals.debit - totals.credit)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function ResultatTab({ mandataireOnly = false }: { mandataireOnly?: boolean }) {
  const { user } = useAuth();
  const [dateDeb, setDateDeb] = useState<string>(`${new Date().getFullYear()}-01-01`);
  const [dateFin, setDateFin] = useState<string>(`${new Date().getFullYear()}-12-31`);
  const { rows, loading } = useBalance(dateDeb, dateFin, mandataireOnly ? user?.id : null);

  const produits = rows.filter((r) => r.compte.classe === 7);
  const charges = rows.filter((r) => r.compte.classe === 6);
  const totalProduits = produits.reduce((s, r) => s + (r.credit - r.debit), 0);
  const totalCharges = charges.reduce((s, r) => s + (r.debit - r.credit), 0);
  const resultat = totalProduits - totalCharges;

  const exportCsv = () => {
    const lines = ["Section;Compte;Libellé;Montant"];
    for (const r of produits) lines.push(`Produits;${r.compte.numero};${r.compte.libelle};${(r.credit - r.debit).toFixed(2)}`);
    lines.push(`Produits;;TOTAL PRODUITS;${totalProduits.toFixed(2)}`);
    for (const r of charges) lines.push(`Charges;${r.compte.numero};${r.compte.libelle};${(r.debit - r.credit).toFixed(2)}`);
    lines.push(`Charges;;TOTAL CHARGES;${totalCharges.toFixed(2)}`);
    lines.push(`Résultat;;RESULTAT NET;${resultat.toFixed(2)}`);
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resultat-${dateDeb}-${dateFin}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Du</label>
          <Input type="date" value={dateDeb} onChange={(e) => setDateDeb(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Au</label>
          <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
        </div>
        <Button variant="outline" onClick={exportCsv} className="ml-auto">Export CSV</Button>
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="crm-card">
            <div className="border-b border-line p-4">
              <h3 className="font-serif text-lg font-medium">Produits (classe 7)</h3>
            </div>
            <Table>
              <TableBody>
                {produits.map((r) => (
                  <TableRow key={r.compte.numero}>
                    <TableCell className="font-mono text-xs">{r.compte.numero}</TableCell>
                    <TableCell className="text-sm">{r.compte.libelle}</TableCell>
                    <TableCell className="text-right">{fmt(r.credit - r.debit)}</TableCell>
                  </TableRow>
                ))}
                {produits.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-ink-muted">Aucun produit.</TableCell></TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={2} className="font-serif">Total produits</TableCell>
                  <TableCell className="text-right font-serif text-lg">{fmt(totalProduits)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="crm-card">
            <div className="border-b border-line p-4">
              <h3 className="font-serif text-lg font-medium">Charges (classe 6)</h3>
            </div>
            <Table>
              <TableBody>
                {charges.map((r) => (
                  <TableRow key={r.compte.numero}>
                    <TableCell className="font-mono text-xs">{r.compte.numero}</TableCell>
                    <TableCell className="text-sm">{r.compte.libelle}</TableCell>
                    <TableCell className="text-right">{fmt(r.debit - r.credit)}</TableCell>
                  </TableRow>
                ))}
                {charges.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-ink-muted">Aucune charge.</TableCell></TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={2} className="font-serif">Total charges</TableCell>
                  <TableCell className="text-right font-serif text-lg">{fmt(totalCharges)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="crm-card border-2 border-[#0A192F] p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-xl font-medium">Résultat net</h3>
              <span className={"font-serif text-3xl font-medium " + (resultat >= 0 ? "text-emerald-700" : "text-red-700")}>{fmt(resultat)}</span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {resultat >= 0 ? "Bénéfice" : "Perte"} sur la période {new Date(dateDeb).toLocaleDateString("fr-FR")} — {new Date(dateFin).toLocaleDateString("fr-FR")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   NOTES DE FRAIS (mandataire)
================================================================ */
export function NotesDeFraisTab() {
  const { user } = useAuth();
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [rows, setRows] = useState<(Ecriture & { ecritures_lignes: Ligne[] })[]>([]);

  const load = async () => {
    if (!user) return;
    const [{ data: j }, { data: ex }, { data: pc }, { data: ecr }] = await Promise.all([
      supabase.from("journaux").select("*").eq("code", "NDF"),
      supabase.from("exercices").select("*").eq("cloture", false).order("date_debut", { ascending: false }),
      supabase.from("plan_comptable").select("*").eq("actif", true).order("numero"),
      supabase.from("ecritures").select("*, ecritures_lignes(*)").eq("mandataire_id", user.id).eq("journal_code", "NDF").order("date_ecriture", { ascending: false }),
    ]);
    setJournaux((j as Journal[]) ?? []);
    setExercices((ex as Exercice[]) ?? []);
    setComptes((pc as Compte[]) ?? []);
    setRows((ecr as any) ?? []);
  };
  useEffect(() => { load(); }, [user]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-soft">
        Saisissez vos charges professionnelles (URSSAF, frais de déplacement, abonnements, formations…) via une écriture équilibrée : compte de charge (classe 6) au débit, compte de contrepartie (512 banque personnelle, 108 exploitant, etc.) au crédit.
      </div>
      <SaisieEcriture journaux={journaux} exercices={exercices} comptes={comptes} onCreated={load} restrictJournal="NDF" mandataireId={user?.id} />

      <div className="space-y-3">
        {rows.map((e) => {
          const totalD = e.ecritures_lignes.reduce((s, l) => s + Number(l.debit), 0);
          return (
            <div key={e.id} className="crm-card">
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
                <span className="rounded bg-ink px-2 py-0.5 text-xs text-primary-foreground">NDF</span>
                <span className="text-sm">{new Date(e.date_ecriture).toLocaleDateString("fr-FR")}</span>
                <span className="text-sm">{e.libelle}</span>
                <span className="ml-auto text-xs text-ink-muted">{fmt(totalD)}</span>
                <span className={"rounded-full px-2 py-0.5 text-xs " + (e.statut === "brouillon" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>{e.statut}</span>
              </div>
              <Table>
                <TableBody>
                  {e.ecritures_lignes.sort((a, b) => a.numero_ligne - b.numero_ligne).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="w-40 font-mono text-xs">{l.compte_numero}</TableCell>
                      <TableCell className="text-sm">{l.libelle ?? ""}</TableCell>
                      <TableCell className="w-32 text-right text-sm">{Number(l.debit) > 0 ? fmt(Number(l.debit)) : ""}</TableCell>
                      <TableCell className="w-32 text-right text-sm">{Number(l.credit) > 0 ? fmt(Number(l.credit)) : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-center text-sm text-ink-muted">Aucune note de frais.</p>}
      </div>
    </div>
  );
}
