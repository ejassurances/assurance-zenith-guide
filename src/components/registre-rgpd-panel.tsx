import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { revisionAnnuelleDue } from "@/lib/cartographie-risques";
import { exporterRegistreRgpdPdf } from "@/lib/conformite-registres.functions";
import { telechargerPdfBase64 } from "@/lib/telecharger-pdf";

/* Registre des traitements RGPD (Art. 30) — consultation cabinet, édition admin. */

type Traitement = {
  id: string;
  nom_traitement: string;
  finalite: string | null;
  base_legale: string | null;
  categories_donnees: string | null;
  personnes_concernees: string | null;
  destinataires: string | null;
  sous_traitants: string | null;
  duree_conservation: string | null;
  mesures_securite: string | null;
  transfert_hors_ue: boolean;
  version: number;
  revise_le: string | null;
};

const CHAMPS: { key: keyof Traitement; label: string }[] = [
  { key: "finalite", label: "Finalité" },
  { key: "base_legale", label: "Base légale" },
  { key: "categories_donnees", label: "Catégories de données" },
  { key: "personnes_concernees", label: "Personnes concernées" },
  { key: "destinataires", label: "Destinataires" },
  { key: "sous_traitants", label: "Sous-traitants" },
  { key: "duree_conservation", label: "Durée de conservation" },
  { key: "mesures_securite", label: "Mesures de sécurité" },
];

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

export function RegistreRgpdPanel({ isAdmin }: { isAdmin: boolean }) {
  const [lignes, setLignes] = useState<Traitement[]>([]);
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("registre_traitements_rgpd")
      .select("*")
      .order("created_at", { ascending: true });
    setLignes((data as unknown as Traitement[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const derniereValidation = useMemo(() => {
    const dates = lignes.map((l) => l.revise_le).filter(Boolean) as string[];
    if (dates.length === 0 || dates.length < lignes.length) return null;
    return dates.sort()[0]!;
  }, [lignes]);

  const versionCourante = useMemo(
    () => (lignes.length ? Math.max(...lignes.map((l) => l.version)) : 1),
    [lignes],
  );

  const revisionDue = revisionAnnuelleDue(derniereValidation);

  const patch = async (ligne: Traitement, champs: Partial<Traitement>) => {
    if (!isAdmin) return;
    setLignes((prev) => prev.map((l) => (l.id === ligne.id ? { ...l, ...champs } : l)));
    const { error } = await supabase
      .from("registre_traitements_rgpd")
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
          .from("registre_traitements_rgpd")
          .update({ revise_le: aujourdhui, version: l.version + 1 } as never)
          .eq("id", l.id);
        if (error) throw error;
      }
      toast.success(`Registre validé (version ${versionCourante + 1}).`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Validation impossible.");
    } finally {
      setValidation(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="crm-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="font-serif text-lg font-medium">Registre des traitements (RGPD, art. 30)</h3>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              Inventaire des traitements de données mis en œuvre par le cabinet : finalité, base légale,
              destinataires, durée de conservation et mesures de sécurité.
            </p>
            <p className="mt-3 text-sm">
              Version {versionCourante} · Dernière validation globale :{" "}
              <span className="font-medium">{fmtDate(derniereValidation)}</span>
            </p>
            {revisionDue && (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-900">
                {derniereValidation
                  ? "Plus d'un an depuis la dernière validation : mise à jour du registre attendue."
                  : "Le registre n'a jamais été formellement validé : à examiner puis valider."}
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
        <p className="text-sm text-ink-muted">Aucun traitement enregistré.</p>
      ) : (
        lignes.map((l) => (
          <div key={l.id} className="crm-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h4 className="font-serif text-base font-medium">{l.nom_traitement}</h4>
              <div className="flex items-center gap-2 text-xs">
                {l.transfert_hors_ue && (
                  <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-red-900">
                    Transfert hors UE
                  </span>
                )}
                <span className="text-ink-muted">Révisé le {fmtDate(l.revise_le)}</span>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {CHAMPS.map((c) => (
                <div key={String(c.key)}>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-ink-muted">{c.label}</label>
                  {isAdmin ? (
                    <Textarea
                      rows={2}
                      defaultValue={(l[c.key] as string | null) ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== ((l[c.key] as string | null) ?? "")) patch(l, { [c.key]: v || null } as Partial<Traitement>);
                      }}
                    />
                  ) : (
                    <p className="text-sm text-ink">{(l[c.key] as string | null) ?? "—"}</p>
                  )}
                </div>
              ))}
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={l.transfert_hors_ue}
                disabled={!isAdmin}
                onChange={(e) => patch(l, { transfert_hors_ue: e.target.checked })}
              />
              Transfert de données hors Union européenne
            </label>
          </div>
        ))
      )}
    </div>
  );
}
