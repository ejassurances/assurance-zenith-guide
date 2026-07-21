import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE } from "@/lib/site";

const TITLE = "À propos du cabinet";
const DESC = `${SITE.name} est un cabinet de courtage indépendant en assurances, spécialisé en assurance emprunteur et transmission de patrimoine.`;

export const Route = createFileRoute("/a-propos")({
  head: () => ({
    meta: [
      { title: `${TITLE} — ${SITE.name}` },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "/a-propos" },
    ],
    links: [{ rel: "canonical", href: "/a-propos" }],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <section className="border-b border-line">
        <div className="container-page max-w-3xl py-20 md:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Le cabinet</p>
          <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.05] md:text-5xl">
            Un cabinet indépendant, deux expertises pointues.
          </h1>
          <p className="mt-6 text-lg text-ink-soft">
            {SITE.name} est un cabinet de courtage en assurances basé à Paris et intervenant dans toute la France.
            Notre indépendance vis-à-vis des banques et des grands groupes d'assurance garantit un conseil
            aligné sur un seul intérêt : le vôtre.
          </p>
        </div>
      </section>

      <section className="py-20 md:py-24">
        <div className="container-page max-w-3xl space-y-10 text-ink-soft">
          <div>
            <h2 className="font-serif text-2xl font-medium text-ink">Notre positionnement</h2>
            <p className="mt-3">
              Nous avons fait le choix de la spécialisation. Deux expertises, travaillées en profondeur, plutôt
              qu'un catalogue superficiel : l'<strong>assurance emprunteur</strong> et l'<strong>accompagnement des parents solos</strong> dans
              la transmission de leur patrimoine.
            </p>
          </div>
          <div>
            <h2 className="font-serif text-2xl font-medium text-ink">Notre méthode</h2>
            <p className="mt-3">
              Chaque dossier commence par un diagnostic gratuit, se poursuit par une mise en concurrence sur les
              18 critères d'équivalence CCSF (pour l'assurance emprunteur) ou par une cartographie patrimoniale
              (pour la transmission), et se conclut par un suivi de long terme.
            </p>
          </div>
          <div>
            <h2 className="font-serif text-2xl font-medium text-ink">Cadre réglementaire</h2>
            <p className="mt-3">
              {SITE.name} est immatriculé au registre unique des intermédiaires en assurance ({SITE.orias}) et
              exerce sous le contrôle de l'Autorité de Contrôle Prudentiel et de Résolution (ACPR).
            </p>
          </div>
          <Link to="/contact" className="inline-flex h-12 items-center justify-center rounded-md bg-ink px-6 text-sm font-medium text-primary-foreground">
            Prendre contact
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
