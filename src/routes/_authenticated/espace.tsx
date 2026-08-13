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
    { to: "/espace", label: "Tableau de bord", exact: true, hide: role === "client" },
    { to: "/espace/mon-espace", label: "Mon espace", hide: role !== "client" },
  ].filter((n) => !n.hide);

  const groupes = [
    {
      titre: "Relation client",
      items: [
        { to: "/espace/clients", label: "Clients", hide: role === "client" },
        { to: "/espace/dossiers", label: "Dossiers", hide: role === "client" },
        { to: "/espace/emails", label: "Emails", hide: role !== "admin" && role !== "mandataire" },
        { to: "/espace/taches", label: "Tâches", hide: role === "client" },
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
        { to: "/espace/commissions", label: "Commissions", hide: role === "client" },
        { to: "/espace/comptabilite", label: "Comptabilité", hide: role === "client" },
      ],
    },
    {
      titre: "Conformité",
      items: [
        { to: "/espace/conformite", label: "Conformité", hide: role === "client" || role === "prescripteur" },
        { to: "/espace/der-modele", label: "DER (modèle)", hide: role === "client" },
        { to: "/espace/audit-logs", label: "Audit", hide: role !== "admin" },
      ],
    },
    {
      titre: "Administration",
      items: [
        { to: "/espace/utilisateurs", label: "Utilisateurs", hide: role !== "admin" },
        { to: "/espace/parametres", label: "Paramètres", hide: false },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.hide) }))
    .filter((g) => g.items.length > 0);

  const itemClass = (active: boolean) =>
    "shrink-0 rounded-md border-l-2 px-3 py-2 text-sm transition-colors " +
    (active
      ? "border-[color:var(--crm-gold)] bg-ink text-primary-foreground"
      : "border-transparent text-ink-soft hover:bg-surface");



  return (
    <div className="crm-theme min-h-screen bg-background">
      <header className="border-b border-line bg-surface-elevated">
        <div className="container-page flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo-ej-partners.png" alt="" className="size-8 rounded-md object-cover" />
            <span className="text-base font-bold tracking-tight text-ink">
              EJ Partners <span className="font-medium text-[color:var(--crm-gold)]">Assurances</span>
            </span>
            <span className="ml-2 rounded-full border border-line bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              Espace {role ? ROLE_LABEL[role] : ""}
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-ink-muted sm:inline">{user?.email}</span>
            <button onClick={signOut} className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface">
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <div className="container-page grid min-w-0 gap-8 py-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="min-w-0 md:sticky md:top-8 md:self-start">
          <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0">
            {solo.map((n) => {
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              return (
                <Link key={n.to} to={n.to} className={itemClass(active)}>
                  {n.label}
                </Link>
              );
            })}
            {groupes.map((g) => (
              <div key={g.titre} className="shrink-0 md:mt-5">
                <p className="hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted md:block">
                  {g.titre}
                </p>
                <div className="flex flex-row gap-1 md:flex-col">
                  {g.items.map((n) => {
                    const active = pathname.startsWith(n.to);
                    return (
                      <Link key={n.to} to={n.to} className={itemClass(active)}>
                        {n.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
