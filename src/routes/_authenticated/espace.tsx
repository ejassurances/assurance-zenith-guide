import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { SITE } from "@/lib/site";

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

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-ink-muted">Chargement…</div>;
  }

  const nav = [
    { to: "/espace", label: "Tableau de bord", exact: true },
    { to: "/espace/clients", label: "Clients", hide: role === "client" },
    { to: "/espace/dossiers", label: "Dossiers" },
    { to: "/espace/taches", label: "Tâches", hide: role === "client" },
    { to: "/espace/compagnies", label: "Compagnies", hide: role !== "admin" && role !== "mandataire" },
    { to: "/espace/commissions", label: "Commissions", hide: role === "client" },
    { to: "/espace/comptabilite", label: "Comptabilité", hide: role === "client" },
    { to: "/espace/conformite", label: "Conformité", hide: role === "client" || role === "prescripteur" },
    { to: "/espace/der-modele", label: "DER (modèle)", hide: role === "client" },
    { to: "/espace/audit-logs", label: "Audit", hide: role !== "admin" },
    { to: "/espace/utilisateurs", label: "Utilisateurs", hide: role !== "admin" },
    { to: "/espace/parametres", label: "Paramètres" },
  ].filter((n) => !n.hide);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line bg-background">
        <div className="container-page flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo-ej-partners.png" alt="" className="size-8 rounded-md object-cover" />
            <span className="font-serif text-base font-medium">{SITE.shortName}</span>
            <span className="ml-2 rounded-full border border-line bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
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

      <div className="container-page grid gap-8 py-8 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-8 md:self-start">
          <nav className="flex flex-row gap-1 overflow-x-auto md:flex-col">
            {nav.map((n) => {
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={
                    "shrink-0 rounded-md px-3 py-2 text-sm transition-colors " +
                    (active ? "bg-ink text-primary-foreground" : "text-ink-soft hover:bg-surface")
                  }
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
