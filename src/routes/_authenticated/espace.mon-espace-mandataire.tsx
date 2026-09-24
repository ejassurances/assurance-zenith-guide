import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { IconUserShield } from "@tabler/icons-react";
import {
  HEURES_FORMATION_DDA_MIN_AN,
  declarerFormation,
  mesFormations,
  mesPiecesKyc,
  deposerPieceKyc,
} from "@/lib/mandataire-espace.functions";

export const Route = createFileRoute("/_authenticated/espace/mon-espace-mandataire")({
  component: MonEspaceMandataire,
});

const TYPES_KYC = [
  { value: "cni", label: "Carte d'identité" },
  { value: "honorabilite", label: "Honorabilité (casier judiciaire)" },
  { value: "capacite_professionnelle", label: "Capacité professionnelle (diplôme IAS)" },
  { value: "rc_pro", label: "Attestation RC Pro" },
  { value: "orias", label: "Immatriculation ORIAS" },
  { value: "rib", label: "RIB" },
  { value: "autre", label: "Autre" },
];

function MonEspaceMandataire() {
  const { user, role } = useAuth();
  const declarer = useServerFn(declarerFormation);
  const chargerFormations = useServerFn(mesFormations);
  const chargerKyc = useServerFn(mesPiecesKyc);
  const deposerKyc = useServerFn(deposerPieceKyc);

  const [pieces, setPieces] = useState<Awaited<ReturnType<typeof mesPiecesKyc>>>([]);
  const [totaux, setTotaux] = useState<{ annee: number; heures: number }[]>([]);
  const [lignesFormation, setLignesFormation] = useState<Awaited<ReturnType<typeof mesFormations>>["lignes"]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [k, f] = await Promise.all([chargerKyc(), chargerFormations()]);
    setPieces(k);
    setTotaux(f.totauxParAnnee);
    setLignesFormation(f.lignes);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anneeCourante = new Date().getFullYear();
  const heuresAnneeCourante = totaux.find((t) => t.annee === anneeCourante)?.heures ?? 0;

  // --- Formulaire KYC ---
  const [typeKyc, setTypeKyc] = useState("cni");
  const [nomKyc, setNomKyc] = useState("");
  const [dateEmission, setDateEmission] = useState("");
  const [dateExpiration, setDateExpiration] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [depotEnCours, setDepotEnCours] = useState(false);
  const [erreurKyc, setErreurKyc] = useState<string | null>(null);

  const deposer = async () => {
    if (!user) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErreurKyc("Sélectionnez un fichier.");
      return;
    }
    setDepotEnCours(true);
    setErreurKyc(null);
    try {
      const path = `mandataires/${user.id}/${typeKyc}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const up = await supabase.storage.from("conformite-documents").upload(path, file, { upsert: false });
      if (up.error) throw new Error(up.error.message);
      await deposerKyc({
        data: {
          type: typeKyc,
          nom: nomKyc || file.name,
          storage_path: path,
          date_emission: dateEmission || undefined,
          date_expiration: dateExpiration || undefined,
        },
      });
      setNomKyc("");
      setDateEmission("");
      setDateExpiration("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      setErreurKyc(e instanceof Error ? e.message : "Dépôt impossible.");
    } finally {
      setDepotEnCours(false);
    }
  };

  // --- Formulaire formation ---
  const [intitule, setIntitule] = useState("");
  const [organisme, setOrganisme] = useState("");
  const [heures, setHeures] = useState("");
  const [dateSession, setDateSession] = useState("");
  const [declarationEnCours, setDeclarationEnCours] = useState(false);
  const [erreurFormation, setErreurFormation] = useState<string | null>(null);

  const declarerSession = async () => {
    if (!intitule.trim() || !heures) {
      setErreurFormation("L'intitulé et le nombre d'heures sont obligatoires.");
      return;
    }
    setDeclarationEnCours(true);
    setErreurFormation(null);
    try {
      const annee = dateSession ? new Date(dateSession).getFullYear() : anneeCourante;
      await declarer({
        data: {
          annee,
          heures: Number(heures),
          intitule: intitule.trim(),
          organisme: organisme.trim() || undefined,
          date_session: dateSession || undefined,
        },
      });
      setIntitule("");
      setOrganisme("");
      setHeures("");
      setDateSession("");
      await load();
    } catch (e) {
      setErreurFormation(e instanceof Error ? e.message : "Déclaration impossible.");
    } finally {
      setDeclarationEnCours(false);
    }
  };

  if (role !== "mandataire" && role !== "admin") {
    return <p className="text-sm text-ink-muted">Accès réservé aux mandataires.</p>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mon espace"
        title="KYC & obligations ACPR/DDA"
        description="Vos pièces d'identification et le suivi de vos heures de formation continue."
        icon={IconUserShield}
      />

      {loading ? (
        <p className="text-sm text-ink-muted">Chargement…</p>
      ) : (
        <>
          <section className="crm-card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="crm-eyebrow">Formation continue DDA — {anneeCourante}</p>
                <p className="mt-1 text-2xl font-serif font-medium text-ink">
                  {heuresAnneeCourante} h{" "}
                  <span className="text-sm font-sans font-normal text-ink-muted">
                    / {HEURES_FORMATION_DDA_MIN_AN} h minimum recommandé
                  </span>
                </p>
              </div>
              <span
                className={
                  "rounded-full px-3 py-1 text-xs font-medium " +
                  (heuresAnneeCourante >= HEURES_FORMATION_DDA_MIN_AN
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800")
                }
              >
                {heuresAnneeCourante >= HEURES_FORMATION_DDA_MIN_AN ? "Seuil atteint" : "Seuil non atteint"}
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Seuil légal indicatif (article L.511-2 du Code des assurances, 15h/an) — ce suivi ne
              certifie pas votre conformité, il vous aide à garder vos justificatifs à jour.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 border-t border-line pt-4">
              <div>
                <label className="text-xs font-medium text-ink-muted">Intitulé de la formation *</label>
                <input
                  value={intitule}
                  onChange={(e) => setIntitule(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted">Organisme</label>
                <input
                  value={organisme}
                  onChange={(e) => setOrganisme(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted">Heures *</label>
                <input
                  type="number"
                  step="0.5"
                  value={heures}
                  onChange={(e) => setHeures(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted">Date de la session</label>
                <input
                  type="date"
                  value={dateSession}
                  onChange={(e) => setDateSession(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            {erreurFormation && <p className="text-sm text-destructive">{erreurFormation}</p>}
            <button
              type="button"
              onClick={() => void declarerSession()}
              disabled={declarationEnCours}
              className="rounded-full bg-[#0A192F] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {declarationEnCours ? "Déclaration…" : "Déclarer cette session"}
            </button>

            {lignesFormation.length > 0 && (
              <div className="border-t border-line pt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="pb-2">Session</th>
                      <th className="pb-2">Organisme</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2 text-right">Heures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesFormation.map((l) => (
                      <tr key={l.id} className="border-t border-line">
                        <td className="py-2">{l.intitule}</td>
                        <td className="py-2 text-ink-muted">{l.organisme ?? "—"}</td>
                        <td className="py-2 text-ink-muted">
                          {l.date_session ? new Date(l.date_session).toLocaleDateString("fr-FR") : "—"}
                        </td>
                        <td className="py-2 text-right">{l.heures} h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="crm-card space-y-4 p-6">
            <p className="crm-eyebrow">Pièces KYC</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-ink-muted">Type de pièce</label>
                <select
                  value={typeKyc}
                  onChange={(e) => setTypeKyc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                >
                  {TYPES_KYC.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted">Nom du document</label>
                <input
                  value={nomKyc}
                  onChange={(e) => setNomKyc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted">Date d'émission</label>
                <input
                  type="date"
                  value={dateEmission}
                  onChange={(e) => setDateEmission(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted">Date d'expiration</label>
                <input
                  type="date"
                  value={dateExpiration}
                  onChange={(e) => setDateExpiration(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-ink-muted">Fichier</label>
                <input ref={fileRef} type="file" className="mt-1 w-full text-sm" />
              </div>
            </div>
            {erreurKyc && <p className="text-sm text-destructive">{erreurKyc}</p>}
            <button
              type="button"
              onClick={() => void deposer()}
              disabled={depotEnCours}
              className="rounded-full bg-[#0A192F] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {depotEnCours ? "Dépôt…" : "Déposer la pièce"}
            </button>

            {pieces.length > 0 && (
              <div className="border-t border-line pt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="pb-2">Document</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2">Statut</th>
                      <th className="pb-2">Expiration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pieces.map((p) => (
                      <tr key={p.id} className="border-t border-line">
                        <td className="py-2">{p.nom}</td>
                        <td className="py-2 text-ink-muted">
                          {TYPES_KYC.find((t) => t.value === p.type)?.label ?? p.type}
                        </td>
                        <td className="py-2 capitalize">{p.statut.replace(/_/g, " ")}</td>
                        <td className="py-2 text-ink-muted">
                          {p.date_expiration ? new Date(p.date_expiration).toLocaleDateString("fr-FR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
