import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Livre des achats (obligation légale auto-entrepreneur) : vue chronologique
 * des dépenses professionnelles, totaux par mois et par année, export CSV.
 */

const fmt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

type Facture = {
  id: string;
  fournisseur: string;
  numero_facture: string | null;
  date_facture: string;
  date_paiement: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  compte_charge: string;
  moyen_paiement: string | null;
  statut: string;
  notes: string | null;
};

export function LivreAchatsTab() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [comptes, setComptes] = useState<Record<string, string>>({});
  const [annee, setAnnee] = useState<string>(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: f }, { data: pc }] = await Promise.all([
        supabase
          .from("factures_achat")
          .select(
            "id,fournisseur,numero_facture,date_facture,date_paiement,montant_ht,montant_tva,montant_ttc,compte_charge,moyen_paiement,statut,notes",
          )
          .order("date_facture"),
        supabase.from("plan_comptable").select("numero,libelle"),
      ]);
      setFactures((f as unknown as Facture[]) ?? []);
      setComptes(Object.fromEntries(((pc as { numero: string; libelle: string }[]) ?? []).map((c) => [c.numero, c.libelle])));
      setLoading(false);
    })();
  }, []);

  const nature = (fa: Facture) => comptes[fa.compte_charge] ?? `Compte ${fa.compte_charge}`;

  const annees = useMemo(
    () => Array.from(new Set(factures.map((f) => f.date_facture.slice(0, 4)))).sort(),
    [factures],
  );

  const rows = useMemo(
    () => (annee === "all" ? factures : factures.filter((f) => f.date_facture.startsWith(annee))),
    [factures, annee],
  );

  const totaux = useMemo(() => {
    const parMois = new Array(12).fill(0) as number[];
    const parAnnee: Record<string, number> = {};
    let ht = 0, tva = 0, ttc = 0;
    for (const f of rows) {
      const m = Number(f.date_facture.slice(5, 7)) - 1;
      const t = Number(f.montant_ttc);
      if (m >= 0 && m < 12) parMois[m] += t;
      parAnnee[f.date_facture.slice(0, 4)] = (parAnnee[f.date_facture.slice(0, 4)] ?? 0) + t;
      ht += Number(f.montant_ht);
      tva += Number(f.montant_tva);
      ttc += t;
    }
    return { parMois, parAnnee, ht, tva, ttc };
  }, [rows]);

  const exportCsv = () => {
    const header =
      "Date facture;Fournisseur;Numero;Nature de la depense;Montant HT (EUR);TVA (EUR);Montant TTC (EUR);Mode de paiement;Date de paiement\n";
    const body = rows
      .map((f) =>
        [
          f.date_facture,
          f.fournisseur.replace(/;/g, ","),
          f.numero_facture ?? "",
          nature(f).replace(/;/g, ","),
          Number(f.montant_ht).toFixed(2).replace(".", ","),
          Number(f.montant_tva).toFixed(2).replace(".", ","),
          Number(f.montant_ttc).toFixed(2).replace(".", ","),
          f.moyen_paiement ?? "",
          f.date_paiement ?? "",
        ].join(";"),
      )
      .join("\n");
    const total = `\n;;;TOTAL;${totaux.ht.toFixed(2).replace(".", ",")};${totaux.tva
      .toFixed(2)
      .replace(".", ",")};${totaux.ttc.toFixed(2).replace(".", ",")};;\n`;
    const blob = new Blob(["\uFEFF" + header + body + total], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `livre-des-achats-${annee}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <p className="text-sm text-ink-muted">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">Année</label>
          <Select value={annee} onValueChange={setAnnee}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {annees.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Total TTC</p>
          <p className="font-serif text-xl">{fmt(totaux.ttc)}</p>
          <p className="text-xs text-ink-muted">HT {fmt(totaux.ht)} · TVA {fmt(totaux.tva)}</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
      </div>

      <div className="crm-card p-5">
        <h3 className="font-serif text-lg font-medium">Livre des achats</h3>
        <p className="mt-1 mb-3 text-xs text-ink-muted">
          Dépenses professionnelles par ordre chronologique — registre obligatoire à conserver 10 ans.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Fournisseur</TableHead>
              <TableHead>Nature</TableHead>
              <TableHead className="text-right">HT</TableHead>
              <TableHead className="text-right">TVA</TableHead>
              <TableHead className="text-right">TTC</TableHead>
              <TableHead>Paiement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-ink-muted">Aucun achat sur la période.</TableCell>
              </TableRow>
            )}
            {rows.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{f.date_facture}</TableCell>
                <TableCell>
                  {f.fournisseur}
                  {f.numero_facture && <span className="ml-1 text-xs text-ink-muted">n° {f.numero_facture}</span>}
                </TableCell>
                <TableCell className="text-xs text-ink-muted">{nature(f)}</TableCell>
                <TableCell className="text-right">{fmt(Number(f.montant_ht))}</TableCell>
                <TableCell className="text-right">{fmt(Number(f.montant_tva))}</TableCell>
                <TableCell className="text-right">{fmt(Number(f.montant_ttc))}</TableCell>
                <TableCell className="text-xs text-ink-muted">
                  {f.date_paiement ? `${f.moyen_paiement ?? "payé"} — ${f.date_paiement}` : f.statut}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="crm-card p-5">
          <h3 className="font-serif text-lg font-medium">Cumul par mois (TTC)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mois</TableHead>
                <TableHead className="text-right">Achats</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOIS.map((m, i) => (
                <TableRow key={m}>
                  <TableCell>{m}</TableCell>
                  <TableCell className="text-right">{fmt(totaux.parMois[i] ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="crm-card p-5">
          <h3 className="font-serif text-lg font-medium">Cumul par année (TTC)</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Année</TableHead>
                <TableHead className="text-right">Achats</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(totaux.parAnnee).sort().map(([a, v]) => (
                <TableRow key={a}>
                  <TableCell>{a}</TableCell>
                  <TableCell className="text-right">{fmt(v)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
