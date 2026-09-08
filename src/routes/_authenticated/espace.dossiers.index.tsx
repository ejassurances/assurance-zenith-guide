import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { declencherLettreMissionAuto } from "@/lib/lettres-mission.functions";
import {
  analyserOffrePretCreation,
  creerFichesEmprunteurs,
  type EmprunteurPropose,
} from "@/lib/offre-pret-creation.functions";

import { useAuth } from "@/lib/auth-context";
import { estimerEconomie } from "@/lib/insurance-rates";
import { CompagnieProduitPicker } from "@/components/compagnie-produit-picker";
import { ProduitDocumentsLink } from "@/components/produit-documents-link";
import { RecueilWorkflow } from "@/components/recueil-workflow";
import {
  BRANCHES_CREATION,
  getBranche,
  labelForBranche,
  assuresEmprunteur,
  assurePrincipalEmprunteur,
  ageDepuisDateNaissance,
  type BrancheAssurance,
  type FieldConfig,
} from "@/lib/recueil-besoins-schemas";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { SouscriptionFilePanel } from "@/components/souscription-file-panel";
import {
  IconFolders,
  IconClockHour4,
  IconCircleCheck,
  IconAlertTriangle,
  IconListCheck,
} from "@tabler/icons-react";

export const Route = createFileRoute("/_authenticated/espace/dossiers/")({
  component: DossiersList,
});

type Dossier = {
  id: string;
  reference: string;
  client_nom: string;
  statut: string;
  type_assurance: string;
  capital: number | null;
  duree_mois: number | null;
  economie_estimee: number | null;
  created_at: string;
};

function DossiersList() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<Dossier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [vue, setVue] = useState<"liste" | "oav">("liste");
  const canCreate = role === "admin" || role === "mandataire" || role === "prescripteur";

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dossiers")
      .select("id,reference,client_nom,statut,type_assurance,capital,duree_mois,economie_estimee,created_at")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Dossier[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const enCours = items.filter((d) => d.statut === "en_cours").length;
  const signes = items.filter((d) => d.statut === "signe").length;
  const perdus = items.filter((d) => d.statut === "perdu").length;

  return (
    <div>
      <PageHeader
        eyebrow="Activité commerciale"
        title="Dossiers"
        description="Suivi des dossiers de souscription, de leur recueil à la signature."
        icon={IconFolders}
      >
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0A192F] transition hover:brightness-95"
          >
            {showForm ? "Annuler" : "Nouveau dossier"}
          </button>
        )}
      </PageHeader>

      <div className="mt-6 inline-flex rounded-full border border-line bg-surface-elevated p-1">
        <button
          onClick={() => setVue("liste")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            vue === "liste" ? "bg-[#0A192F] text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          Tous les dossiers
        </button>
        <button
          onClick={() => setVue("oav")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            vue === "oav" ? "bg-[#0A192F] text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          File OAV
        </button>
      </div>

      {vue === "oav" ? (
        <div className="mt-6">
          <SouscriptionFilePanel />
        </div>
      ) : (
        <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total dossiers" value={items.length} icon={IconFolders} accent />
        <StatCard label="En cours" value={enCours} icon={IconClockHour4} />
        <StatCard label="Signés" value={signes} icon={IconCircleCheck} />
        <StatCard label="Perdus" value={perdus} icon={IconAlertTriangle} />
      </div>

      {showForm && canCreate && (
        <NewDossierForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
          userId={user!.id}
        />
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface-elevated">
        {loading ? (
          <p className="p-6 text-sm text-ink-muted">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-ink-muted">Aucun dossier pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-background/50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Référence</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Prime d'assurances</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-background/50">
                  <td className="px-4 py-3">
                    <Link to="/espace/dossiers/$id" params={{ id: d.id }} className="font-medium hover:underline">
                      {d.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{d.client_nom}</td>
                  <td className="px-4 py-3 text-xs text-ink-muted">{labelForBranche(d.type_assurance)}</td>
                  <td className="px-4 py-3">
                    <StatutBadge s={d.statut} />
                  </td>
                  <td className="px-4 py-3">{d.capital ? `${Number(d.capital).toLocaleString("fr-FR")} €` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

function StatutBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    nouveau: "bg-surface text-ink-soft",
    en_cours: "bg-amber-100 text-amber-900",
    lettre_mission_envoyee: "bg-sky-100 text-sky-900",
    dda_validee: "bg-sky-100 text-sky-900",
    devis_en_cours: "bg-indigo-100 text-indigo-900",
    devoir_conseil_envoye: "bg-indigo-100 text-indigo-900",
    devoir_conseil_signe: "bg-teal-100 text-teal-900",
    devoir_conseil_refuse: "bg-orange-100 text-orange-900",
    souscription_envoyee: "bg-blue-100 text-blue-900",
    contrat_valide: "bg-emerald-100 text-emerald-900",
    contrat_actif: "bg-emerald-100 text-emerald-900",
    signe: "bg-emerald-100 text-emerald-900",
    perdu: "bg-red-100 text-red-900",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[s] ?? "bg-surface"}`}>
      {s.replace("_", " ")}
    </span>
  );
}

type ClientOption = {
  id: string;
  prenom: string | null;
  nom: string;
  email: string | null;
  mobile: string | null;
  telephone: string | null;
  fumeur: boolean | null;
};

export function NewDossierForm({
  onCreated,
  userId,
  presetClient,
}: {
  onCreated: () => void;
  userId: string;
  presetClient?: ClientOption;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<BrancheAssurance>("emprunteur");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState<string>(presetClient?.id ?? "");
  const [clientQuery, setClientQuery] = useState("");
  const [clientNom, setClientNom] = useState(
    presetClient ? [presetClient.prenom, presetClient.nom].filter(Boolean).join(" ") : "",
  );
  const [clientEmail, setClientEmail] = useState(presetClient?.email ?? "");
  const [clientPhone, setClientPhone] = useState(presetClient?.mobile ?? presetClient?.telephone ?? "");
  const [recueil, setRecueil] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState("");
  const [compagnieId, setCompagnieId] = useState<string | null>(null);
  const [produitId, setProduitId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Offre de prêt déposée dès la création : analysée par l'IA puis archivée
  // sur le dossier une fois celui-ci créé.
  const [offreFiles, setOffreFiles] = useState<File[]>([]);
  /** Destinataire de chaque document déposé : index de l'emprunteur, -1 = prêt commun. */
  const [offreCibles, setOffreCibles] = useState<number[]>([]);
  const [analyseEtat, setAnalyseEtat] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [emprunteurs, setEmprunteurs] = useState<EmprunteurPropose[]>([]);

  const lancerLettreMission = useServerFn(declencherLettreMissionAuto);
  const analyserOffre = useServerFn(analyserOffrePretCreation);
  const creerFiches = useServerFn(creerFichesEmprunteurs);


  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id,prenom,nom,email,mobile,telephone,fumeur")
        .order("created_at", { ascending: false })
        .limit(500);
      setClients((data ?? []) as ClientOption[]);
    })();
  }, []);

  const filteredClients = useMemo(() => {
    const t = clientQuery.trim().toLowerCase();
    if (!t) return clients.slice(0, 50);
    return clients.filter((c) => `${c.prenom ?? ""} ${c.nom} ${c.email ?? ""}`.toLowerCase().includes(t)).slice(0, 50);
  }, [clients, clientQuery]);

  const selectClient = (c: ClientOption) => {
    setClientId(c.id);
    setClientNom([c.prenom, c.nom].filter(Boolean).join(" ") || c.nom);
    setClientEmail(c.email ?? "");
    setClientPhone(c.mobile ?? c.telephone ?? "");
    if (type === "emprunteur") {
      // Préremplissage du statut fumeur sur l'assuré principal de la liste.
      setRecueil((r) => {
        const list = assuresEmprunteur(r["assures"]);
        const rows = list.length > 0 ? list : [{ lien: "principal", date_naissance: "", quotite_pct: null, csp: "", fumeur: false }];
        return { ...r, assures: rows.map((p, i) => (i === 0 ? { ...p, fumeur: !!c.fumeur } : p)) };
      });
    }
  };

  const branche = getBranche(type)!;

  /** Lit un fichier en base64 (sans le préfixe data:). */
  const enBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result ?? "");
        resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
      };
      reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
      reader.readAsDataURL(file);
    });

  /**
   * Analyse IA de l'offre de prêt / du tableau d'amortissement déposé avant
   * création : les données du prêt et les emprunteurs sont reportés dans le
   * formulaire, sans jamais écraser une valeur déjà saisie.
   */
  const analyserOffreDeposee = async (files: File[]) => {
    setOffreFiles((prev) => [...prev, ...files]);
    setOffreCibles((prev) => [...prev, ...files.map(() => -1)]);
    if (files.length === 0) return;

    setAnalysing(true);
    setAnalyseEtat("Lecture du document par l'IA…");
    try {
      const fichiers = await Promise.all(
        files.map(async (f) => ({
          nom: f.name.slice(0, 200),
          mime: f.type || "application/pdf",
          contenu_base64: await enBase64(f),
        })),
      );
      const res = await analyserOffre({ data: { fichiers } });
      const extrait = JSON.parse(res.recueil_json) as Record<string, unknown>;
      setRecueil((r) => {
        const fusion: Record<string, unknown> = { ...r };
        for (const [k, v] of Object.entries(extrait)) {
          const actuel = fusion[k];
          const vide = actuel === undefined || actuel === null || actuel === "" || (Array.isArray(actuel) && actuel.length === 0);
          if (vide) fusion[k] = v;
        }
        return fusion;
      });
      // Les documents importés font foi : ils complètent et corrigent la saisie
      // manuelle, sans supprimer un emprunteur ajouté à la main.
      setEmprunteurs((prev) => {
        const cle = (x: { nom: string; prenom: string }) => `${x.nom} ${x.prenom}`.trim().toLowerCase();
        const out = prev.filter((e) => e.nom.trim() !== "");
        for (const e of res.emprunteurs) {
          const i = out.findIndex((x) => cle(x) === cle(e));
          const existant = out[i];
          if (existant) out[i] = { ...existant, ...e, client_id: e.client_id ?? existant.client_id };
          else out.push(e);
        }
        return out;
      });

      const principal = res.emprunteurs[0];
      if (principal) {
        if (!clientId) {
          if (principal.client_id) setClientId(principal.client_id);
          setClientNom([principal.prenom, principal.nom].filter(Boolean).join(" ").trim());
          if (principal.email) setClientEmail(principal.email);
          if (principal.telephone) setClientPhone(principal.telephone);
        }
      }
      const nouveaux = res.emprunteurs.filter((e) => !e.client_id).length;
      setAnalyseEtat(
        [
          res.ajouts.length > 0 ? `Données du prêt reportées : ${res.ajouts.join(", ")}.` : "Aucune donnée de prêt exploitable détectée.",
          res.emprunteurs.length > 0
            ? `${res.emprunteurs.length} emprunteur(s) détecté(s)${nouveaux > 0 ? `, dont ${nouveaux} sans fiche client (créée à l'enregistrement)` : ", tous rapprochés d'une fiche existante"}.`
            : "Aucun emprunteur nommé détecté : saisie manuelle.",
          res.manquants.length > 0 ? `À compléter : ${res.manquants.join(", ")}.` : "",
          res.erreurs.length > 0 ? `Documents non exploités : ${res.erreurs.join(" ; ")}` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (e) {
      setAnalyseEtat(`Analyse IA indisponible : ${e instanceof Error ? e.message : "erreur"} — saisie manuelle.`);
    }
    setAnalysing(false);
  };

  /**
   * Archive les documents déposés sur le dossier créé et coche la pièce requise.
   * `idsAssures` donne la fiche client de chaque emprunteur : un document affecté
   * à Monsieur ou Madame est rattaché à sa fiche, sinon au prêt commun.
   */
  const archiverOffres = async (
    dossierId: string,
    clientDossierId: string | null,
    idsAssures: (string | null)[] = [],
  ) => {
    for (const [index, file] of offreFiles.entries()) {
      const cible = offreCibles[index] ?? -1;
      const clientDoc = (cible >= 0 ? idsAssures[cible] : null) ?? clientDossierId;
      try {
        const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
        const path = `${clientDoc ?? dossierId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("dossier-documents")
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: doc } = await supabase
          .from("documents")
          .insert({
            dossier_id: dossierId,
            client_id: clientDoc,

            uploader_id: userId,
            storage_path: path,
            file_name: file.name.slice(0, 200),
            file_size: file.size,
            mime_type: file.type || null,
            categorie: "dossier",
            type_document: "offre_pret",
          })
          .select("id")
          .maybeSingle();
        if (doc?.id) {
          await supabase
            .from("dossier_pieces_requises")
            .update({ statut: "recue", recue_le: new Date().toISOString(), document_id: doc.id })
            .eq("dossier_id", dossierId)
            .in("code", ["offre_pret", "tableau_amortissement"]);
        }
      } catch (e) {
        console.error("[offre de prêt] archivage impossible", e);
      }
    }
  };


  const submit = async () => {
    if (!clientNom.trim()) {
      setError("Sélectionnez un client ou saisissez un nom.");
      return;
    }
    setSaving(true);
    setError(null);

    // Emprunteurs détectés dans l'offre de prêt : rapprochement ou création des
    // fiches clients avant l'ouverture du dossier (un dossier = un prêt).
    let clientPrincipalId = clientId;
    let recueilFinal: Record<string, unknown> = recueil;
    if (type === "emprunteur" && emprunteurs.length > 0) {
      try {
        const res = await creerFiches({
          data: {
            emprunteurs: emprunteurs.map((e) => ({
              prenom: e.prenom,
              nom: e.nom,
              date_naissance: e.date_naissance,
              quotite_pct: e.quotite_pct,
              csp: e.csp,
              fumeur: e.fumeur,
              email: e.email,
              telephone: e.telephone,
              client_id: e.client_id,
            })),
          },
        });
        const ids = res.resultats;
        if (!clientPrincipalId && ids[0]) clientPrincipalId = ids[0].client_id;
        const assures = assuresEmprunteur(recueil["assures"]);
        if (assures.length > 0) {
          recueilFinal = {
            ...recueil,
            assures: assures.map((a, i) => (ids[i] ? { ...a, client_id: ids[i]!.client_id } : a)),
          };
        }
      } catch (e) {
        setSaving(false);
        setError(e instanceof Error ? e.message : "Création des fiches clients impossible");
        return;
      }
    }
    const recueilSoumis = recueilFinal;



    // Champs de compat pour emprunteur (pour garder les colonnes existantes utiles)
    let capital: number | null = null;
    let duree_mois: number | null = null;
    let age: number | null = null;
    let fumeur = false;
    let economie: number | null = null;
    if (type === "emprunteur") {
      capital = Number(recueilSoumis["capital"]) || null;
      duree_mois = Number(recueilSoumis["duree_mois"]) || null;
      // Assuré principal de la liste « assures » : base de l'estimation d'économie.
      const principal = assurePrincipalEmprunteur(recueilSoumis["assures"]);
      age = principal ? ageDepuisDateNaissance(principal.date_naissance) : null;
      fumeur = principal?.fumeur === true;
      if (capital && duree_mois && age) {
        try {
          const est = estimerEconomie({ capital, dureeMois: duree_mois, age, fumeur });
          economie = Math.round(est.economieTotale);
        } catch {
          // pas de tranche
        }
      }
    }

    const { data: created, error: insErr } = await supabase.from("dossiers").insert({
      client_id: clientPrincipalId || null,
      client_nom: clientNom,
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      type_assurance: type,
      compagnie_id: compagnieId,
      produit_id: produitId,
      recueil_besoins: recueilSoumis as never,

      capital,
      duree_mois,
      age,
      fumeur,
      notes: notes || null,
      economie_estimee: economie,
      apporteur_id: userId,
      created_by: userId,
    }).select("id").single();
    if (insErr || !created) {
      setSaving(false);
      setError(insErr?.message ?? "Erreur de création");
      return;
    }

    // Offre de prêt déposée à la création : archivée sur le dossier.
    if (offreFiles.length > 0) await archiverOffres(created.id, clientPrincipalId || null);

    // Recueil validé → lettre de mission générée et envoyée automatiquement
    const res = await lancerLettreMission({ data: { dossier_id: created.id } });

    setSaving(false);
    if (!res.ok && res.raison) setError(res.raison);
    onCreated();
  };

  if (step === 1) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-surface-elevated p-6">
        <h2 className="font-serif text-lg">Étape 1 · Type d'assurance</h2>
        <p className="mt-1 text-sm text-ink-muted">Choisissez la branche concernée pour ce dossier.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BRANCHES_CREATION.map((b) => (
            <button
              key={b.value}
              type="button"
              onClick={() => setType(b.value)}
              className={`rounded-2xl border p-4 text-left transition ${
                type === b.value ? "border-ink bg-background" : "border-line bg-background/40 hover:border-ink/40"
              }`}
            >
              <p className="font-medium text-ink">{b.label}</p>
              <p className="mt-1 text-xs text-ink-muted">{b.description}</p>
            </button>
          ))}
        </div>

        {type === "emprunteur" ? (
          <div className="mt-6 rounded-2xl border border-line bg-background/40 p-4">
            <p className="text-sm font-medium text-ink">Offre de prêt ou tableau d'amortissement (facultatif)</p>
            <p className="mt-1 text-xs text-ink-muted">
              Déposez le document : les caractéristiques du prêt et les emprunteurs sont relevés automatiquement, les
              fiches clients manquantes sont créées à l'enregistrement. Aucune information déjà saisie n'est remplacée.
            </p>
            <input
              type="file"
              multiple
              accept="application/pdf,image/*"
              disabled={analysing}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) void analyserOffreDeposee(files);
              }}
              className="mt-3 block w-full text-sm"
            />
            {offreFiles.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                {offreFiles.map((f) => (
                  <li key={f.name}>{f.name}</li>
                ))}
              </ul>
            ) : null}
            {analyseEtat ? <p className="mt-3 text-xs text-ink">{analyseEtat}</p> : null}
            {emprunteurs.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-ink">
                {emprunteurs.map((e, i) => (
                  <li key={`${e.nom}-${i}`}>
                    {[e.prenom, e.nom].filter(Boolean).join(" ")}
                    {e.date_naissance ? ` · né(e) le ${e.date_naissance}` : ""}
                    {e.quotite_pct !== null ? ` · quotité ${e.quotite_pct} %` : ""}
                    {" — "}
                    {e.client_id ? `fiche existante${e.client_reference ? ` ${e.client_reference}` : ""}` : "fiche à créer"}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">

          <button
            onClick={() => setStep(2)}
            className="rounded-full bg-[#0A192F] px-5 py-2 text-sm font-medium text-white"
          >
            Continuer → Recueil des besoins
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <RecueilWorkflow
        branche={branche}
        values={recueil}
        onChange={setRecueil}
        onBack={() => setStep(1)}
        onComplete={() => submit()}
        completeLabel={saving ? "Enregistrement…" : "Créer le dossier"}
      >
        <div className="space-y-6">
          {!presetClient ? (
            <div className="rounded-xl border border-line bg-background/40 p-4">
              <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Client</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  placeholder="Rechercher (nom, prénom, email)…"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  className="flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm"
                />
                <select
                  value={clientId}
                  onChange={(e) => {
                    const c = clients.find((x) => x.id === e.target.value);
                    if (c) selectClient(c);
                    else setClientId("");
                  }}
                  className="rounded-md border border-line bg-background px-3 py-2 text-sm sm:w-72"
                >
                  <option value="">— Sélectionner un client —</option>
                  {filteredClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.prenom, c.nom].filter(Boolean).join(" ")}
                      {c.email ? ` · ${c.email}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <TextInput label="Nom du client" value={clientNom} onChange={setClientNom} />
                <TextInput label="Email" value={clientEmail} onChange={setClientEmail} type="email" />
                <TextInput label="Téléphone" value={clientPhone} onChange={setClientPhone} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              Client : {[presetClient.prenom, presetClient.nom].filter(Boolean).join(" ")}
            </p>
          )}

          <div className="rounded-xl border border-line bg-background/40 p-4">
            <h3 className="text-sm font-medium uppercase tracking-wide text-ink-muted">
              Compagnie et produit (optionnel)
            </h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <CompagnieProduitPicker
                branche={type}
                compagnieId={compagnieId}
                produitId={produitId}
                onChange={(sel) => {
                  setCompagnieId(sel.compagnie_id);
                  setProduitId(sel.produit_id);
                }}
              />
            </div>
            <div className="mt-3">
              <ProduitDocumentsLink produitId={produitId} compagnieId={compagnieId} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Notes internes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </RecueilWorkflow>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink"
      />
    </label>
  );
}

export function RecueilField({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const cls = "mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-ink";
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="block sm:col-span-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{field.label}</span>
        <textarea
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cls}
        />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{field.label}</span>
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {field.label}
        {field.suffix ? ` (${field.suffix})` : ""}
      </span>
      <input
        type={field.type === "number" ? "number" : "text"}
        value={(value as string | number | undefined) ?? ""}
        onChange={(e) =>
          onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
        }
        placeholder={field.placeholder}
        className={cls}
      />
    </label>
  );
}
