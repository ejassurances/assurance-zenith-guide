import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  evaluerRisqueLcbftClient,
  listerClientsRisqueNonEvalues,
} from "@/lib/risque-lcbft.functions";
import { useServerFn } from "@tanstack/react-start";

/* Registre clients de l'onglet Conformité : vue d'ensemble ACPR (score KYC, risque LCB-FT, vigilance, revues). */

type Vigilance = "simplifiee" | "standard" | "renforcee";

type Ligne = {
  id: string;
  reference: string | null;
  nom: string;
  prenom: string | null;
  score_risque: number | null;
  niveau_vigilance: Vigilance | null;
  ppe_detecte: boolean;
  prochaine_revue_le: string | null;
  decide_le: string | null;
  validation_en_attente: boolean;
};

const VIGILANCE_LABEL: Record<Vigilance, string> = {
  simplifiee: "Simplifiée",
  standard: "Standard",
  renforcee: "Renforcée",
};

const VIGILANCE_STYLE: Record<Vigilance, string> = {
  simplifiee: "bg-emerald-100 text-emerald-900 border-emerald-300",
  standard: "bg-amber-100 text-amber-900 border-amber-300",
  renforcee: "bg-red-100 text-red-900 border-red-300",
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

const enRetard = (d: string | null) => {
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(d) < today;
};

export function RegistreClientsConformite({ isAdmin }: { isAdmin: boolean }) {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [vigilance, setVigilance] = useState<"tous" | Vigilance>("tous");
  const [revueRetard, setRevueRetard] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [summary, setSummary] = useState<{ traites: number; renforcee: number; erreurs: string[] } | null>(null);

  const listerNonEvalues = useServerFn(listerClientsRisqueNonEvalues);
  const evaluerClient = useServerFn(evaluerRisqueLcbftClient);

  const charger = async () => {
    setLoading(true);
    const { data: clients } = await supabase
      .from("clients")
      .select("id,reference,nom,prenom")
      .order("nom", { ascending: true });

    const ids = (clients ?? []).map((c) => c.id);
    const [risques, taches] = await Promise.all([
      ids.length
        ? supabase
            .from("client_risque_lcbft")
            .select("client_id,score_risque,niveau_vigilance,ppe_detecte,prochaine_revue_le,decide_le")
            .in("client_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabase
            .from("taches")
            .select("client_id")
            .in("client_id", ids)
            .in("statut", ["a_faire", "en_cours"])
            .ilike("titre", "Vigilance renforcée à valider%")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const parClient = new Map<string, any>();
    for (const r of (risques.data as any[]) ?? []) parClient.set(r.client_id, r);
    const attente = new Set<string>(((taches.data as any[]) ?? []).map((t) => t.client_id));

    setLignes(
      (clients ?? []).map((c) => {
        const r = parClient.get(c.id);
        return {
          id: c.id,
          reference: c.reference ?? null,
          nom: c.nom,
          prenom: c.prenom ?? null,
          score_risque: r?.score_risque ?? null,
          niveau_vigilance: (r?.niveau_vigilance as Vigilance | undefined) ?? null,
          ppe_detecte: Boolean(r?.ppe_detecte),
          prochaine_revue_le: r?.prochaine_revue_le ?? null,
          decide_le: r?.decide_le ?? null,
          validation_en_attente: attente.has(c.id),
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    charger();
  }, []);

  const lancerEvaluation = async () => {
    setSummary(null);
    setProcessing(true);
    setProgress({ current: 0, total: 0 });

    try {
      const { client_ids } = await listerNonEvalues();
      setProgress({ current: 0, total: client_ids.length });

      let traites = 0;
      let renforcee = 0;
      const erreurs: string[] = [];

      for (const clientId of client_ids) {
        try {
          const res = await evaluerClient({ data: { client_id: clientId } });
          traites += 1;
          if (res.niveau_vigilance === "renforcee") renforcee += 1;
        } catch (e) {
          erreurs.push(`${clientId} : ${e instanceof Error ? e.message : "erreur"}`);
        }
        setProgress({ current: traites, total: client_ids.length });
      }

      setSummary({ traites, renforcee, erreurs });
      await charger();
    } finally {
      setProcessing(false);
    }
  };

  const compteurs = useMemo(
    () => ({
      total: lignes.length,
      renforcee: lignes.filter((l) => l.niveau_vigilance === "renforcee").length,
      retard: lignes.filter((l) => enRetard(l.prochaine_revue_le)).length,
      validations: lignes.filter((l) => l.validation_en_attente).length,
    }),
    [lignes],
  );

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter((l) => {
      if (vigilance !== "tous" && l.niveau_vigilance !== vigilance) return false;
      if (revueRetard && !enRetard(l.prochaine_revue_le)) return false;
      if (q && !`${l.prenom ?? ""} ${l.nom} ${l.reference ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lignes, vigilance, revueRetard, recherche]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Compteur libelle="Clients au registre" valeur={compteurs.total} />
        <Compteur libelle="Vigilance renforcée" valeur={compteurs.renforcee} alerte={compteurs.renforcee > 0} />
        <Compteur libelle="Revues en retard" valeur={compteurs.retard} alerte={compteurs.retard > 0} />
        <Compteur
          libelle="Validations hiérarchiques en attente"
          valeur={compteurs.validations}
          alerte={compteurs.validations > 0}
        />
      </div>

      <div className="crm-card p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-ink-muted">Niveau de vigilance</label>
            <Select value={vigilance} onValueChange={(v) => setVigilance(v as typeof vigilance)}>
              <SelectTrigger className="mt-1 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les niveaux</SelectItem>
                <SelectItem value="simplifiee">Simplifiée</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="renforcee">Renforcée</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-ink-muted">Recherche</label>
            <Input
              className="mt-1 w-56"
              placeholder="Nom ou référence"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={revueRetard} onChange={(e) => setRevueRetard(e.target.checked)} />
            Revue en retard uniquement
          </label>
          {isAdmin && (
            <div className="ml-auto flex flex-col items-end gap-1">
              <Button onClick={lancerEvaluation} disabled={processing || loading} size="sm">
                {processing
                  ? `Calcul en cours… ${progress.current}/${progress.total}`
                  : "Calculer le risque LCB-FT — clients non évalués"}
              </Button>
              {summary && (
                <p className="text-xs text-ink-muted">
                  {summary.traites} client{summary.traites > 1 ? "s" : ""} évalué
                  {summary.traites > 1 ? "s" : ""}
                  {summary.renforcee > 0 ? `, ${summary.renforcee} en vigilance renforcée` : ""}
                  {summary.erreurs.length > 0 ? `, ${summary.erreurs.length} erreur(s)` : ""}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Risque LCB-FT</TableHead>
                <TableHead>Vigilance</TableHead>
                <TableHead>Prochaine revue</TableHead>
                <TableHead>Alertes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-ink-muted">
                    Chargement…
                  </TableCell>
                </TableRow>
              )}
              {!loading && filtrees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-ink-muted">
                    Aucun client ne correspond aux filtres.
                  </TableCell>
                </TableRow>
              )}
              {filtrees.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="font-medium text-ink">
                      {l.prenom ? `${l.prenom} ` : ""}
                      {l.nom}
                    </div>
                    <div className="text-xs text-ink-muted">{l.reference ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {l.score_risque === null ? (
                      <span className="text-ink-muted">Non évalué</span>
                    ) : (
                      `${l.score_risque}/100`
                    )}
                  </TableCell>
                  <TableCell>
                    {l.niveau_vigilance ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${VIGILANCE_STYLE[l.niveau_vigilance]}`}
                      >
                        {VIGILANCE_LABEL[l.niveau_vigilance]}
                      </span>
                    ) : (
                      <span className="text-sm text-ink-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className={enRetard(l.prochaine_revue_le) ? "font-semibold text-red-700" : ""}>
                      {fmt(l.prochaine_revue_le)}
                    </span>
                    {enRetard(l.prochaine_revue_le) && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-900">
                        En retard
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {l.ppe_detecte && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-900">
                          PPE
                        </span>
                      )}
                      {l.validation_en_attente && !l.decide_le && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                          Validation direction en attente
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/espace/clients/$id"
                      params={{ id: l.id }}
                      search={{ tab: "conformite" }}
                      className="text-sm underline"
                    >
                      Ouvrir
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

