import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IconChecklist, IconMail, IconSettings } from "@tabler/icons-react";

import { DomainRail } from "@/components/shell/domain-rail";
import { GlobalSearch } from "@/components/shell/global-search";
import { IconAction, IconActionLink } from "@/components/shell/icon-action";
import { ModuleColumn } from "@/components/shell/module-column";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  NAV_SETTINGS,
  domaineActif,
  domainesVisibles,
  filtrerDomaine,
  premierLien,
  type AppRole,
  type NavDomain,
} from "@/lib/navigation";

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
  const [domaineChoisi, setDomaineChoisi] = useState<string | null>(null);

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

  const roleNav = (role ?? null) as AppRole | null;
  const domaines = useMemo(() => domainesVisibles(roleNav), [roleNav]);
  const reglages = useMemo(() => filtrerDomaine(NAV_SETTINGS, roleNav), [roleNav]);

  // Le domaine choisi dans le rail prime s'il contient la route courante
  // (une même page peut apparaître dans deux domaines), sinon on suit la route.
  const domaineDeLaRoute = useMemo(() => domaineActif(pathname, roleNav), [pathname, roleNav]);
  const tous = useMemo(() => [...domaines, ...(reglages ? [reglages] : [])], [domaines, reglages]);
  const contientRoute = (d: NavDomain) =>
    d.modules.some((m) =>
      m.items.some((i) => i.to && (i.exact ? pathname === i.to : pathname === i.to || pathname.startsWith(i.to + "/"))),
    );
  const choisi = tous.find((d) => d.key === domaineChoisi);
  const domaine =
    (choisi && contientRoute(choisi) ? choisi : null) ??
    tous.find((d) => d.key === domaineDeLaRoute?.key) ??
    choisi ??
    domaines[0] ??
    reglages ??
    null;


  const sousModuleActif = useMemo(() => {
    if (!domaine) return null;
    for (const m of domaine.modules) {
      for (const i of m.items) {
        if (!i.to) continue;
        const ok = i.exact ? pathname === i.to : pathname === i.to || pathname.startsWith(i.to + "/");
        if (ok) return { module: m.module, label: i.label };
      }
    }
    return null;
  }, [domaine, pathname]);

  const ouvrirDomaine = (d: NavDomain) => {
    setDomaineChoisi(d.key);
    const lien = premierLien(d);
    if (lien && lien !== pathname) navigate({ to: lien });
    setMenuOuvert(false);
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-ink-muted">Chargement…</div>;
  }

  const initiales = (user?.email ?? "")
    .replace(/@.*/, "")
    .split(/[.\-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const logo = (
    <Link to="/espace" onClick={() => setMenuOuvert(false)} aria-label="EJ Partners Assurances">
      <img
        src="/logo-ej-partners.png"
        alt=""
        className="size-9 rounded-sm object-cover ring-1 ring-[color:var(--crm-gold)]/40"
      />
    </Link>
  );

  const avatar = (
    <button
      type="button"
      onClick={() => {
        setMenuOuvert(false);
        void signOut();
      }}
      title={`${user?.email ?? ""} — Se déconnecter`}
      className="flex w-full flex-col items-center gap-1 rounded-sm px-1 py-2 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-[color:var(--crm-gold)]/40 bg-[color:var(--crm-gold)]/15 text-[10px] font-bold text-[color:var(--crm-gold)]">
        {initiales || "EJ"}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] leading-none">Quitter</span>
    </button>
  );

  return (
    <div className="crm-theme flex min-h-screen bg-background">
      {/* Voile mobile */}
      {menuOuvert && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setMenuOuvert(false)}
          className="fixed inset-0 z-30 bg-ink/50 lg:hidden"
        />
      )}

      {/* Niveaux 1 et 2 : rail des domaines + colonne des modules */}
      <div
        className={
          "fixed inset-y-0 left-0 z-40 flex transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 " +
          (menuOuvert ? "translate-x-0" : "-translate-x-full")
        }
      >
        <DomainRail
          domaines={domaines}
          reglages={reglages}
          actif={domaine?.key ?? null}
          onSelect={ouvrirDomaine}
          header={logo}
          footer={avatar}
        />
        {domaine && <ModuleColumn domaine={domaine} pathname={pathname} onNavigate={() => setMenuOuvert(false)} />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-surface-elevated">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMenuOuvert(true)}
              aria-label="Ouvrir le menu"
              className="rounded-full border border-line px-3 py-2 text-ink-soft lg:hidden"
            >
              <span aria-hidden="true">☰</span>
            </button>

            <div className="flex min-w-0 flex-1 justify-center">
              <GlobalSearch />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <IconActionLink label="Traitement des emails" to="/espace/relation-client">
                <IconMail size={17} aria-hidden="true" />
              </IconActionLink>
              <IconActionLink label="Tâches" to="/espace/taches" badge={tachesOuvertes}>
                <IconChecklist size={17} aria-hidden="true" />
              </IconActionLink>
              <IconActionLink label="Paramètres" to="/espace/parametres">
                <IconSettings size={17} aria-hidden="true" />
              </IconActionLink>
              <span className="crm-eyebrow hidden xl:inline">{role ? ROLE_LABEL[role] : ""}</span>
              <IconAction label={`${user?.email ?? ""} — Se déconnecter`} onClick={() => void signOut()}>
                <span className="text-[11px] font-bold text-[color:var(--crm-gold)]">{initiales || "EJ"}</span>
              </IconAction>
            </div>
          </div>

          <nav
            aria-label="Fil d'Ariane"
            className="min-w-0 truncate border-t border-line px-4 py-2 text-xs text-ink-muted sm:px-6"
          >
            {domaine && <span className="font-semibold uppercase tracking-[0.14em]">{domaine.short}</span>}
            {sousModuleActif && (
              <>
                <span aria-hidden="true" className="px-2 text-ink-muted/50">
                  ›
                </span>
                <span>{sousModuleActif.module}</span>
                <span aria-hidden="true" className="px-2 text-ink-muted/50">
                  ›
                </span>
                <span className="text-ink">{sousModuleActif.label}</span>
              </>
            )}
          </nav>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto min-w-0 max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
