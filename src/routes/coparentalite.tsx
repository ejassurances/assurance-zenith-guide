import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const TITLE = "Coparentalité : transmission de patrimoine & prévoyance pour parents biologiques et sociaux";
const DESC =
  "Accompagnement des familles en coparentalité — parents biologiques et parents sociaux — pour structurer transmission, prévoyance, assurance-vie et clause bénéficiaire adaptées à la parentalité plurielle.";

const FAQ = [
  {
    q: "Qu'est-ce que la coparentalité au sens patrimonial ?",
    a: "Un projet familial dans lequel un ou deux parents biologiques élèvent un enfant avec un ou deux parents sociaux — le plus souvent leurs conjoint(e)s. Cette configuration, fréquente notamment dans les familles homoparentales, appelle des outils juridiques et assurantiels spécifiques car le lien légal du parent social avec l'enfant n'est pas automatique.",
  },
  {
    q: "Le parent social peut-il être bénéficiaire d'une assurance-vie sans être taxé lourdement ?",
    a: "Oui, à condition d'utiliser les bons véhicules. Une assurance-vie avec clause bénéficiaire nommant expressément le parent social offre un abattement de 152 500 € en franchise de droits (versements avant 70 ans), même sans lien de filiation.",
  },
  {
    q: "Comment sécuriser l'enfant si le parent biologique disparaît ?",
    a: "Combinaison prévoyance décès + assurance-vie + mandat de protection future. Nous travaillons également, avec votre notaire, la reconnaissance du parent social (adoption simple, délégation-partage d'autorité parentale) pour verrouiller le lien juridique.",
  },
  {
    q: "Deux couples coparents : comment articuler les protections entre les quatre adultes ?",
    a: "Nous cartographions les quatre patrimoines, les régimes matrimoniaux et les liens de filiation. Chaque adulte souscrit des contrats coordonnés (clauses bénéficiaires croisées, prévoyance miroir) pour qu'aucune situation — décès, séparation, invalidité — ne mette l'enfant en insécurité.",
  },
];

export const Route = createFileRoute("/coparentalite")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "/coparentalite" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "/coparentalite" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <section className="border-b border-line">
        <div className="container-page py-20 md:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Coparentalité & parents sociaux
          </p>
          <h1 className="mt-4 max-w-[24ch] text-balance font-serif text-4xl font-medium leading-[1.05] md:text-5xl">
            Protéger l'enfant, quel que soit le nombre de parents qui l'entourent.
          </h1>
          <p className="mt-6 max-w-[64ch] text-lg text-ink-soft">
            La coparentalité — deux parents biologiques accompagnés d'un ou deux parents sociaux, souvent
            leurs conjoint(e)s — est un choix de famille de plus en plus fréquent, notamment pour les
            couples homosexuels qui construisent un projet parental partagé. Ce modèle appelle une
            ingénierie patrimoniale et assurantielle sur mesure : le lien légal du parent social n'est pas
            automatique, la transmission ne se règle pas comme dans une famille «&nbsp;classique&nbsp;»,
            et chaque adulte doit être intégré à la protection de l'enfant.
          </p>
        </div>
      </section>

      <section className="py-20 md:py-24">
        <div className="container-page grid gap-16 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-3xl font-medium">Les quatre questions à se poser</h2>
            <ul className="mt-8 space-y-6 text-ink-soft">
              <li>
                <p className="font-serif text-lg font-medium text-ink">Qui est légalement parent de l'enfant ?</p>
                <p className="mt-1 text-sm">
                  Filiation biologique, adoption simple, PMA à l'étranger, reconnaissance conjointe
                  anticipée : le point de départ de toute stratégie.
                </p>
              </li>
              <li>
                <p className="font-serif text-lg font-medium text-ink">Comment protéger le parent social ?</p>
                <p className="mt-1 text-sm">
                  Sans lien de filiation, il est fiscalement considéré comme un tiers. Nos outils
                  neutralisent cette asymétrie.
                </p>
              </li>
              <li>
                <p className="font-serif text-lg font-medium text-ink">Que se passe-t-il si un parent disparaît ?</p>
                <p className="mt-1 text-sm">
                  Autorité parentale, capital immédiat, poursuite du niveau de vie : chaque scénario doit
                  être anticipé pour les deux foyers.
                </p>
              </li>
              <li>
                <p className="font-serif text-lg font-medium text-ink">Comment coordonner les quatre adultes ?</p>
                <p className="mt-1 text-sm">
                  Clauses bénéficiaires croisées, prévoyance miroir, pactes familiaux : nous synchronisons
                  les contrats des deux couples.
                </p>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-serif text-3xl font-medium">Les outils que nous mobilisons</h2>
            <div className="mt-8 space-y-4">
              {[
                {
                  t: "Assurance-vie avec clause dédiée",
                  d: "Abattement de 152 500 € par bénéficiaire — y compris un parent social sans lien de filiation.",
                },
                {
                  t: "Prévoyance croisée",
                  d: "Chaque adulte souscrit un capital décès et une rente éducation au profit de l'enfant et des autres coparents.",
                },
                {
                  t: "Mandat de protection future",
                  d: "Désigner à l'avance qui gérera l'enfant et son patrimoine si le parent biologique devient incapable.",
                },
                {
                  t: "Reconnaissance du parent social",
                  d: "Coordination avec votre notaire ou avocat : adoption simple, délégation-partage d'autorité parentale.",
                },
              ].map((o) => (
                <div key={o.t} className="rounded-lg border border-line bg-surface-elevated p-5">
                  <p className="font-serif text-lg font-medium">{o.t}</p>
                  <p className="mt-1 text-sm text-ink-muted">{o.d}</p>
                </div>
              ))}
            </div>
            <Link
              to="/contact"
              className="mt-10 inline-flex h-12 items-center justify-center rounded-md bg-ink px-6 text-sm font-medium text-primary-foreground"
            >
              Prendre rendez-vous
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface py-20 md:py-24">
        <div className="container-page max-w-3xl">
          <h2 className="font-serif text-3xl font-medium">Questions fréquentes</h2>
          <div className="mt-10 divide-y divide-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-6">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-6 font-serif text-lg font-medium">
                  {f.q}
                  <span className="mt-1 text-ink-muted transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
