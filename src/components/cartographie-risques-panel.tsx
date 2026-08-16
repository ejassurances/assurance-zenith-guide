import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { risqueResiduel, type NiveauResiduel } from "@/lib/cartographie-risques";

/* Cartographie des risques LCB-FT du cabinet : probabilité × impact, niveau de
   maîtrise, risque résiduel calculé et révision annuelle tracée. */

type Ligne = {
  id: string;
  categorie: string;
  facteur: string;
  probabilite: number;
  impact: number;
  niveau_maitrise: number;
  mesures_maitrise: string | null;
  risque_residuel: NiveauResiduel;
  version: number;
  revise_le: string | null;
};

const RESIDUEL_LABEL: Record<NiveauResiduel, string> = {
  eleve: "Élevé",
  moyen: "Moyen",
  faible: "Faible",
};

const RESIDUEL_STYLE: Record<NiveauResiduel, string> = {
  eleve: "bg-red-100 text-red-900 border-red-300",
  moyen: "bg-amber-100 text-amber-900 border-amber-300",
  faible: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

const MAITRISE_LABEL: Record<number, string> = { 1: "Faible", 2: "Moyenne", 3: "Forte" };

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export function CartographieRisquesPanel({ isAdmin }: { isAdmin: boolean }) {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cartographie_risques")
      .select(
        "id,categorie,facteur,probabilite,impact,niveau_maitrise,mesures_maitrise,risque_residuel,version,revise_le",
      )
      .order("categorie", { ascending: true })
      .order("facteur", { ascending: true });
    setLignes((data as unknown as Ligne[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const parCategorie = useMemo(() => {
    const map = new Map<string, Ligne[]>();
    for (const l of lignes) map.set(l.categorie, [...(map.get(l.categorie) ?? []), l]);
    return Array.from(map.entries());
  }, [lignes]);

  const derniereValidation = useMemo(() => {
    const dates = lignes.map((l) => l.revise_le).filter(Boolean) as string[];
    if (dates.length === 0 || dates.length < lignes.length) return null;
    return dates.sort()[0]!;
  }, [lignes]);

  const versionCourante = useMemo(
    () => (lignes.length ? Math.max(...lignes.map((l) => l.version)) : 1),
    [lignes],
  );

  const revisionEnRetard = useMemo(() => {
    if (!derniereValidation) return true;
    const limite = new Date(derniereValidation);
    limite.setFullYear(limite.getFullYear() + 1);
    return limite.getTime() < Date.now();
  }, [derniereValidation]);

  const patch = async (ligne: Ligne, champs: Partial<Ligne>) => {
    if (!isAdmin) return;
    const suivant = { ...ligne, ...champs };
    const residuel = risqueResiduel(suivant.probabilite, suivant.impact, suivant.niveau_maitrise);
    setLignes((prev) =>
      prev.map((l) => (l.id === ligne.id ? { ...suivant, risque_residuel: residuel } : l)),
    );
    const { error } = await supabase
      .from("cartographie_risques")
      .update(champs as never)
      .eq("id", ligne.id);
    if (error) {
      toast.error(error.message);
      await load();
    }
  };

  const validerVersion = async () => {
    if (!isAdmin || lignes.length === 0) return;
    setValidation(true);
    try {
      const aujourdhui = new Date().toISOString().slice(0, 10);
      for (const l of lignes) {
        const { error } = await supabase
          .from("cartographie_risques")
          .update({ revise_le: aujourdhui, version: l.version + 1 } as never)
          .eq("id", l.id);
        if (error) throw error;
      }
      toast.success(`Cartographie validée (version ${versionCourante + 1}).`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Validation impossible.");
    } finally {
      setValidation(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface-elevated p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="font-serif text-lg font-medium">Cartographie des risques LCB-FT</h3>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              Évaluation par catégorie de risque : probabilité × impact, niveau de maîtrise réellement en
              place, risque résiduel calculé. Révision annuelle obligatoire.
            </p>
            <p className="mt-3 text-sm">
              Version {versionCourante} · Dernière validation globale :{" "}
              <span className="font-medium">{fmtDate(derniereValidation)}</span>
            </p>
            {revisionEnRetard && (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-900">
                {derniereValidation
                  ? "Plus d'un an depuis la dernière validation : la révision annuelle est attendue."
                  : "La cartographie n'a jamais été formellement validée : à examiner puis valider."}
              </p>
            )}
          </div>
          {isAdmin && (
            <Button onClick={validerVersion} disabled={validation || loading || lignes.length === 0}>
              {validation ? "Validation…" : "Valider la version actuelle"}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : lignes.length === 0 ? (
        <p className="text-sm text-ink-muted">Aucune ligne de cartographie.</p>
      ) : (
        parCategorie.map(([categorie, items]) => (
          <div key={categorie} className="rounded-2xl border border-line bg-surface-elevated p-5">
            <h4 className="font-serif text-base font-medium">{categorie}</h4>
            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Facteur de risque</TableHead>
                  <TableHead className="w-28">Probabilité</TableHead>
                  <TableHead className="w-28">Impact</TableHead>
                  <TableHead className="w-32">Maîtrise</TableHead>
                  <TableHead className="w-28">Risque résiduel</TableHead>
                  <TableHead>Mesures en place</TableHead>
                  <TableHead className="w-28">Révisé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="align-top text-sm">{l.facteur}</TableCell>
                    <TableCell className="align-top">
                      {isAdmin ? (
                        <Select
                          value={String(l.probabilite)}
                          onValueChange={(v) => patch(l, { probabilite: Number(v) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{l.probabilite}</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {isAdmin ? (
                        <Select value={String(l.impact)} onValueChange={(v) => patch(l, { impact: Number(v) })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{l.impact}</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {isAdmin ? (
                        <Select
                          value={String(l.niveau_maitrise)}
                          onValueChange={(v) => patch(l, { niveau_maitrise: Number(v) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {MAITRISE_LABEL[n]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{MAITRISE_LABEL[l.niveau_maitrise]}</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <span
                        className={
                          "inline-block rounded-full border px-2 py-0.5 text-xs " +
                          RESIDUEL_STYLE[l.risque_residuel]
                        }
                      >
                        {RESIDUEL_LABEL[l.risque_residuel]}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      {isAdmin ? (
                        <Textarea
                          defaultValue={l.mesures_maitrise ?? ""}
                          rows={2}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (l.mesures_maitrise ?? "")) patch(l, { mesures_maitrise: v || null });
                          }}
                        />
                      ) : (
                        <span className="text-xs text-ink-muted">{l.mesures_maitrise ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-xs text-ink-muted">{fmtDate(l.revise_le)}</TableCell>
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
