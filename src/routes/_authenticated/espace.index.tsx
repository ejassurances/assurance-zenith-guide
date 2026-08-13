import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { CommissionMoisCard } from "@/components/commission-mois-card";

export const Route = createFileRoute("/_authenticated/espace/")({
  component: Dashboard,
});

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
  const navigate = useNavigate();

  // Les clients disposent de leur espace dédié.
  useEffect(() => {
    if (role === "client") navigate({ to: "/espace/mon-espace", replace: true });
  }, [role, navigate]);
  const [stats, setStats] = useState({ clients: 0, prospects: 0, dossiers: 0, enCours: 0, signes: 0, commissions: 0 });
  const [taches, setTaches] = useState<Tache[]>([]);

  useEffect(() => {
    (async () => {
      const [c, p, tot, ec, si, com, tch] = await Promise.all([
        supabase.from("clients").select("*", { count: "exact", head: true }),
        supabase.from("clients").select("*", { count: "exact", head: true }).eq("statut", "prospect"),
        supabase.from("dossiers").select("*", { count: "exact", head: true }),
        supabase.from("dossiers").select("*", { count: "exact", head: true }).eq("statut", "en_cours"),
        supabase.from("dossiers").select("*", { count: "exact", head: true }).eq("statut", "signe"),
        supabase.from("commissions").select("montant"),
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
      setTaches((tch.data ?? []) as unknown as Tache[]);
    })();
  }, []);

  return (
    <div>
      <div className="border-b border-line pb-6">
        <p className="crm-eyebrow">Cabinet EJ Partners Assurances</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold text-ink">Tableau de bord</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Connecté en tant que <span className="font-medium text-ink">{user?.email}</span> — rôle {role ?? "…"}
        </p>
      </div>

      {role === "client" && <ClientDerBanner />}
      {(role === "admin" || role === "mandataire") && <ConformiteCabinetWidget />}

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {role !== "client" && (
          <Card label="Prospects" value={stats.prospects} sub={`${stats.clients} fiches au total`} accent />
        )}
        <Card label="Devis en cours" value={stats.enCours} sub={`${stats.dossiers} dossiers ouverts`} />
        <Card label="Affaires conclues" value={stats.signes} />
        {role !== "client" && (
          <Card label="Commissions estimées" value={`${stats.commissions.toLocaleString("fr-FR")} €`} accent />
        )}
      </div>


      {(role === "admin" || role === "mandataire") && <CommissionMoisCard />}

      {role !== "client" && <EconomiesEmprunteurCard scope={role === "admin" ? "cabinet" : "perso"} />}




      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ActiviteRecente isAdmin={role === "admin"} />
        </div>

        <section className="crm-panel-dark p-6 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--crm-gold)]">
              Tâches à faire
            </h2>
            <Link to="/espace/taches" className="text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white">
              Toutes →
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {taches.length === 0 ? (
              <p className="text-sm text-white/50">Aucune tâche en attente.</p>
            ) : (
              taches.map((t) => (
                <div
                  key={t.id}
                  className="rounded-sm border-l border-[color:var(--crm-gold)] bg-white/5 p-3 transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{t.titre}</p>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
                      <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/70">{t.priorite}</span>
                      {t.echeance && (
                        <span className="text-white/50">{new Date(t.echeance).toLocaleDateString("fr-FR")}</span>
                      )}
                    </div>
                  </div>
                  {t.clients && t.client_id && (
                    <Link
                      to="/espace/clients/$id"
                      params={{ id: t.client_id }}
                      className="mt-1 inline-block text-xs text-white/55 hover:text-[color:var(--crm-gold)]"
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
    <div className={"crm-card p-6 " + (accent ? "crm-card-accent" : "")}>
      <p className="crm-eyebrow">{label}</p>
      <p
        className={
          "crm-figure mt-3 text-3xl " + (accent ? "text-[color:var(--crm-gold-muted)]" : "text-ink")
        }
      >
        {value}
      </p>
      {sub && <p className="mt-2 text-xs text-ink-muted">{sub}</p>}
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


type EconomiesRow = {
  total_economies: number;
  nb_contrats: number;
  economie_moyenne: number;
  capital_total: number;
};

function EconomiesEmprunteurCard({ scope }: { scope: "cabinet" | "perso" }) {
  const [data, setData] = useState<EconomiesRow | null>(null);
  useEffect(() => {
    (async () => {
      const { data: res } = await supabase.rpc("economies_emprunteur", {} as never);
      const row = Array.isArray(res) ? (res[0] as EconomiesRow | undefined) : (res as EconomiesRow | null);
      if (row) setData(row);
    })();
  }, []);
  if (!data) return null;
  const euro = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));
  return (
    <div className="crm-band mt-6 p-8">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-85">
            Économies réalisées — assurance emprunteur {scope === "cabinet" ? "· tout le cabinet" : "· mes contrats"}
          </p>
          <p className="mt-3 font-serif text-5xl font-semibold tracking-tight">{euro(data.total_economies)}</p>
          <p className="mt-2 text-xs opacity-85">
            {data.nb_contrats} contrat{data.nb_contrats > 1 ? "s" : ""} emprunteur signé
            {data.nb_contrats > 1 ? "s" : ""} · moyenne {euro(data.economie_moyenne)} par client · marque EJ Assurances
          </p>
        </div>
        <p className="rounded-sm border border-white/30 px-4 py-2 text-xs font-medium uppercase tracking-widest">
          Capital assuré : {euro(data.capital_total)}
        </p>
      </div>
    </div>
  );
}


type FluxItem = {
  id: string;
  date: string;
  type: string;
  auteurRole: "client" | "mandataire" | "prescripteur" | "admin" | "systeme";
  auteurNom: string | null;
  titre: string;
  detail: string | null;
  clientId: string | null;
  clientNom: string | null;
};

const ROLE_BADGE: Record<FluxItem["auteurRole"], string> = {
  client: "bg-sky-100 text-sky-900",
  mandataire: "bg-violet-100 text-violet-900",
  prescripteur: "bg-amber-100 text-amber-900",
  admin: "bg-emerald-100 text-emerald-900",
  systeme: "bg-slate-100 text-slate-700",
};

const ROLE_LIBELLE: Record<FluxItem["auteurRole"], string> = {
  client: "Client",
  mandataire: "Mandataire",
  prescripteur: "Prescripteur",
  admin: "Cabinet",
  systeme: "Automatique",
};

const FILTRES: { value: "tous" | FluxItem["auteurRole"]; label: string }[] = [
  { value: "tous", label: "Tout" },
  { value: "client", label: "Clients" },
  { value: "mandataire", label: "Mandataires" },
  { value: "prescripteur", label: "Prescripteurs" },
];

/** Flux d'activité consolidé : actions du cabinet, des mandataires, des prescripteurs et des clients. */
function ActiviteRecente({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<FluxItem[] | null>(null);
  const [filtre, setFiltre] = useState<"tous" | FluxItem["auteurRole"]>("tous");

  useEffect(() => {
    (async () => {
      const [act, cli, dos, lm, dc] = await Promise.all([
        supabase
          .from("activites")
          .select("id,type,titre,contenu,created_at,created_by,client_id,clients(prenom,nom)")
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("clients")
          .select("id,prenom,nom,reference,statut,created_at,created_by,apporteur_id,commercial_id")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("dossiers")
          .select("id,reference,type_assurance,statut,created_at,created_by,apporteur_id,client_id,client_nom")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("lettres_mission")
          .select("id,signed_at,client_id,type_assurance,clients(prenom,nom)")
          .not("signed_at", "is", null)
          .order("signed_at", { ascending: false })
          .limit(8),
        supabase
          .from("devoirs_conseil")
          .select("id,signed_at,refuse_le,client_id,type_assurance,clients(prenom,nom)")
          .order("updated_at", { ascending: false })
          .limit(8),
      ]);

      const auteurs = new Map<string, { nom: string | null; role: FluxItem["auteurRole"] }>();
      const ids = new Set<string>();
      for (const a of act.data ?? []) if (a.created_by) ids.add(a.created_by);
      for (const c of cli.data ?? []) {
        if (c.created_by) ids.add(c.created_by);
        if (c.apporteur_id) ids.add(c.apporteur_id);
      }
      for (const d of dos.data ?? []) {
        if (d.created_by) ids.add(d.created_by);
        if (d.apporteur_id) ids.add(d.apporteur_id);
      }
      if (isAdmin && ids.size) {
        const liste = Array.from(ids);
        const [{ data: profs }, { data: roles }] = await Promise.all([
          supabase.from("profiles").select("id,full_name,email").in("id", liste),
          supabase.from("user_roles").select("user_id,role").in("user_id", liste),
        ]);
        for (const id of liste) {
          const prof = (profs ?? []).find((p) => p.id === id);
          const rs = (roles ?? []).filter((r) => r.user_id === id).map((r) => r.role as string);
          const role: FluxItem["auteurRole"] = rs.includes("admin")
            ? "admin"
            : rs.includes("mandataire")
            ? "mandataire"
            : rs.includes("prescripteur")
            ? "prescripteur"
            : rs.includes("client")
            ? "client"
            : "systeme";
          auteurs.set(id, { nom: prof?.full_name || prof?.email || null, role });
        }
      }

      const auteur = (id: string | null): { nom: string | null; role: FluxItem["auteurRole"] } =>
        (id && auteurs.get(id)) || { nom: null, role: id ? "admin" : "systeme" };

      const flux: FluxItem[] = [];

      for (const a of act.data ?? []) {
        const who = auteur(a.created_by ?? null);
        const c = a.clients as { prenom: string | null; nom: string } | null;
        flux.push({
          id: `act:${a.id}`,
          date: a.created_at,
          type: a.type,
          auteurRole: who.role,
          auteurNom: who.nom,
          titre: a.titre || "Activité",
          detail: a.contenu,
          clientId: a.client_id,
          clientNom: c ? [c.prenom, c.nom].filter(Boolean).join(" ") : null,
        });
      }

      for (const c of cli.data ?? []) {
        const who = auteur(c.apporteur_id ?? c.created_by ?? null);
        flux.push({
          id: `cli:${c.id}`,
          date: c.created_at,
          type: "fiche",
          auteurRole: c.apporteur_id ? "prescripteur" : who.role,
          auteurNom: who.nom,
          titre: `Nouvelle fiche ${c.statut === "prospect" ? "prospect" : "client"} · ${c.reference}`,
          detail: null,
          clientId: c.id,
          clientNom: [c.prenom, c.nom].filter(Boolean).join(" "),
        });
      }

      for (const d of dos.data ?? []) {
        const who = auteur(d.apporteur_id ?? d.created_by ?? null);
        flux.push({
          id: `dos:${d.id}`,
          date: d.created_at,
          type: "dossier",
          auteurRole: d.apporteur_id ? "prescripteur" : who.role,
          auteurNom: who.nom,
          titre: `Nouveau dossier ${d.reference} · ${d.type_assurance}`,
          detail: `Statut : ${d.statut}`,
          clientId: d.client_id,
          clientNom: d.client_nom,
        });
      }

      for (const l of lm.data ?? []) {
        const c = l.clients as { prenom: string | null; nom: string } | null;
        flux.push({
          id: `lm:${l.id}`,
          date: l.signed_at!,
          type: "signature",
          auteurRole: "client",
          auteurNom: c ? [c.prenom, c.nom].filter(Boolean).join(" ") : null,
          titre: `Lettre de mission signée · ${l.type_assurance}`,
          detail: null,
          clientId: l.client_id,
          clientNom: c ? [c.prenom, c.nom].filter(Boolean).join(" ") : null,
        });
      }

      for (const d of dc.data ?? []) {
        const date = d.signed_at ?? d.refuse_le;
        if (!date) continue;
        const c = d.clients as { prenom: string | null; nom: string } | null;
        flux.push({
          id: `dc:${d.id}`,
          date,
          type: "signature",
          auteurRole: "client",
          auteurNom: c ? [c.prenom, c.nom].filter(Boolean).join(" ") : null,
          titre: `Devoir de conseil ${d.signed_at ? "signé" : "refusé"} · ${d.type_assurance}`,
          detail: null,
          clientId: d.client_id,
          clientNom: c ? [c.prenom, c.nom].filter(Boolean).join(" ") : null,
        });
      }

      flux.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      setItems(flux);
    })();
  }, [isAdmin]);

  const liste = (items ?? []).filter((i) => (filtre === "tous" ? true : i.auteurRole === filtre)).slice(0, 12);

  return (
    <section className="rounded-2xl border border-line bg-surface-elevated p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg font-medium">Activité récente</h2>
        <Link to="/espace/clients" className="text-xs text-ink-muted hover:underline">
          Voir clients →
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {FILTRES.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFiltre(f.value)}
            className={
              "rounded-full px-3 py-1 text-xs transition-colors " +
              (filtre === f.value ? "bg-ink text-primary-foreground" : "border border-line text-ink-soft hover:bg-surface")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {!items ? (
          <p className="text-sm text-ink-muted">Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucune activité récente.</p>
        ) : (
          liste.map((a) => (
            <div key={a.id} className="border-b border-line pb-3 last:border-0">
              <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${ROLE_BADGE[a.auteurRole]}`}>
                    {ROLE_LIBELLE[a.auteurRole]}
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 uppercase tracking-wide">{a.type}</span>
                </span>
                <span>{new Date(a.date).toLocaleString("fr-FR")}</span>
              </div>
              {a.clientNom && a.clientId ? (
                <Link
                  to="/espace/clients/$id"
                  params={{ id: a.clientId }}
                  className="mt-1 block text-sm font-medium text-ink hover:underline"
                >
                  {a.clientNom}
                </Link>
              ) : (
                a.clientNom && <p className="mt-1 text-sm font-medium text-ink">{a.clientNom}</p>
              )}
              <p className="text-sm text-ink">{a.titre}</p>
              {a.auteurNom && a.auteurRole !== "client" && (
                <p className="text-xs text-ink-muted">par {a.auteurNom}</p>
              )}
              {a.detail && <p className="text-sm text-ink-soft line-clamp-2">{a.detail}</p>}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
