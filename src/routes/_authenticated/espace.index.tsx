import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/espace/")({
  component: Dashboard,
});

type Activite = {
  id: string;
  type: string;
  titre: string | null;
  contenu: string | null;
  created_at: string;
  client_id: string;
  clients: { reference: string; prenom: string | null; nom: string } | null;
};

type Tache = {
  id: string;
  titre: string;
  echeance: string | null;
  priorite: string;
  client_id: string | null;
  clients: { prenom: string | null; nom: string } | null;
};

function Dashboard() {
  const { role, user } = useAuth();
  const [stats, setStats] = useState({ clients: 0, prospects: 0, dossiers: 0, enCours: 0, signes: 0, commissions: 0 });
  const [activites, setActivites] = useState<Activite[]>([]);
  const [taches, setTaches] = useState<Tache[]>([]);

  useEffect(() => {
    (async () => {
      const [c, p, tot, ec, si, com, act, tch] = await Promise.all([
        supabase.from("clients").select("*", { count: "exact", head: true }),
        supabase.from("clients").select("*", { count: "exact", head: true }).eq("statut", "prospect"),
        supabase.from("dossiers").select("*", { count: "exact", head: true }),
        supabase.from("dossiers").select("*", { count: "exact", head: true }).eq("statut", "en_cours"),
        supabase.from("dossiers").select("*", { count: "exact", head: true }).eq("statut", "signe"),
        supabase.from("commissions").select("montant"),
        supabase
          .from("activites")
          .select("id,type,titre,contenu,created_at,client_id,clients(reference,prenom,nom)")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("taches")
          .select("id,titre,echeance,priorite,client_id,clients(prenom,nom)")
          .neq("statut", "terminee")
          .order("echeance", { ascending: true, nullsFirst: false })
          .limit(6),
      ]);
      const commissions = (com.data ?? []).reduce((s, r) => s + Number(r.montant), 0);
      setStats({
        clients: c.count ?? 0,
        prospects: p.count ?? 0,
        dossiers: tot.count ?? 0,
        enCours: ec.count ?? 0,
        signes: si.count ?? 0,
        commissions,
      });
      setActivites((act.data ?? []) as unknown as Activite[]);
      setTaches((tch.data ?? []) as unknown as Tache[]);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Tableau de bord</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Connecté en tant que <span className="font-medium text-ink">{user?.email}</span> — rôle {role ?? "…"}
      </p>

      {role === "client" && <ClientDerBanner />}
      {(role === "admin" || role === "mandataire") && <ConformiteCabinetWidget />}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {role !== "client" && (
          <Card label="Prospects" value={stats.prospects} sub={`${stats.clients} fiches au total`} accent />
        )}
        <Card label="Devis en cours" value={stats.enCours} sub={`${stats.dossiers} dossiers ouverts`} />
        <Card label="Affaires conclues" value={stats.signes} />
        {role !== "client" && (
          <Card label="Commissions estimées" value={`${stats.commissions.toLocaleString("fr-FR")} €`} accent />
        )}
      </div>


      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface-elevated p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-medium">Activité récente</h2>
            <Link to="/espace/clients" className="text-xs text-ink-muted hover:underline">
              Voir clients →
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {activites.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucune activité récente.</p>
            ) : (
              activites.map((a) => (
                <div key={a.id} className="border-b border-line pb-3 last:border-0">
                  <div className="flex items-center justify-between text-xs text-ink-muted">
                    <span className="rounded-full border border-line px-2 py-0.5 uppercase tracking-wide">{a.type}</span>
                    <span>{new Date(a.created_at).toLocaleString("fr-FR")}</span>
                  </div>
                  {a.clients && (
                    <Link
                      to="/espace/clients/$id"
                      params={{ id: a.client_id }}
                      className="mt-1 block text-sm font-medium text-ink hover:underline"
                    >
                      {[a.clients.prenom, a.clients.nom].filter(Boolean).join(" ")}
                    </Link>
                  )}
                  {a.titre && <p className="text-sm text-ink">{a.titre}</p>}
                  {a.contenu && <p className="text-sm text-ink-soft line-clamp-2">{a.contenu}</p>}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface-elevated p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-medium">Tâches à faire</h2>
            <Link to="/espace/taches" className="text-xs text-ink-muted hover:underline">
              Toutes →
            </Link>
          </div>
          <div className="mt-4 space-y-2">
            {taches.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucune tâche en attente.</p>
            ) : (
              taches.map((t) => (
                <div key={t.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{t.titre}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-full border border-line px-2 py-0.5">{t.priorite}</span>
                      {t.echeance && (
                        <span className="text-ink-muted">
                          {new Date(t.echeance).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                  </div>
                  {t.clients && t.client_id && (
                    <Link
                      to="/espace/clients/$id"
                      params={{ id: t.client_id }}
                      className="mt-1 inline-block text-xs text-ink-muted hover:underline"
                    >
                      {[t.clients.prenom, t.clients.nom].filter(Boolean).join(" ")}
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-elevated p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className={
          "mt-2 text-3xl font-bold tracking-tight " + (accent ? "text-[color:var(--crm-gold)]" : "text-ink")
        }
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}


function ClientDerBanner() {
  const [derPending, setDerPending] = useState(false);
  const [lmPending, setLmPending] = useState(false);
  useEffect(() => {
    (async () => {
      const [{ count: der }, { count: lm }] = await Promise.all([
        supabase.from("client_der_envois").select("id", { count: "exact", head: true }).neq("statut", "signe"),
        supabase.from("lettres_mission").select("id", { count: "exact", head: true }).eq("statut", "envoyee"),
      ]);
      setDerPending((der ?? 0) > 0);
      setLmPending((lm ?? 0) > 0);
    })();
  }, []);
  if (!derPending && !lmPending) return null;
  return (
    <div className="mt-6 space-y-3">
      {derPending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div>
            <p className="font-medium text-amber-900">Document d'Entrée en Relation à signer</p>
            <p className="text-sm text-amber-800">
              Merci de signer votre DER pour finaliser votre entrée en relation avec le cabinet.
            </p>
          </div>
          <Link to="/espace/signer-der" className="rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white">
            Signer maintenant
          </Link>
        </div>
      )}
      {lmPending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div>
            <p className="font-medium text-amber-900">Lettre de mission à signer</p>
            <p className="text-sm text-amber-800">
              Votre lettre de mission est prête. Signez-la pour que nous puissions engager la recherche des solutions.
            </p>
          </div>
          <Link to="/espace/signer-lettre-mission" className="rounded-full bg-amber-900 px-4 py-2 text-sm font-medium text-white">
            Signer maintenant
          </Link>
        </div>
      )}
    </div>
  );
}

type CabinetScore = {
  score: number;
  niveau: string;
  nb_clients: number;
  nb_vert: number;
  nb_orange: number;
  nb_rouge: number;
  nb_a_relancer: number;
};

function ConformiteCabinetWidget() {
  const [data, setData] = useState<CabinetScore | null>(null);
  useEffect(() => {
    (async () => {
      const { data: res } = await supabase.rpc("score_conformite_cabinet");
      const row = Array.isArray(res) ? (res[0] as CabinetScore | undefined) : (res as CabinetScore | null);
      if (row) setData(row);
    })();
  }, []);
  if (!data) return null;
  const color =
    data.niveau === "vert"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : data.niveau === "orange"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-red-300 bg-red-50 text-red-900";
  return (
    <div className={`mt-6 rounded-2xl border p-5 ${color}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide opacity-70">Conformité du cabinet</p>
          <p className="mt-1 font-serif text-4xl font-medium">{Number(data.score).toFixed(0)}/100</p>
          <p className="mt-1 text-xs opacity-80">
            {data.nb_clients} clients actifs · {data.nb_a_relancer} à relancer sous 30 jours
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-900">Vert : {data.nb_vert}</span>
          <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">Orange : {data.nb_orange}</span>
          <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-900">Rouge : {data.nb_rouge}</span>
        </div>
      </div>
    </div>
  );
}

