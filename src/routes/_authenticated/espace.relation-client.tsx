import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IconHeartHandshake } from "@tabler/icons-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { SectionNav } from "@/components/section-nav";
import { ReponsesIaPanel } from "@/components/reponses-ia-panel";
import { EmailContextQualificationPanel } from "@/components/email-context-qualification-panel";

export const Route = createFileRoute("/_authenticated/espace/relation-client")({
  component: RelationClientPage,
  head: () => ({
    meta: [
      { title: "Relation client — CRM EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Contrats actifs, revues « conseil dans la durée », brouillons à valider et réponses automatiques signalées incorrectes.",
      },
      { property: "og:title", content: "Relation client — CRM EJ Partners Assurances" },
      {
        property: "og:description",
        content: "Suivi des contrats actifs et supervision de l'agent relation client.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Section = "contrats" | "brouillons" | "qualification" | "signalements";

type ContratRow = {
  id: string;
  client_id: string;
  assureur: string;
  produit: string;
  numero: string | null;
  date_echeance: string | null;
  prochain_suivi_le: string | null;
  dernier_suivi_le: string | null;
  clients: { reference: string | null; prenom: string | null; nom: string | null } | null;
};

type SignalementRow = {
  id: string;
  client_id: string;
  objet: string | null;
  categorie: string | null;
  intention: string | null;
  motif_signalement: string | null;
  signalee_le: string | null;
  envoye_le: string | null;
  clients: { reference: string | null; prenom: string | null; nom: string | null } | null;
};

const jour = (v: string | null) => (v ? new Date(v).toLocaleDateString("fr-FR") : "—");
const nomClient = (c: ContratRow["clients"]) =>
  [c?.prenom, c?.nom].filter(Boolean).join(" ") || c?.reference || "Client";

function RelationClientPage() {
  const [section, setSection] = useState<Section>("contrats");
  const [contrats, setContrats] = useState<ContratRow[]>([]);
  const [signalements, setSignalements] = useState<SignalementRow[]>([]);
  const [recherche, setRecherche] = useState("");
  const [filtreIntention, setFiltreIntention] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("contrats")
        .select(
          "id,client_id,assureur,produit,numero,date_echeance,prochain_suivi_le,dernier_suivi_le,clients(reference,prenom,nom)",
        )
        .eq("statut", "actif")
        .order("prochain_suivi_le", { ascending: true, nullsFirst: false });
      setContrats((data ?? []) as unknown as ContratRow[]);
    })();
    (async () => {
      const { data } = await supabase
        .from("client_reponses_ia")
        .select(
          "id,client_id,objet,categorie,intention,motif_signalement,signalee_le,envoye_le,clients(reference,prenom,nom)",
        )
        .eq("signalee_incorrecte", true)
        .order("signalee_le", { ascending: false })
        .limit(200);
      setSignalements((data ?? []) as unknown as SignalementRow[]);
    })();
  }, []);

  const intentions = Array.from(new Set(signalements.map((s) => s.intention).filter(Boolean))) as string[];
  const signalementsFiltres = signalements.filter((s) => {
    if (filtreIntention !== "all" && s.intention !== filtreIntention) return false;
    if (!recherche.trim()) return true;
    const q = recherche.toLowerCase();
    return [s.objet, s.motif_signalement, s.categorie, s.intention, nomClient(s.clients)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <div>
      <PageHeader
        eyebrow="Suivi de la relation"
        title="Relation client"
        description="Contrats actifs et revues de conseil dans la durée, brouillons à valider, erreurs signalées de l'agent."
        icon={IconHeartHandshake}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <SectionNav<Section>
          title="Relation client"
          active={section}
          onSelect={setSection}
          items={[
            { key: "contrats", label: `Contrats (${contrats.length})` },
            { key: "brouillons", label: "Brouillons à valider" },
            { key: "qualification", label: "Qualification des e-mails" },
            { key: "signalements", label: `Réponses signalées (${signalements.length})` },
          ]}
        />

        <div className="min-w-0 space-y-6">
          {section === "contrats" && (
            <section className="crm-card min-w-0 p-5">
              <p className="crm-eyebrow">Contrats actifs</p>
              <p className="text-xs text-ink-muted">
                Prochaine revue « conseil dans la durée » calculée automatiquement selon la branche du contrat.
              </p>
              {contrats.length === 0 ? (
                <p className="mt-4 text-sm text-ink-muted">Aucun contrat actif.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                        <th className="py-2 pr-4">Client</th>
                        <th className="py-2 pr-4">Compagnie</th>
                        <th className="py-2 pr-4">Produit</th>
                        <th className="py-2 pr-4">Échéance</th>
                        <th className="py-2 pr-4">Prochaine revue</th>
                        <th className="py-2 pr-4">Dernier suivi</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {contrats.map((c) => (
                        <tr key={c.id} className="border-t border-line">
                          <td className="py-2 pr-4">
                            <Link
                              to="/espace/clients/$id"
                              params={{ id: c.client_id }}
                              className="text-ink underline-offset-2 hover:underline"
                            >
                              {nomClient(c.clients)}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 text-ink-soft">{c.assureur}</td>
                          <td className="py-2 pr-4 text-ink-soft">{c.produit}</td>
                          <td className="py-2 pr-4 text-ink-soft">{jour(c.date_echeance)}</td>
                          <td className="py-2 pr-4 text-ink-soft">{jour(c.prochain_suivi_le)}</td>
                          <td className="py-2 pr-4 text-ink-muted">{jour(c.dernier_suivi_le)}</td>
                          <td className="py-2">
                            <Link
                              to="/espace/contrats/$id"
                              params={{ id: c.id }}
                              className="text-xs text-ink-muted underline"
                            >
                              Ouvrir le contrat
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {section === "brouillons" && (
            <>
              <ReponsesIaPanel />
              <p className="text-xs text-ink-muted">
                Les brouillons validés partent au client depuis cet écran, sans passer par l'onglet Emails de la fiche.
              </p>
            </>
          )}

          {section === "qualification" && <EmailContextQualificationPanel />}

          {section === "signalements" && (
            <section className="crm-card min-w-0 p-5">
              <p className="crm-eyebrow">Réponses automatiques signalées incorrectes</p>
              <p className="text-xs text-ink-muted">
                Traçabilité des erreurs de l'agent relation client, pour repérer les intentions récurrentes à corriger.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher (client, objet, motif)"
                  className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm"
                />
                <select
                  value={filtreIntention}
                  onChange={(e) => setFiltreIntention(e.target.value)}
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
                >
                  <option value="all">Toutes les intentions</option>
                  {intentions.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>

              {signalementsFiltres.length === 0 ? (
                <p className="mt-4 text-sm text-ink-muted">Aucune réponse signalée.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {signalementsFiltres.map((s) => (
                    <li key={s.id} className="crm-card bg-background p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link
                          to="/espace/clients/$id"
                          params={{ id: s.client_id }}
                          className="text-sm font-medium text-ink underline-offset-2 hover:underline"
                        >
                          {nomClient(s.clients)}
                        </Link>
                        <p className="text-xs text-ink-muted">Signalée le {jour(s.signalee_le)}</p>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {s.categorie ?? "—"} · intention {s.intention ?? "—"} · envoyée le {jour(s.envoye_le)}
                      </p>
                      {s.objet && <p className="mt-2 text-sm text-ink-soft">Objet : {s.objet}</p>}
                      {s.motif_signalement && (
                        <p className="mt-1 text-sm text-ink-soft">Motif : {s.motif_signalement}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
