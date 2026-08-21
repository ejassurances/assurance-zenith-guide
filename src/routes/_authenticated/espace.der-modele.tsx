import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/page-header";
import { IconFileCertificate } from "@tabler/icons-react";
import { DER_SECTIONS, type DerContenu } from "@/lib/der-modele";
import {
  enregistrerBrouillonDer,
  regenererBrouillonDer,
  validerEtActiverDer,
} from "@/lib/der-modele.functions";

export const Route = createFileRoute("/_authenticated/espace/der-modele")({
  component: DerModelePage,
});

type Modele = {
  id: string;
  version: string;
  nom: string;
  storage_path: string | null;
  actif: boolean;
  statut: string;
  contenu: DerContenu | null;
  obsolete: boolean;
  obsolete_motif: string | null;
  notes: string | null;
  updated_by: string | null;
  valide_le: string | null;
  created_at: string;
  updated_at: string;
};

function DerModelePage() {
  const { role, loading: authLoading } = useAuth();
  const isAdmin = role === "admin";
  const regenerer = useServerFn(regenererBrouillonDer);
  const enregistrer = useServerFn(enregistrerBrouillonDer);
  const valider = useServerFn(validerEtActiverDer);

  const [items, setItems] = useState<Modele[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [edition, setEdition] = useState<DerContenu | null>(null);

  const brouillon = items.find((m) => m.statut === "brouillon") ?? null;
  const actif = items.find((m) => m.actif) ?? null;

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("der_modele")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as unknown as Modele[];
    setItems(rows);
    const b = rows.find((m) => m.statut === "brouillon");
    setEdition(b?.contenu ? { ...b.contenu } : null);
    setLoading(false);
  };
  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Opération impossible");
    } finally {
      setBusy(null);
    }
  };

  const download = async (m: Modele) => {
    if (!m.storage_path) return alert("Aucun PDF pour cette version");
    const { data, error } = await supabase.storage
      .from("conformite-documents")
      .createSignedUrl(m.storage_path, 300);
    if (error || !data) return alert("Impossible d'obtenir le lien");
    window.open(data.signedUrl, "_blank");
  };

  if (authLoading) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (role !== "admin" && role !== "mandataire" && role !== "prescripteur") {
    return <p className="text-sm text-ink-muted">Accès réservé.</p>;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Conformité"
        title="DER — Document d'Entrée en Relation"
        description={
          "Le DER est généré automatiquement (mentions légales + liste des compagnies et produits actifs). Une validation humaine reste obligatoire avant activation." +
          (!isAdmin ? " Lecture seule — seul l'administrateur peut générer et valider une version." : "")
        }
        icon={IconFileCertificate}
      />

      {actif?.obsolete && (
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>DER actif obsolète.</strong> {actif.obsolete_motif ?? "Les partenaires ont changé."}{" "}
          {isAdmin && "Régénérez un brouillon puis validez-le pour mettre le DER à jour."}
        </div>
      )}

      {isAdmin && (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => run("gen", () => regenerer({ data: undefined }))}
            disabled={busy !== null}
            className="rounded-full bg-[#0A192F] px-4 py-2 text-sm font-medium text-white hover:bg-[#0A192F]/90 disabled:opacity-60"
          >
            {busy === "gen" ? "Génération…" : "Régénérer le brouillon"}
          </button>
        </div>
      )}

      {isAdmin && brouillon && edition && (
        <div className="crm-card mt-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-medium">
              Brouillon en attente de validation — v{brouillon.version}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => download(brouillon)}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-ink"
              >
                Aperçu PDF
              </button>
              <button
                onClick={() =>
                  run("save", () => enregistrer({ data: { id: brouillon.id, contenu: edition } }))
                }
                disabled={busy !== null}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-ink disabled:opacity-60"
              >
                {busy === "save" ? "Enregistrement…" : "Enregistrer les modifications"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Valider ce brouillon et remplacer le DER actif ?"))
                    run("valid", () => valider({ data: { id: brouillon.id } }));
                }}
                disabled={busy !== null}
                className="rounded-full bg-[#D4AF37] px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
              >
                {busy === "valid" ? "Activation…" : "Valider et activer"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            {DER_SECTIONS.map((s) => (
              <label key={s.cle} className="grid gap-1">
                <span className="text-xs font-medium text-ink-muted">{s.titre}</span>
                <textarea
                  value={edition.mentions[s.cle] ?? ""}
                  onChange={(e) =>
                    setEdition({
                      ...edition,
                      mentions: { ...edition.mentions, [s.cle]: e.target.value },
                    })
                  }
                  rows={3}
                  className="rounded-md border border-line bg-background px-3 py-2 text-sm"
                />
              </label>
            ))}

            <div>
              <h3 className="text-xs font-medium text-ink-muted">
                Compagnies et produits actifs (zone générée automatiquement)
              </h3>
              {edition.partenaires.length === 0 ? (
                <p className="mt-1 text-sm text-ink-muted">Aucune compagnie active en base.</p>
              ) : (
                <ul className="mt-2 grid gap-2">
                  {edition.partenaires.map((p) => (
                    <li key={p.compagnie} className="rounded-md border border-line bg-background p-3 text-sm">
                      <div className="font-medium text-ink">{p.compagnie}</div>
                      <div className="text-xs text-ink-muted">
                        {p.produits.length ? p.produits.join(" · ") : "Aucun produit actif référencé"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="crm-card mt-6 overflow-x-auto">
        {loading ? (
          <p className="p-4 text-sm text-ink-muted">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-ink-muted">Aucune version de DER pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Mis à jour</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{m.version}</td>
                  <td className="px-4 py-3">
                    <div className="text-ink">{m.nom}</div>
                    {m.notes && <div className="text-xs text-ink-muted">{m.notes}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {m.actif ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                        {m.obsolete ? "Actif — obsolète" : "Actif"}
                      </span>
                    ) : m.statut === "brouillon" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                        Brouillon
                      </span>
                    ) : (
                      <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
                        Archive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {new Date(m.updated_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => download(m)}
                      className="text-xs text-ink underline hover:text-ink-soft"
                    >
                      Télécharger
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
