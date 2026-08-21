import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/_authenticated/espace")({
  component: EspaceLayout,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrateur",
  mandataire: "Mandataire",
  client: "Client",
  prescripteur: "Prescripteur",
};

function EspaceLayout() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mustChange, setMustChange] = useState(false);
  const [menuOuvert, setMenuOuvert] = useState(false);


  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  // Changement de mot de passe obligatoire après création automatique du compte.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("must_change_password").eq("id", user.id).maybeSingle();
      setMustChange(!!(data as { must_change_password?: boolean } | null)?.must_change_password);
    })();
  }, [user]);

  useEffect(() => {
    if (mustChange && pathname !== "/espace/parametres") {
      navigate({ to: "/espace/parametres", replace: true });
    }
  }, [mustChange, pathname, navigate]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-ink-muted">Chargement…</div>;
  }

  const solo = [
    { to: "/espace", label: "Tableau de bord", exact: true, hide: role === "client" || role === "prescripteur" },
    { to: "/espace/mon-espace", label: "Mon espace", hide: role !== "client" },
    { to: "/espace/mes-recommandations", label: "Mes recommandations", hide: role !== "prescripteur" },
  ].filter((n) => !n.hide);

  const groupes = [
    {
      titre: "Relation client",
      items: [
        { to: "/espace/clients", label: "Clients", hide: role === "client" || role === "prescripteur" },
        { to: "/espace/dossiers", label: "Dossiers", hide: role === "client" || role === "prescripteur" },
        { to: "/espace/sinistres", label: "Sinistres", hide: role !== "admin" && role !== "mandataire" },
        { to: "/espace/taches", label: "Tâches", hide: role === "client" || role === "prescripteur" },

      ],
    },
    {
      titre: "Marché & Produits",
      items: [
        { to: "/espace/compagnies", label: "Compagnies", hide: role !== "admin" && role !== "mandataire" },
        { to: "/espace/neoliane", label: "Néoliane (API)", hide: role !== "admin" && role !== "mandataire" },
      ],
    },
    {
      titre: "Finance",
      items: [
        { to: "/espace/commissions", label: "Commissions", hide: role === "client" || role === "prescripteur" },
        { to: "/espace/comptabilite", label: "Comptabilité", hide: role === "client" || role === "prescripteur" },
      ],
    },
    {
      titre: "Conformité",
      items: [
        { to: "/espace/conformite", label: "Conformité", hide: role === "client" || role === "prescripteur" },
        { to: "/espace/der-modele", label: "DER (modèle)", hide: role === "client" || role === "prescripteur" },
        {
          to: "/espace/bibliotheque-cg",
          label: "Bibliothèque CG clients",
          hide: role === "client" || role === "prescripteur",
        },
        { to: "/espace/audit-logs", label: "Audit", hide: role !== "admin" },
      ],
    },
    {
      titre: "Administration",
      items: [
        { to: "/espace/prescripteurs", label: "Prescripteurs", hide: role !== "admin" && role !== "mandataire" },
        { to: "/espace/utilisateurs", label: "Utilisateurs", hide: role !== "admin" },
        { to: "/espace/parametres", label: "Paramètres", hide: false },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.hide) }))
    .filter((g) => g.items.length > 0);

  const itemClass = (active: boolean) =>
    "block shrink-0 whitespace-nowrap rounded-sm border-l-2 px-4 py-2.5 text-sm transition-colors " +
    (active
      ? "border-[color:var(--crm-gold)] bg-[color:var(--crm-gold)]/10 font-medium text-[color:var(--crm-gold)]"
      : "border-transparent text-white/55 hover:bg-white/5 hover:text-white");

  const initiales = (user?.email ?? "")
    .replace(/@.*/, "")
    .split(/[.\-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="crm-theme min-h-screen bg-background md:flex">
      {/* Voile mobile */}
      {menuOuvert && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setMenuOuvert(false)}
          className="fixed inset-0 z-30 bg-ink/50 md:hidden"
        />
      )}

      {/* Navigation — colonne marine pleine hauteur (tiroir sur mobile) */}
      <aside
        className={
          "fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] shrink-0 overflow-y-auto border-r border-[color:var(--crm-gold)]/20 bg-[color:var(--crm-navy)] text-white transition-transform duration-200 md:sticky md:top-0 md:z-auto md:flex md:h-screen md:w-72 md:max-w-none md:translate-x-0 md:flex-col " +
          (menuOuvert ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex items-center justify-between px-6 py-6 md:px-8 md:py-8">
          <Link to="/espace" className="flex min-w-0 items-center gap-3" onClick={() => setMenuOuvert(false)}>
            <img
              src="/logo-ej-partners.png"
              alt=""
              className="size-10 shrink-0 rounded-sm object-cover ring-1 ring-[color:var(--crm-gold)]/40"
            />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--crm-gold)]">
                EJ Partners
              </span>
              <span className="block text-[10px] uppercase tracking-[0.22em] text-white/40">Assurances</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOuvert(false)}
            aria-label="Fermer le menu"
            className="shrink-0 rounded-sm border border-white/15 px-2 py-1 text-xs text-white/70 md:hidden"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-col px-4 pb-6 md:flex-1 md:overflow-y-auto">
          {solo.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={itemClass(active)} onClick={() => setMenuOuvert(false)}>
                {n.label}
              </Link>
            );
          })}
          {groupes.map((g) => (
            <div key={g.titre} className="mt-6 md:mt-7">
              <p className="px-4 pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{g.titre}</p>
              <div className="flex flex-col gap-0.5">
                {g.items.map((n) => {
                  const active = pathname.startsWith(n.to);
                  return (
                    <Link key={n.to} to={n.to} className={itemClass(active)} onClick={() => setMenuOuvert(false)}>
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/5 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--crm-gold)]/40 bg-[color:var(--crm-gold)]/15 text-xs font-bold text-[color:var(--crm-gold)]">
              {initiales || "EJ"}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-xs font-medium text-white">{user?.email}</span>
              <span className="block text-[10px] uppercase tracking-wider text-white/40">
                {role ? ROLE_LABEL[role] : ""}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setMenuOuvert(false);
              void signOut();
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-sm border border-[color:var(--crm-gold)]/40 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--crm-gold)] transition-colors hover:bg-[color:var(--crm-gold)]/10"
          >
            <span aria-hidden="true">⏻</span>
            Se déconnecter
          </button>
        </div>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-surface-elevated">
          <div className="grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 sm:px-6 md:px-10">
            <button
              type="button"
              onClick={() => setMenuOuvert(true)}
              aria-label="Ouvrir le menu"
              className="rounded-sm border border-line px-3 py-2 text-ink-soft md:hidden"
            >
              <span aria-hidden="true">☰</span>
            </button>
            <span className="hidden md:block" />
            <p className="crm-eyebrow truncate">Espace {role ? ROLE_LABEL[role] : ""}</p>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-ink-muted lg:inline">{user?.email}</span>
              <button
                onClick={signOut}
                className="rounded-sm border border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-soft transition-colors hover:border-[color:var(--crm-gold)]/50 hover:text-ink sm:px-4 sm:text-xs"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-10">
          <div className="mx-auto min-w-0 max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

