import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { etapeLabel } from "@/lib/pipeline-dossier";
import { DossierPiecesPanel } from "@/components/dossier-pieces-panel";
import { labelForBranche } from "@/lib/recueil-besoins-schemas";

export const Route = createFileRoute("/_authenticated/espace/mon-espace")({
  component: MonEspace,
  head: () => ({
    meta: [
      { title: "Mon espace client | EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Suivez votre projet d'assurance, déposez vos pièces justificatives et gérez votre compte en toute sécurité.",
      },
      { property: "og:title", content: "Mon espace client | EJ Partners Assurances" },
      {
        property: "og:description",
        content: "Suivi de projet, pièces justificatives et gestion de compte client.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ClientRow = {
  id: string;
  reference: string;
  prenom: string | null;
  nom: string;
  email: string | null;
  mobile: string | null;
};

type DossierRow = {
  id: string;
  reference: string;
  statut: string;
  type_assurance: string;
  created_at: string;
  economie_estimee: number | null;
};

const STATUT_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours d'étude",
  signe: "Signé",
  perdu: "Clôturé",
};

const TABS = [
  { key: "projet", label: "Mon projet" },
  { key: "conformite", label: "Mes pièces" },
  { key: "compte", label: "Mon compte" },
] as const;

function MonEspace() {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("projet");
  const [client, setClient] = useState<ClientRow | null>(null);
  const [dossiers, setDossiers] = useState<DossierRow[]>([]);
  const [derAFaire, setDerAFaire] = useState(false);
  const [lettreAFaire, setLettreAFaire] = useState(false);
  const [devoirAFaire, setDevoirAFaire] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: c } = await supabase
        .from("clients")
        .select("id,reference,prenom,nom,email,mobile")
        .eq("user_id", user.id)
        .maybeSingle();
      setClient((c as ClientRow) ?? null);

      const filtre: string[] = [];
      if (c) filtre.push(`client_id.eq.${(c as ClientRow).id}`);
      if (user.email) filtre.push(`client_email.eq.${user.email}`);
      if (filtre.length > 0) {
        const { data: d } = await supabase
          .from("dossiers")
          .select("id,reference,statut,type_assurance,created_at,economie_estimee")
          .or(filtre.join(","))
          .order("created_at", { ascending: false });
        setDossiers((d ?? []) as DossierRow[]);
      }

      if (c) {
        const [{ data: der }, { data: lm }, { data: dc }] = await Promise.all([
          supabase
            .from("client_der_envois")
            .select("id")
            .eq("client_id", (c as ClientRow).id)
            .is("signed_at", null)
            .limit(1),
          supabase
            .from("lettres_mission")
            .select("id")
            .eq("client_id", (c as ClientRow).id)
            .is("signed_at", null)
            .limit(1),
          supabase
            .from("devoirs_conseil")
            .select("id")
            .eq("client_id", (c as ClientRow).id)
            .eq("statut", "envoye")
            .limit(1),
        ]);
        setDerAFaire((der ?? []).length > 0);
        setLettreAFaire((lm ?? []).length > 0);
        setDevoirAFaire((dc ?? []).length > 0);
      }

      setLoading(false);
    })();
  }, [user]);

  if (loading) return <p className="text-sm text-ink-muted">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">
          Bonjour {client ? `${client.prenom ?? ""} ${client.nom}`.trim() : (user?.email ?? "")}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Votre espace personnel : suivi de projet, pièces justificatives et compte.
        </p>
      </div>

      {(derAFaire || lettreAFaire || devoirAFaire) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Documents à signer</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {derAFaire && (
              <Link to="/espace/signer-der" className="rounded-md border border-amber-400 bg-white px-3 py-1.5">
                Signer le DER
              </Link>
            )}
            {lettreAFaire && (
              <Link
                to="/espace/signer-lettre-mission"
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5"
              >
                Signer la lettre de mission
              </Link>
            )}
            {devoirAFaire && (
              <Link
                to="/espace/signer-devoir-conseil"
                className="rounded-md border border-amber-400 bg-white px-3 py-1.5"
              >
                Valider le devoir de conseil
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "-mb-px border-b-2 px-4 py-2 text-sm transition-colors " +
              (tab === t.key ? "border-ink font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "projet" && (
        <div className="space-y-4">
          {dossiers.length === 0 && (
            <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-muted">
              Aucun projet en cours pour le moment. Notre équipe revient vers vous très rapidement.
            </p>
          )}
          {dossiers.map((d) => (
            <div key={d.id} className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">{labelForBranche(d.type_assurance)}</p>
                  <p className="text-xs text-ink-muted">
                    Référence {d.reference} · ouvert le {new Date(d.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <span className="rounded-full border border-line bg-background px-2.5 py-0.5 text-xs">
                  {STATUT_LABEL[d.statut] ?? etapeLabel(d.statut)}
                </span>
              </div>
              {d.economie_estimee != null && (
                <p className="mt-3 text-sm text-ink-soft">
                  Économie estimée :{" "}
                  <strong>{d.economie_estimee.toLocaleString("fr-FR")} €</strong> sur la durée du prêt (estimation
                  provisoire, une étude complémentaire peut être nécessaire).
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "conformite" && (
        <div className="space-y-8">
          {dossiers.length === 0 && (
            <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-muted">
              Aucune pièce demandée pour l'instant.
            </p>
          )}
          {dossiers.map((d) => (
            <div key={d.id} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Dossier {d.reference} — {labelForBranche(d.type_assurance)}
              </p>
              <DossierPiecesPanel dossierId={d.id} clientId={client?.id ?? null} />
            </div>
          ))}
        </div>
      )}

      {tab === "compte" && (
        <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-serif text-lg">Mes informations</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted">Nom</dt>
              <dd>{client ? `${client.prenom ?? ""} ${client.nom}`.trim() : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Référence client</dt>
              <dd>{client?.reference ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">E-mail</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Téléphone</dt>
              <dd>{client?.mobile ?? "—"}</dd>
            </div>
          </dl>
          <p className="text-xs text-ink-muted">
            Pour modifier vos coordonnées, contactez votre conseiller. La sécurité de votre compte (mot de passe) se
            gère dans les paramètres.
          </p>
          <Link
            to="/espace/parametres"
            className="inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Gérer mon mot de passe
          </Link>
        </div>
      )}
    </div>
  );
}
