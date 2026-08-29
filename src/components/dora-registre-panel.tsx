import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { exporterRegistreDoraPdf } from "@/lib/conformite-registres.functions";
import { telechargerPdfBase64 } from "@/lib/telecharger-pdf";

/* Registre DORA : prestataires informatiques tiers + incidents informatiques. */

type Systeme = {
  id: string;
  nom: string;
  fournisseur: string | null;
  categorie: string;
  criticite: "faible" | "moyenne" | "elevee" | "critique";
  donnees_traitees: string | null;
  localisation_donnees: string | null;
  plan_continuite: string | null;
  derniere_revue_le: string | null;
  actif: boolean;
};

type Incident = {
  id: string;
  systeme_id: string | null;
  titre: string;
  description: string | null;
  survenu_le: string;
  resolu_le: string | null;
  gravite: "mineur" | "majeur" | "critique";
  impact_donnees: boolean;
  notification_acpr: boolean;
  notification_cnil: boolean;
  mesures_correctives: string | null;
  statut: "ouvert" | "en_cours" | "resolu";
};

const CRITICITE_STYLE: Record<Systeme["criticite"], string> = {
  faible: "border-emerald-300 bg-emerald-100 text-emerald-900",
  moyenne: "border-sky-300 bg-sky-100 text-sky-900",
  elevee: "border-amber-300 bg-amber-100 text-amber-900",
  critique: "border-red-300 bg-red-100 text-red-900",
};

const GRAVITE_STYLE: Record<Incident["gravite"], string> = {
  mineur: "border-emerald-300 bg-emerald-100 text-emerald-900",
  majeur: "border-amber-300 bg-amber-100 text-amber-900",
  critique: "border-red-300 bg-red-100 text-red-900",
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtHeure = (d: string | null) => (d ? new Date(d).toLocaleString("fr-FR") : "—");

/* DORA impose une revue périodique des prestataires informatiques : alerte au-delà de 12 mois. */
const revueEnRetard = (d: string | null) => {
  if (!d) return true;
  const limite = new Date(d);
  limite.setFullYear(limite.getFullYear() + 1);
  return limite < new Date();
};

export function DoraRegistrePanel({ isAdmin }: { isAdmin: boolean }) {
  const [systemes, setSystemes] = useState<Systeme[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportEnCours, setExportEnCours] = useState(false);
  const exporter = useServerFn(exporterRegistreDoraPdf);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, i] = await Promise.all([
      supabase.from("dora_systemes_tiers").select("*").order("nom"),
      supabase.from("dora_incidents").select("*").order("survenu_le", { ascending: false }),
    ]);
    setSystemes((s.data as unknown as Systeme[]) ?? []);
    setIncidents((i.data as unknown as Incident[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exporterPdf = async () => {
    setExportEnCours(true);
    try {
      const res = await exporter({});
      telechargerPdfBase64(res.pdf_base64, res.nom_fichier);
      toast.success(
        res.drive_url
          ? "Registre DORA exporté et archivé sur Drive (registre DDA/ACPR)."
          : "Registre DORA exporté (archivage Drive à resynchroniser).",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setExportEnCours(false);
    }
  };

  const revoirSysteme = async (s: Systeme) => {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("dora_systemes_tiers")
      .update({ derniere_revue_le: aujourdhui } as never)
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Revue enregistrée.");
    await load();
  };

  const majIncident = async (i: Incident, champs: Partial<Incident>) => {
    const { error } = await supabase.from("dora_incidents").update(champs as never).eq("id", i.id);
    if (error) return toast.error(error.message);
    await load();
  };

  const ouverts = incidents.filter((i) => i.statut !== "resolu").length;
  const revuesDues = systemes.filter((s) => s.actif && revueEnRetard(s.derniere_revue_le)).length;

  return (
    <div className="space-y-6">
      <div className="crm-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="font-serif text-lg font-medium">Registre DORA — systèmes tiers & incidents</h3>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              Recensement des prestataires informatiques critiques du cabinet et registre des incidents
              informatiques (résilience opérationnelle numérique).
            </p>
            <p className="mt-3 text-sm">
              {systemes.length} système(s) recensé(s) · {incidents.length} incident(s) déclaré(s) ·{" "}
              <span className={ouverts > 0 ? "font-medium text-amber-800" : "text-ink-muted"}>
                {ouverts} non clos
              </span>
            </p>
            {revuesDues > 0 && (
              <p className="mt-2 text-sm font-medium text-amber-800">
                {revuesDues} prestataire(s) à revoir : revue annuelle dépassée ou jamais réalisée.
              </p>
            )}
          </div>

          <Button onClick={exporterPdf} disabled={exportEnCours || loading}>
            {exportEnCours ? "Export…" : "Exporter en PDF (Drive)"}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : (
        <>
          <div className="crm-card overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Système</th>
                  <th className="px-4 py-3">Fournisseur</th>
                  <th className="px-4 py-3">Criticité</th>
                  <th className="px-4 py-3">Localisation des données</th>
                  <th className="px-4 py-3">Plan de continuité</th>
                  <th className="px-4 py-3">Dernière revue</th>
                </tr>
              </thead>
              <tbody>
                {systemes.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{s.nom}</span>
                      <span className="block text-xs text-ink-muted">
                        {s.categorie}
                        {s.donnees_traitees ? ` — ${s.donnees_traitees}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3">{s.fournisseur ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${CRITICITE_STYLE[s.criticite]}`}>
                        {s.criticite}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{s.localisation_donnees ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">{s.plan_continuite ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {fmtDate(s.derniere_revue_le)}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => revoirSysteme(s)}
                          className="ml-2 rounded-md border border-line px-2 py-0.5"
                        >
                          Revue ce jour
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="crm-card p-6">
            <h4 className="font-serif text-base font-medium">Incidents informatiques</h4>
            {incidents.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Aucun incident déclaré.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {incidents.map((i) => (
                  <li key={i.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{i.titre}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${GRAVITE_STYLE[i.gravite]}`}>
                        {i.gravite}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      Survenu le {fmtHeure(i.survenu_le)}
                      {i.resolu_le ? ` · résolu le ${fmtHeure(i.resolu_le)}` : ""} · statut {i.statut}
                      {i.impact_donnees ? " · données personnelles impactées" : ""}
                      {i.notification_acpr ? " · ACPR notifiée" : ""}
                      {i.notification_cnil ? " · CNIL notifiée" : ""}
                    </p>
                    {i.description && <p className="mt-2 text-sm">{i.description}</p>}
                    {i.mesures_correctives && (
                      <p className="mt-1 text-sm text-ink-muted">Mesures : {i.mesures_correctives}</p>
                    )}
                    {isAdmin && i.statut !== "resolu" && (
                      <Button
                        variant="outline"
                        className="mt-3"
                        onClick={() =>
                          majIncident(i, { statut: "resolu", resolu_le: new Date().toISOString() })
                        }
                      >
                        Clore l'incident
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <DeclarerIncident systemes={systemes} onCreated={load} />
          </div>
        </>
      )}
    </div>
  );
}

function DeclarerIncident({ systemes, onCreated }: { systemes: Systeme[]; onCreated: () => void }) {
  const [titre, setTitre] = useState("");
  const [systemeId, setSystemeId] = useState("");
  const [gravite, setGravite] = useState<Incident["gravite"]>("mineur");
  const [description, setDescription] = useState("");
  const [impact, setImpact] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: session } = await supabase.auth.getUser();
    const { error } = await supabase.from("dora_incidents").insert({
      titre: titre.trim(),
      systeme_id: systemeId || null,
      gravite,
      description: description.trim() || null,
      impact_donnees: impact,
      created_by: session.user?.id ?? null,
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    setTitre("");
    setDescription("");
    setImpact(false);
    toast.success("Incident déclaré au registre.");
    onCreated();
  };

  return (
    <form onSubmit={submit} className="mt-6 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2">
      <p className="crm-eyebrow sm:col-span-2">Déclarer un incident</p>
      <Input required placeholder="Intitulé de l'incident" value={titre} onChange={(e) => setTitre(e.target.value)} />
      <select
        value={systemeId}
        onChange={(e) => setSystemeId(e.target.value)}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      >
        <option value="">Système concerné…</option>
        {systemes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nom}
          </option>
        ))}
      </select>
      <select
        value={gravite}
        onChange={(e) => setGravite(e.target.value as Incident["gravite"])}
        className="rounded-md border border-line bg-background px-3 py-2 text-sm"
      >
        <option value="mineur">Mineur</option>
        <option value="majeur">Majeur</option>
        <option value="critique">Critique</option>
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={impact} onChange={(e) => setImpact(e.target.checked)} />
        Données personnelles impactées
      </label>
      <Textarea
        rows={2}
        className="sm:col-span-2"
        placeholder="Description, chronologie, mesures immédiates"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={saving || !titre.trim()}>
          {saving ? "Enregistrement…" : "Déclarer l'incident"}
        </Button>
      </div>
    </form>
  );
}
