import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dansExerciceComptable, PREMIER_EXERCICE } from "@/lib/exercice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Livre-journal des recettes (obligation légale auto-entrepreneur) :
 * vue chronologique des commissions effectivement encaissées, totaux par mois
 * et par année, export CSV pour la déclaration URSSAF / impôts.
 */

const fmt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

type Personne = { nom: string | null; prenom: string | null } | null;
type Ligne = {
  id: string;
  montant: number;
  date_versement: string | null;
  created_at: string;
  notes: string | null;
  contrat_id: string | null;
  dossier_id: string | null;
  contrats: { numero: string | null; assureur: string | null; clients: Personne } | null;
  dossiers: { reference: string | null; clients: Personne } | null;
  bordereaux_commissions: { periode: string | null; assureur: string | null } | null;
};

const nomClient = (p: Personne) => (p ? `${p.prenom ?? ""} ${p.nom ?? ""}`.trim() : "");

function dateRecette(l: Ligne) {
  return (l.date_versement ?? l.created_at).slice(0, 10);
}

function origine(l: Ligne) {
  const client = nomClient(l.contrats?.clients ?? null) || nomClient(l.dossiers?.clients ?? null);
  const compagnie = l.contrats?.assureur ?? l.bordereaux_commissions?.assureur ?? "";
  const ref = l.contrats?.numero ?? l.dossiers?.reference ?? "";
  return [client, compagnie, ref].filter(Boolean).join(" — ") || "Commission de courtage";
}

function encaissement(l: Ligne) {
  if (l.bordereaux_commissions) {
    return `Bordereau ${l.bordereaux_commissions.assureur ?? ""} ${l.bordereaux_commissions.periode ?? ""}`.trim();
  }
  return "Virement";
}

export function LivreRecettesTab() {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [annee, setAnnee] = useState<string>(String(Math.max(new Date().getFullYear(), PREMIER_EXERCICE)));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("commissions")
        .select(
          "id,montant,date_versement,created_at,notes,contrat_id,dossier_id,contrats(numero,assureur,clients(nom,prenom)),dossiers(reference,clients(nom,prenom)),bordereaux_commissions(periode,assureur)",
        )
        .eq("statut", "versee");
      // Premier exercice comptable : 2026. Les encaissements antérieurs sont exclus.
      const rows = ((data as unknown as Ligne[]) ?? [])
        .filter((l) => dansExerciceComptable(dateRecette(l)))
        .sort((a, b) => dateRecette(a).localeCompare(dateRecette(b)));
      setLignes(rows);
      setLoading(false);
    })();
  }, []);

  const annees = useMemo(
    () => Array.from(new Set(lignes.map((l) => dateRecette(l).slice(0, 4)))).sort(),
    [lignes],
  );

  const rows = useMemo(
    () => (annee === "all" ? lignes : lignes.filter((l) => dateRecette(l).startsWith(annee))),
    [lignes, annee],
  );

  const totaux = useMemo(() => {
    const parMois = new Array(12).fill(0) as number[];
    const parAnnee: Record<string, number> = {};
    let total = 0;
    for (const l of rows) {
      const d = dateRecette(l);
      const m = Number(d.slice(5, 7)) - 1;
      const montant = Number(l.montant);
      if (m >= 0 && m < 12) parMois[m] += montant;
      parAnnee[d.slice(0, 4)] = (parAnnee[d.slice(0, 4)] ?? 0) + montant;
      total += montant;
    }
    return { parMois, parAnnee, total };
  }, [rows]);

  const exportCsv = () => {
    const header = "Date d'encaissement;Origine;Mode d'encaissement;Montant encaisse (EUR)\n";
    const body = rows
      .map((l) =>
        [
          dateRecette(l),
          origine(l).replace(/;/g, ","),
          encaissement(l).replace(/;/g, ","),
          Number(l.montant).toFixed(2).replace(".", ","),
        ].join(";"),
      )
      .join("\n");
    const totalLigne = `\n;;TOTAL;${totaux.total.toFixed(2).replace(".", ",")}\n`;
    const blob = new Blob(["\uFEFF" + header + body + totalLigne], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `livre-des-recettes-${annee}.csv`;
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
          <p className="text-xs uppercase tracking-wide text-ink-muted">Total encaissé</p>
          <p className="font-serif text-xl">{fmt(totaux.total)}</p>
        </div>
        <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
      </div>

      <div className="crm-card p-5">
        <h3 className="font-serif text-lg font-medium">Livre-journal des recettes</h3>
        <p className="mt-1 mb-3 text-xs text-ink-muted">
          Recettes encaissées par ordre chronologique — registre obligatoire à conserver 10 ans.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Origine</TableHead>
              <TableHead>Mode d'encaissement</TableHead>
              <TableHead className="text-right">Montant</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-ink-muted">Aucune recette encaissée sur la période.</TableCell>
              </TableRow>
            )}
            {rows.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{dateRecette(l)}</TableCell>
                <TableCell>{origine(l)}</TableCell>
                <TableCell className="text-xs text-ink-muted">{encaissement(l)}</TableCell>
                <TableCell className="text-right">{fmt(Number(l.montant))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="crm-card p-5">
          <h3 className="font-serif text-lg font-medium">Cumul par mois</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mois</TableHead>
                <TableHead className="text-right">Recettes</TableHead>
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
          <h3 className="font-serif text-lg font-medium">Cumul par année</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Année</TableHead>
                <TableHead className="text-right">Recettes</TableHead>
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
