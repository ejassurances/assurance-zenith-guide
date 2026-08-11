import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { rechercherSanctionsPPE, marquerVerificationLCB } from "@/lib/lcb-ft.functions";
import { DerStatusCard } from "@/components/der-status-card";

/* Onglet Conformité client : KYC + LCB-FT + Score */

type KycDoc = {
  id: string;
  client_id: string;
  type: "cni" | "justificatif_domicile" | "rib";
  nom: string;
  storage_path: string;
  drive_url: string | null;
  date_emission: string | null;
  date_expiration: string | null;
  statut: string;
  notes: string | null;
  created_at: string;
};

type LCBVerif = {
  id: string;
  client_id: string;
  type: string;
  fournisseur: string;
  nb_correspondances: number;
  score_correspondance: number | null;
  statut: string;
  verifie_le: string;
  valide_jusqua: string | null;
  notes: string | null;
  resultats: unknown;
};

type ClientMini = {
  id: string;
  nom: string;
  prenom: string | null;
  date_naissance: string | null;
  conformite_score: number | null;
  conformite_niveau: string | null;
  conformite_derniere_verif: string | null;
  conformite_prochaine_verif: string | null;
};

const TYPES: { key: KycDoc["type"]; label: string }[] = [
  { key: "cni", label: "Carte d'identité / Passeport" },
  { key: "justificatif_domicile", label: "Justificatif de domicile (< 3 mois)" },
  { key: "rib", label: "RIB" },
];

const NIVEAU_COLOR: Record<string, string> = {
  vert: "bg-emerald-100 text-emerald-900 border-emerald-300",
  orange: "bg-amber-100 text-amber-900 border-amber-300",
  rouge: "bg-red-100 text-red-900 border-red-300",
};

export function ConformiteClientTab({
  clientId,
  clientEmail,
  canEdit,
}: {
  clientId: string;
  clientEmail: string | null;
  canEdit: boolean;
}) {
  const [client, setClient] = useState<ClientMini | null>(null);
  const [docs, setDocs] = useState<KycDoc[]>([]);
  const [verifs, setVerifs] = useState<LCBVerif[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<Awaited<ReturnType<typeof rechercherSanctionsPPE>> | null>(null);

  const rechercher = useServerFn(rechercherSanctionsPPE);
  const marquer = useServerFn(marquerVerificationLCB);

  const load = async () => {
    const [c, d, v] = await Promise.all([
      supabase
        .from("clients")
        .select(
          "id,nom,prenom,date_naissance,conformite_score,conformite_niveau,conformite_derniere_verif,conformite_prochaine_verif",
        )
        .eq("id", clientId)
        .maybeSingle(),
      supabase
        .from("client_kyc_documents")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_lcb_verifications")
        .select("*")
        .eq("client_id", clientId)
        .order("verifie_le", { ascending: false })
        .limit(10),
    ]);
    setClient((c.data as ClientMini | null) ?? null);
    setDocs((d.data ?? []) as KycDoc[]);
    setVerifs((v.data ?? []) as LCBVerif[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [clientId]);

  const upload = async (type: KycDoc["type"], file: File) => {
    const path = `${clientId}/kyc/${type}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("dossier-documents").upload(path, file);
    if (upErr) {
      alert("Upload : " + upErr.message);
      return;
    }
    const { error: insErr } = await supabase.from("client_kyc_documents").insert({
      client_id: clientId,
      type,
      nom: file.name,
      storage_path: path,
      statut: "a_valider",
      date_emission: type === "justificatif_domicile" ? new Date().toISOString().slice(0, 10) : null,
    });
    if (insErr) alert(insErr.message);
    await load();
  };

  const valider = async (id: string, statut: string) => {
    await supabase.from("client_kyc_documents").update({ statut }).eq("id", id);
    await load();
  };

  const supprimer = async (doc: KycDoc) => {
    if (!confirm("Supprimer ce document ?")) return;
    await supabase.storage.from("dossier-documents").remove([doc.storage_path]);
    await supabase.from("client_kyc_documents").delete().eq("id", doc.id);
    await load();
  };

  const telecharger = async (path: string) => {
    const { data } = await supabase.storage.from("dossier-documents").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const enregistrerDrive = async (doc: KycDoc) => {
    const url = prompt("Lien Google Drive du document", doc.drive_url ?? "https://drive.google.com/");
    if (url === null) return;
    await supabase
      .from("client_kyc_documents")
      .update({ drive_url: url.trim() || null })
      .eq("id", doc.id);
    await load();
  };


  const lancerRecherche = async () => {
    if (!client) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await rechercher({
        data: {
          client_id: clientId,
          nom: client.nom,
          prenom: client.prenom ?? undefined,
          date_naissance: client.date_naissance ?? undefined,
        },
      });
      setSearchResult(res);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSearching(false);
    }
  };

  const statuer = async (id: string, statut: "clair" | "faux_positif" | "confirme") => {
    const notes =
      statut === "confirme" || statut === "faux_positif" ? (prompt("Note (optionnel)") ?? undefined) : undefined;
    await marquer({ data: { verification_id: id, statut, notes } });
    setSearchResult(null);
    await load();
  };

  if (loading) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (!client) return <p className="text-sm text-ink-muted">Client introuvable.</p>;

  const score = client.conformite_score ?? 0;
  const niveau = client.conformite_niveau ?? "rouge";

  return (
    <div className="space-y-6">
      {/* Score */}
      <div className={`rounded-2xl border p-5 ${NIVEAU_COLOR[niveau] ?? NIVEAU_COLOR.rouge}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">Score de conformité</p>
            <p className="mt-1 font-serif text-4xl font-medium">{score}/100</p>
          </div>
          <div className="text-right text-xs">
            <p>
              Dernière vérif :{" "}
              {client.conformite_derniere_verif
                ? new Date(client.conformite_derniere_verif).toLocaleDateString("fr-FR")
                : "—"}
            </p>
            <p>
              Prochaine vérif :{" "}
              {client.conformite_prochaine_verif
                ? new Date(client.conformite_prochaine_verif).toLocaleDateString("fr-FR")
                : "—"}
            </p>
            <p className="mt-1 uppercase font-semibold">Niveau {niveau}</p>
          </div>
        </div>
        <p className="mt-3 text-xs opacity-80">
          Barème : CNI valide (30 pts) · Justificatif de domicile &lt; 3 mois (20 pts) · RIB (15 pts) · Vérification
          LCB-FT (35 pts). Revérification 18 mois si vert · 12 mois si orange · 6 mois si rouge.
        </p>
      </div>

      <DerStatusCard clientId={clientId} clientEmail={clientEmail} canEdit={canEdit} />

      {/* Documents KYC */}
      <div className="rounded-2xl border border-line bg-surface-elevated p-6">
        <h3 className="font-serif text-lg font-medium">Documents d'identification</h3>
        <div className="mt-4 space-y-4">
          {TYPES.map(({ key, label }) => {
            const documents = docs.filter((d) => d.type === key);
            return (
              <div key={key} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{label}</p>
                    <p className="text-xs text-ink-muted">
                      {documents.length === 0 ? "Aucun document" : `${documents.length} fichier(s)`}
                    </p>
                  </div>
                  {canEdit && (
                    <label className="cursor-pointer rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-primary-foreground">
                      + Ajouter
                      <input
                        type="file"
                        className="hidden"
                        accept="application/pdf,image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) upload(key, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                {documents.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{doc.nom}</p>
                          <p className="text-xs text-ink-muted">
                            Ajouté le {new Date(doc.created_at).toLocaleDateString("fr-FR")}
                            {doc.date_emission
                              ? ` · Émis le ${new Date(doc.date_emission).toLocaleDateString("fr-FR")}`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-xs font-medium " +
                            (doc.statut === "valide"
                              ? "bg-emerald-100 text-emerald-900"
                              : doc.statut === "refuse"
                                ? "bg-red-100 text-red-900"
                                : "bg-amber-100 text-amber-900")
                          }
                        >
                          {doc.statut}
                        </span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => telecharger(doc.storage_path)} className="text-xs underline">
                            Voir
                          </button>
                          {doc.drive_url && (
                            <a
                              href={doc.drive_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-[color:var(--crm-gold)] underline"
                            >
                              Drive
                            </a>
                          )}
                          {canEdit && (
                            <button onClick={() => enregistrerDrive(doc)} className="text-xs text-ink-muted underline">
                              {doc.drive_url ? "Modifier le lien" : "Lier à Drive"}
                            </button>
                          )}
                          {canEdit && doc.statut !== "valide" && (
                            <button
                              onClick={() => valider(doc.id, "valide")}
                              className="text-xs text-emerald-800 underline"
                            >
                              Valider
                            </button>
                          )}
                          {canEdit && doc.statut !== "refuse" && (
                            <button
                              onClick={() => valider(doc.id, "refuse")}
                              className="text-xs text-red-800 underline"
                            >
                              Refuser
                            </button>
                          )}
                          {canEdit && (
                            <button onClick={() => supprimer(doc)} className="text-xs text-ink-muted underline">
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* LCB-FT */}
      <div className="rounded-2xl border border-line bg-surface-elevated p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-medium">Vérification sanctions & PPE</h3>
            <p className="text-xs text-ink-muted">
              Filtrage LCB-FT via OpenSanctions (bases officielles : UE, ONU, OFAC, gel des avoirs FR, listes PPE).
            </p>
          </div>
          {canEdit && (
            <button
              onClick={lancerRecherche}
              disabled={searching}
              className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              {searching ? "Recherche…" : "Lancer une vérification"}
            </button>
          )}
        </div>

        {/* Résultat immédiat */}
        {searchResult && (
          <div className="mt-4 rounded-xl border border-line bg-surface p-4">
            {!searchResult.api_ok && (
              <p className="text-sm text-red-800">Service indisponible : {searchResult.api_error}</p>
            )}
            {searchResult.matches.length === 0 && searchResult.api_ok && (
              <p className="text-sm text-emerald-800">
                ✓ Aucune correspondance significative trouvée. Vérification enregistrée.
              </p>
            )}
            {searchResult.matches.length > 0 && (
              <>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  {searchResult.has_sanction && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-900">
                      Sanction potentielle
                    </span>
                  )}
                  {searchResult.has_ppe && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                      PPE potentiel
                    </span>
                  )}
                  <span className="rounded-full border border-line px-2 py-0.5">
                    Score : {(searchResult.best_score * 100).toFixed(0)}%
                  </span>
                </div>
                <ul className="space-y-2">
                  {searchResult.matches.map((m) => (
                    <li key={m.id} className="rounded-md border border-line bg-white p-3 text-sm">
                      <p className="font-medium">{m.caption}</p>
                      <p className="text-xs text-ink-muted">
                        Score {(m.score * 100).toFixed(0)}% · {m.datasets.slice(0, 3).join(", ")}
                        {m.pays.length > 0 ? ` · ${m.pays.join(", ")}` : ""}
                        {m.date_naissance.length > 0 ? ` · Né(e) ${m.date_naissance[0]}` : ""}
                      </p>
                      {m.fonction.length > 0 && (
                        <p className="mt-1 text-xs text-ink-soft">Fonction : {m.fonction.slice(0, 2).join(" — ")}</p>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => statuer(searchResult.verification_id, "faux_positif")}
                    className="rounded-full border border-line px-3 py-1 text-xs"
                  >
                    Marquer faux positif
                  </button>
                  <button
                    onClick={() => statuer(searchResult.verification_id, "confirme")}
                    className="rounded-full bg-red-900 px-3 py-1 text-xs text-white"
                  >
                    Confirmer la correspondance
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Historique */}
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Historique</p>
          {verifs.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Aucune vérification enregistrée.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs text-ink-muted">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Correspondances</th>
                    <th className="px-2 py-2">Score</th>
                    <th className="px-2 py-2">Statut</th>
                    <th className="px-2 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {verifs.map((v) => (
                    <tr key={v.id} className="border-b border-line last:border-0">
                      <td className="px-2 py-2 text-xs">{new Date(v.verifie_le).toLocaleString("fr-FR")}</td>
                      <td className="px-2 py-2">{v.nb_correspondances}</td>
                      <td className="px-2 py-2">
                        {v.score_correspondance ? `${(Number(v.score_correspondance) * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-xs font-medium " +
                            (v.statut === "clair" || v.statut === "faux_positif"
                              ? "bg-emerald-100 text-emerald-900"
                              : v.statut === "a_verifier"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-red-100 text-red-900")
                          }
                        >
                          {v.statut}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-ink-muted">{v.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
