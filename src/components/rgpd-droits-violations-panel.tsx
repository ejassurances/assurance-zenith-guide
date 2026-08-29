import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* Registres RGPD opérationnels : demandes de droits des personnes + violations de données. */

type Demande = {
  id: string;
  demandeur_nom: string;
  demandeur_email: string | null;
  type: "acces" | "rectification" | "effacement" | "opposition" | "limitation" | "portabilite";
  canal_reception: string | null;
  recue_le: string;
  echeance_le: string;
  statut: "recue" | "en_cours" | "repondue" | "refusee";
  reponse_le: string | null;
  reponse_resume: string | null;
};

type Violation = {
  id: string;
  titre: string;
  description: string | null;
  survenue_le: string;
  decouverte_le: string;
  nature: string | null;
  donnees_concernees: string | null;
  personnes_concernees_nb: number | null;
  gravite: "mineure" | "majeure" | "critique";
  notification_cnil: boolean;
  notification_cnil_le: string | null;
  notification_personnes: boolean;
  mesures: string | null;
  statut: "ouverte" | "en_cours" | "cloturee";
};

const TYPE_LABEL: Record<Demande["type"], string> = {
  acces: "Droit d'accès",
  rectification: "Rectification",
  effacement: "Effacement",
  opposition: "Opposition",
  limitation: "Limitation",
  portabilite: "Portabilité",
};

const STATUT_DEMANDE: Record<Demande["statut"], string> = {
  recue: "Reçue",
  en_cours: "En cours",
  repondue: "Répondue",
  refusee: "Refusée",
};

const GRAVITE_STYLE: Record<Violation["gravite"], string> = {
  mineure: "border-emerald-300 bg-emerald-100 text-emerald-900",
  majeure: "border-amber-300 bg-amber-100 text-amber-900",
  critique: "border-red-300 bg-red-100 text-red-900",
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const plusUnMois = (d: string) => {
  const date = new Date(`${d}T00:00:00`);
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
};

export function RgpdDroitsViolationsPanel({ canManage }: { canManage: boolean }) {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);

  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<Demande["type"]>("acces");
  const [canal, setCanal] = useState("");
  const [recueLe, setRecueLe] = useState(aujourdhui());

  const [titre, setTitre] = useState("");
  const [gravite, setGravite] = useState<Violation["gravite"]>("mineure");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [d, v] = await Promise.all([
      supabase.from("rgpd_demandes_droits").select("*").order("recue_le", { ascending: false }),
      supabase.from("rgpd_violations").select("*").order("decouverte_le", { ascending: false }),
    ]);
    setDemandes((d.data as unknown as Demande[]) ?? []);
    setViolations((v.data as unknown as Violation[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enRetard = useMemo(
    () =>
      demandes.filter(
        (d) => (d.statut === "recue" || d.statut === "en_cours") && d.echeance_le < aujourdhui(),
      ),
    [demandes],
  );
  const aTraiter = demandes.filter((d) => d.statut === "recue" || d.statut === "en_cours").length;
  const violationsOuvertes = violations.filter((v) => v.statut !== "cloturee").length;

  const ajouterDemande = async () => {
    if (!nom.trim()) return toast.error("Indiquez le nom du demandeur.");
    const { error } = await supabase.from("rgpd_demandes_droits").insert({
      demandeur_nom: nom.trim(),
      demandeur_email: email.trim() || null,
      type,
      canal_reception: canal.trim() || null,
      recue_le: recueLe,
      echeance_le: plusUnMois(recueLe),
    } as never);
    if (error) return toast.error(error.message);
    setNom("");
    setEmail("");
    setCanal("");
    setRecueLe(aujourdhui());
    toast.success("Demande enregistrée — échéance légale à un mois.");
    await load();
  };

  const majDemande = async (d: Demande, champs: Partial<Demande>) => {
    setDemandes((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...champs } : x)));
    const { error } = await supabase.from("rgpd_demandes_droits").update(champs as never).eq("id", d.id);
    if (error) {
      toast.error(error.message);
      await load();
    }
  };

  const ajouterViolation = async () => {
    if (!titre.trim()) return toast.error("Indiquez l'intitulé de la violation.");
    const { error } = await supabase.from("rgpd_violations").insert({
      titre: titre.trim(),
      description: description.trim() || null,
      gravite,
    } as never);
    if (error) return toast.error(error.message);
    setTitre("");
    setDescription("");
    setGravite("mineure");
    toast.success("Violation consignée au registre.");
    await load();
  };

  const majViolation = async (v: Violation, champs: Partial<Violation>) => {
    setViolations((prev) => prev.map((x) => (x.id === v.id ? { ...x, ...champs } : x)));
    const { error } = await supabase.from("rgpd_violations").update(champs as never).eq("id", v.id);
    if (error) {
      toast.error(error.message);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="crm-card p-6">
        <h3 className="font-serif text-lg font-medium">Droits des personnes & violations de données</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Suivi des demandes d'exercice des droits (accès, rectification, effacement…) avec l'échéance légale
          d'un mois, et registre des violations de données personnelles (RGPD art. 33).
        </p>
        <p className="mt-3 text-sm">
          {aTraiter} demande(s) à traiter ·{" "}
          <span className={enRetard.length ? "font-medium text-red-800" : "text-ink-muted"}>
            {enRetard.length} hors délai
          </span>{" "}
          · {violationsOuvertes} violation(s) non clôturée(s)
        </p>
        {enRetard.length > 0 && (
          <p className="mt-2 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-xs text-red-900">
            Échéance d'un mois dépassée pour : {enRetard.map((d) => d.demandeur_nom).join(", ")}.
          </p>
        )}
      </div>

      {/* Demandes de droits */}
      <div className="crm-card p-6">
        <h4 className="font-serif text-base font-medium">Demandes d'exercice des droits</h4>

        {canManage && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input placeholder="Nom du demandeur" value={nom} onChange={(e) => setNom(e.target.value)} />
            <Input placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select value={type} onValueChange={(v) => setType(v as Demande["type"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Canal (e-mail, courrier…)" value={canal} onChange={(e) => setCanal(e.target.value)} />
            <div className="flex gap-2">
              <Input type="date" value={recueLe} onChange={(e) => setRecueLe(e.target.value)} />
              <Button onClick={ajouterDemande}>Ajouter</Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="mt-4 text-sm text-ink-muted">Chargement…</p>
        ) : demandes.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">Aucune demande enregistrée.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Demandeur</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Reçue le</th>
                  <th className="px-3 py-2">Échéance</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Réponse</th>
                </tr>
              </thead>
              <tbody>
                {demandes.map((d) => {
                  const retard = (d.statut === "recue" || d.statut === "en_cours") && d.echeance_le < aujourdhui();
                  return (
                    <tr key={d.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium">{d.demandeur_nom}</span>
                        <span className="block text-xs text-ink-muted">
                          {d.demandeur_email ?? "—"}
                          {d.canal_reception ? ` · ${d.canal_reception}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">{TYPE_LABEL[d.type]}</td>
                      <td className="px-3 py-2 text-xs">{fmt(d.recue_le)}</td>
                      <td className={`px-3 py-2 text-xs ${retard ? "font-medium text-red-800" : ""}`}>
                        {fmt(d.echeance_le)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {canManage ? (
                          <Select
                            value={d.statut}
                            onValueChange={(v) =>
                              majDemande(d, {
                                statut: v as Demande["statut"],
                                ...(v === "repondue" || v === "refusee"
                                  ? { reponse_le: d.reponse_le ?? aujourdhui() }
                                  : {}),
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUT_DEMANDE).map(([k, label]) => (
                                <SelectItem key={k} value={k}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          STATUT_DEMANDE[d.statut]
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="block text-ink-muted">{fmt(d.reponse_le)}</span>
                        {canManage ? (
                          <Textarea
                            rows={2}
                            className="mt-1"
                            defaultValue={d.reponse_resume ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== (d.reponse_resume ?? "")) majDemande(d, { reponse_resume: v || null });
                            }}
                          />
                        ) : (
                          <span>{d.reponse_resume ?? "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Violations */}
      <div className="crm-card p-6">
        <h4 className="font-serif text-base font-medium">Registre des violations de données (art. 33)</h4>

        {canManage && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="Intitulé" value={titre} onChange={(e) => setTitre(e.target.value)} />
            <Select value={gravite} onValueChange={(v) => setGravite(v as Violation["gravite"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mineure">Mineure</SelectItem>
                <SelectItem value="majeure">Majeure</SelectItem>
                <SelectItem value="critique">Critique</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Description courte"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Button onClick={ajouterViolation}>Consigner</Button>
          </div>
        )}

        {loading ? (
          <p className="mt-4 text-sm text-ink-muted">Chargement…</p>
        ) : violations.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">Aucune violation consignée.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {violations.map((v) => (
              <div key={v.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{v.titre}</p>
                    <p className="text-xs text-ink-muted">
                      Découverte le {fmt(v.decouverte_le)} · survenue le {fmt(v.survenue_le)}
                      {v.personnes_concernees_nb ? ` · ${v.personnes_concernees_nb} personne(s)` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${GRAVITE_STYLE[v.gravite]}`}>
                    {v.gravite}
                  </span>
                </div>

                {v.description && <p className="mt-2 text-sm text-ink">{v.description}</p>}

                {canManage ? (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      rows={2}
                      placeholder="Mesures correctives"
                      defaultValue={v.mesures ?? ""}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val !== (v.mesures ?? "")) majViolation(v, { mesures: val || null });
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={v.notification_cnil}
                          onChange={(e) =>
                            majViolation(v, {
                              notification_cnil: e.target.checked,
                              notification_cnil_le: e.target.checked ? new Date().toISOString() : null,
                            })
                          }
                        />
                        Notifiée à la CNIL {v.notification_cnil_le ? `(${fmt(v.notification_cnil_le)})` : ""}
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={v.notification_personnes}
                          onChange={(e) => majViolation(v, { notification_personnes: e.target.checked })}
                        />
                        Personnes concernées informées
                      </label>
                      <Select
                        value={v.statut}
                        onValueChange={(val) => majViolation(v, { statut: val as Violation["statut"] })}
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ouverte">Ouverte</SelectItem>
                          <SelectItem value="en_cours">En cours</SelectItem>
                          <SelectItem value="cloturee">Clôturée</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-ink-muted">
                    Statut : {v.statut} · CNIL : {v.notification_cnil ? "notifiée" : "non notifiée"}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
