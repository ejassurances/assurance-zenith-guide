import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { joursAvantFinTrimestre, tailleEchantillon, trimestreCourant } from "@/lib/controle-interne";

/* Contrôle interne de 1er niveau : échantillonnage trimestriel + registre horodaté. */

type Resultat = "a_faire" | "conforme" | "anomalie";

type Controle = {
  id: string;
  periode: string;
  client_id: string;
  mode_selection: "aleatoire" | "ciblee";
  motif_ciblage: string | null;
  controleur_id: string | null;
  date_controle: string | null;
  resultat: Resultat;
  anomalies_constatees: string | null;
  actions_correctives: string | null;
  statut: "a_faire" | "clos";
  clients: { reference: string | null; nom: string; prenom: string | null } | null;
};

const RESULTAT_LABEL: Record<Resultat, string> = {
  a_faire: "À contrôler",
  conforme: "Conforme",
  anomalie: "Anomalie",
};

const RESULTAT_STYLE: Record<Resultat, string> = {
  a_faire: "bg-black/5 text-ink-muted border-line",
  conforme: "bg-emerald-100 text-emerald-900 border-emerald-300",
  anomalie: "bg-red-100 text-red-900 border-red-300",
};

const nomClient = (c: Controle) =>
  [c.clients?.prenom, c.clients?.nom].filter(Boolean).join(" ") || "Client";

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export function ControleInternePanel({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const periode = trimestreCourant();
  const [controles, setControles] = useState<Controle[]>([]);
  const [profils, setProfils] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lancement, setLancement] = useState(false);
  const [filtrePeriode, setFiltrePeriode] = useState("toutes");
  const [filtreResultat, setFiltreResultat] = useState<"tous" | Resultat>("tous");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: p }] = await Promise.all([
      supabase
        .from("controles_internes")
        .select(
          "id,periode,client_id,mode_selection,motif_ciblage,controleur_id,date_controle,resultat,anomalies_constatees,actions_correctives,statut,clients(reference,nom,prenom)",
        )
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,full_name,email"),
    ]);
    setControles((data as unknown as Controle[]) ?? []);
    const map: Record<string, string> = {};
    for (const row of ((p as any[]) ?? [])) map[row.id] = row.full_name || row.email || "—";
    setProfils(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enCours = useMemo(() => controles.filter((c) => c.periode === periode), [controles, periode]);
  const controlesFaits = enCours.filter((c) => c.statut === "clos").length;
  const echantillonExiste = enCours.length > 0;
  const restants = enCours.length - controlesFaits;

  const periodes = useMemo(
    () => Array.from(new Set(controles.map((c) => c.periode))).sort().reverse(),
    [controles],
  );

  const registre = useMemo(
    () =>
      controles.filter(
        (c) =>
          (filtrePeriode === "toutes" || c.periode === filtrePeriode) &&
          (filtreResultat === "tous" || c.resultat === filtreResultat),
      ),
    [controles, filtrePeriode, filtreResultat],
  );

  const lancerEchantillonnage = async () => {
    if (!isAdmin || echantillonExiste) return;
    setLancement(true);
    try {
      const { data: clients } = await supabase
        .from("clients")
        .select("id,reference,nom,prenom")
        .eq("statut", "actif");
      const actifs = (clients as any[]) ?? [];
      const taille = tailleEchantillon(actifs.length);
      if (taille === 0) {
        toast.error("Aucun client actif à contrôler.");
        return;
      }

      const { data: risques } = await supabase
        .from("client_risque_lcbft")
        .select("client_id,score_risque,niveau_vigilance,ppe_detecte")
        .in("client_id", actifs.map((c) => c.id));
      const parClient = new Map<string, any>();
      for (const r of ((risques as any[]) ?? [])) parClient.set(r.client_id, r);

      const nbCiblee = Math.ceil(taille / 2);
      const scoreDe = (id: string) => parClient.get(id)?.score_risque ?? 0;
      const prioritaires = actifs
        .filter((c) => {
          const r = parClient.get(c.id);
          return r?.niveau_vigilance === "renforcee" || r?.ppe_detecte;
        })
        .sort((a, b) => scoreDe(b.id) - scoreDe(a.id));
      const autresParScore = actifs
        .filter((c) => !prioritaires.some((p) => p.id === c.id))
        .sort((a, b) => scoreDe(b.id) - scoreDe(a.id));

      const ciblees = [...prioritaires, ...autresParScore].slice(0, nbCiblee);
      const reste = actifs.filter((c) => !ciblees.some((x) => x.id === c.id));
      for (let i = reste.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [reste[i], reste[j]] = [reste[j], reste[i]];
      }
      const aleatoires = reste.slice(0, taille - ciblees.length);

      const motifDe = (id: string) => {
        const r = parClient.get(id);
        if (r?.ppe_detecte) return "PPE détecté";
        if (r?.niveau_vigilance === "renforcee") return "Vigilance renforcée";
        return `Score de risque élevé (${r?.score_risque ?? 0}/100)`;
      };

      const lignes = [
        ...ciblees.map((c) => ({
          periode,
          client_id: c.id,
          mode_selection: "ciblee" as const,
          motif_ciblage: motifDe(c.id),
        })),
        ...aleatoires.map((c) => ({
          periode,
          client_id: c.id,
          mode_selection: "aleatoire" as const,
          motif_ciblage: null,
        })),
      ];

      const { error } = await supabase.from("controles_internes").insert(lignes as never);
      if (error) throw error;

      const nomsSelection = [...ciblees, ...aleatoires]
        .map((c) => `• ${[c.prenom, c.nom].filter(Boolean).join(" ")} (${c.reference ?? "—"})`)
        .join("\n");
      await supabase.from("taches").insert({
        titre: `Contrôle interne ${periode} — ${lignes.length} dossiers à vérifier`,
        description: [
          `Échantillon de contrôle interne de 1er niveau (${lignes.length} dossiers, ${ciblees.length} ciblés / ${aleatoires.length} aléatoires) :`,
          nomsSelection,
          "",
          "Saisie des résultats : Conformité → onglet Contrôle interne.",
        ].join("\n"),
        priorite: "haute",
        statut: "a_faire",
        assignee_id: user?.id ?? null,
        created_by: user?.id ?? null,
        echeance: new Date().toISOString().slice(0, 10),
      } as never);

      toast.success(`Échantillon ${periode} généré (${lignes.length} dossiers).`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Échantillonnage impossible.");
    } finally {
      setLancement(false);
    }
  };

  const jours = joursAvantFinTrimestre();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface-elevated p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Trimestre en cours</p>
            <h3 className="mt-1 font-serif text-2xl text-ink">{periode}</h3>
            <p className="mt-2 text-sm text-ink-muted">
              {echantillonExiste
                ? `${controlesFaits}/${enCours.length} dossiers contrôlés · ${restants} restant(s) · ${jours} jour(s) avant la fin du trimestre`
                : "Aucun échantillon généré pour ce trimestre (référentiel : 10-15 % des dossiers, sélection aléatoire + ciblée)."}
            </p>
            {echantillonExiste && (
              <div className="mt-3 h-2 w-64 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full bg-emerald-600"
                  style={{ width: `${enCours.length ? (controlesFaits / enCours.length) * 100 : 0}%` }}
                />
              </div>
            )}
          </div>
          {isAdmin && (
            <Button onClick={lancerEchantillonnage} disabled={echantillonExiste || lancement}>
              {lancement ? "Génération…" : `Lancer l'échantillonnage — ${periode}`}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface-elevated p-6">
        <h3 className="font-serif text-lg text-ink">Échantillon {periode}</h3>
        {loading && <p className="mt-3 text-sm text-ink-muted">Chargement…</p>}
        {!loading && enCours.length === 0 && (
          <p className="mt-3 text-sm text-ink-muted">Aucun dossier dans l'échantillon du trimestre.</p>
        )}
        <div className="mt-4 space-y-3">
          {enCours.map((c) => (
            <LigneControle key={c.id} controle={c} profils={profils} onSaved={load} userId={user?.id ?? null} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface-elevated p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-serif text-lg text-ink">Registre des contrôles</h3>
          <div className="flex flex-wrap gap-3">
            <Select value={filtrePeriode} onValueChange={setFiltrePeriode}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="toutes">Tous les trimestres</SelectItem>
                {periodes.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtreResultat} onValueChange={(v) => setFiltreResultat(v as typeof filtreResultat)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous résultats</SelectItem>
                <SelectItem value="a_faire">À contrôler</SelectItem>
                <SelectItem value="conforme">Conforme</SelectItem>
                <SelectItem value="anomalie">Anomalie</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trimestre</TableHead>
                <TableHead>Dossier</TableHead>
                <TableHead>Sélection</TableHead>
                <TableHead>Contrôleur</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Résultat</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {registre.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-ink-muted">
                    Aucun contrôle pour ces filtres.
                  </TableCell>
                </TableRow>
              )}
              {registre.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{c.periode}</TableCell>
                  <TableCell>
                    <div className="font-medium text-ink">{nomClient(c)}</div>
                    <div className="text-xs text-ink-muted">{c.clients?.reference ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.mode_selection === "ciblee" ? `Ciblée — ${c.motif_ciblage ?? "—"}` : "Aléatoire"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.controleur_id ? (profils[c.controleur_id] ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(c.date_controle)}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${RESULTAT_STYLE[c.resultat]}`}
                    >
                      {RESULTAT_LABEL[c.resultat]}
                    </span>
                    {c.anomalies_constatees && (
                      <p className="mt-1 max-w-sm text-xs text-ink-muted">{c.anomalies_constatees}</p>
                    )}
                    {c.actions_correctives && (
                      <p className="mt-1 max-w-sm text-xs text-ink-muted">
                        Actions : {c.actions_correctives}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/espace/clients/$id"
                      params={{ id: c.client_id }}
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

function LigneControle({
  controle,
  profils,
  onSaved,
  userId,
}: {
  controle: Controle;
  profils: Record<string, string>;
  onSaved: () => Promise<void>;
  userId: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [resultat, setResultat] = useState<"conforme" | "anomalie">("conforme");
  const [anomalies, setAnomalies] = useState("");
  const [actions, setActions] = useState("");
  const [saving, setSaving] = useState(false);

  const enregistrer = async () => {
    if (resultat === "anomalie" && !anomalies.trim()) {
      toast.error("Décrivez l'anomalie constatée.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("controles_internes")
      .update({
        resultat,
        anomalies_constatees: resultat === "anomalie" ? anomalies.trim() : null,
        actions_correctives: resultat === "anomalie" ? actions.trim() || null : null,
        controleur_id: userId,
        date_controle: new Date().toISOString(),
        statut: "clos",
      } as never)
      .eq("id", controle.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contrôle enregistré.");
    setOuvert(false);
    await onSaved();
  };

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{nomClient(controle)}</p>
          <p className="text-xs text-ink-muted">
            {controle.clients?.reference ?? "—"} ·{" "}
            {controle.mode_selection === "ciblee"
              ? `Sélection ciblée — ${controle.motif_ciblage ?? "—"}`
              : "Sélection aléatoire"}
          </p>
          {controle.statut === "clos" && (
            <p className="mt-1 text-xs text-ink-muted">
              Contrôlé le {fmtDate(controle.date_controle)} par{" "}
              {controle.controleur_id ? (profils[controle.controleur_id] ?? "—") : "—"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${RESULTAT_STYLE[controle.resultat]}`}
          >
            {RESULTAT_LABEL[controle.resultat]}
          </span>
          <Link
            to="/espace/clients/$id"
            params={{ id: controle.client_id }}
            search={{ tab: "conformite" }}
            className="text-sm underline"
          >
            Fiche client
          </Link>
          {controle.statut === "a_faire" && (
            <Button size="sm" variant="outline" onClick={() => setOuvert((v) => !v)}>
              {ouvert ? "Annuler" : "Saisir le résultat"}
            </Button>
          )}
        </div>
      </div>

      {ouvert && controle.statut === "a_faire" && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <label className="text-xs text-ink-muted">Résultat du contrôle</label>
            <Select value={resultat} onValueChange={(v) => setResultat(v as typeof resultat)}>
              <SelectTrigger className="mt-1 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conforme">Conforme</SelectItem>
                <SelectItem value="anomalie">Anomalie constatée</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {resultat === "anomalie" && (
            <>
              <div>
                <label className="text-xs text-ink-muted">Anomalies constatées</label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={anomalies}
                  onChange={(e) => setAnomalies(e.target.value)}
                  placeholder="Pièces KYC manquantes, devoir de conseil non archivé…"
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted">Actions correctives</label>
                <Input
                  className="mt-1"
                  value={actions}
                  onChange={(e) => setActions(e.target.value)}
                  placeholder="Relance client, régularisation avant le…"
                />
              </div>
            </>
          )}
          <Button size="sm" onClick={enregistrer} disabled={saving}>
            {saving ? "Enregistrement…" : "Valider le contrôle"}
          </Button>
        </div>
      )}
    </div>
  );
}
