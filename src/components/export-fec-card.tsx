import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exporterFec } from "@/lib/conformite-registres.functions";
import { telechargerTexte } from "@/lib/telecharger-pdf";

type Exercice = { id: string; date_debut: string; date_fin: string };

const anneeCourante = new Date().getFullYear();

/** Export du Fichier des Écritures Comptables (FEC) sur une période ou un exercice. */
export function ExportFecCard({ exercices }: { exercices: Exercice[] }) {
  const [debut, setDebut] = useState(exercices[0]?.date_debut ?? `${anneeCourante}-01-01`);
  const [fin, setFin] = useState(exercices[0]?.date_fin ?? `${anneeCourante}-12-31`);
  const [enCours, setEnCours] = useState(false);
  const exporter = useServerFn(exporterFec);

  const lancer = async () => {
    setEnCours(true);
    try {
      const res = await exporter({ data: { date_debut: debut, date_fin: fin } });
      telechargerTexte(res.csv, res.nom_fichier, "text/csv;charset=utf-8");
      toast.success(
        `${res.nb_lignes} ligne(s) exportée(s) — débit ${res.total_debit.toLocaleString("fr-FR")} € / crédit ${res.total_credit.toLocaleString("fr-FR")} €.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export FEC impossible.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="mt-4 crm-card p-4">
      <p className="crm-eyebrow">Export comptable</p>
      <h3 className="mt-1 text-sm font-semibold">Fichier des Écritures Comptables (FEC)</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Export conforme (Date, Compte, Libellé, Débit, Crédit, référence EJ-AAAA-RISQUE-XXXX) des écritures validées de
        la période.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {exercices.length > 0 && (
          <label className="text-xs text-ink-muted">
            Exercice
            <select
              className="mt-1 block rounded-md border border-line bg-background px-2 py-1 text-xs"
              onChange={(e) => {
                const ex = exercices.find((x) => x.id === e.target.value);
                if (ex) {
                  setDebut(ex.date_debut);
                  setFin(ex.date_fin);
                }
              }}
            >
              {exercices.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {new Date(ex.date_debut).getFullYear()}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-ink-muted">
          Du
          <input
            type="date"
            value={debut}
            onChange={(e) => setDebut(e.target.value)}
            className="mt-1 block rounded-md border border-line bg-background px-2 py-1 text-xs"
          />
        </label>
        <label className="text-xs text-ink-muted">
          Au
          <input
            type="date"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            className="mt-1 block rounded-md border border-line bg-background px-2 py-1 text-xs"
          />
        </label>
        <Button onClick={lancer} disabled={enCours}>
          {enCours ? "Export…" : "Exporter le FEC"}
        </Button>
      </div>
    </div>
  );
}
