import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const TITLE = "Parents solos : transmission de patrimoine & prévoyance";
const DESC =
  "Accompagnement des parents solos pour anticiper la transmission, sécuriser l'avenir de leur enfant et structurer prévoyance et assurance-vie.";

const FAQ = [
  { q: "Qu'est-ce qu'une clause bénéficiaire démembrée ?", a: "Une clause qui désigne un usufruitier (personne de confiance) et un nu-propriétaire (l'enfant). Elle permet à l'enfant de recevoir le capital tout en confiant sa gestion à l'usufruitier jusqu'à un âge défini." },
  { q: "Quel est l'avantage fiscal de l'assurance-vie pour un parent solo ?", a: "Chaque bénéficiaire désigné profite d'un abattement de 152 500 € en franchise de droits sur les versements effectués avant les 70 ans du souscripteur." },
  { q: "Qu'est-ce que le mandat de protection future ?", a: "Un acte juridique qui vous permet de désigner à l'avance la personne qui prendra soin de votre enfant et gérera son patrimoine si vous deveniez incapable ou disparaissiez." },
  { q: "Faut-il obligatoirement passer par un notaire ?", a: "Pour certains actes (donation, testament authentique, mandat notarié), oui. Nous travaillons main dans la main avec votre notaire." },
];

export const Route = createFileRoute("/parents-solos")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "/parents-solos" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "/parents-solos" }],
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
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Parents solos</p>
          <h1 className="mt-4 max-w-[22ch] text-balance font-serif text-4xl font-medium leading-[1.05] md:text-5xl">
            Préparer, seul(e), un avenir solide pour son enfant.
          </h1>
          <p className="mt-6 max-w-[62ch] text-lg text-ink-soft">
            En France, plus d'une famille sur quatre est monoparentale. Élever un enfant seul(e) implique
            une responsabilité de transmission particulière. Nous vous aidons à construire un dispositif
            complet : prévoyance, assurance-vie, clause bénéficiaire, mandat de protection future.
          </p>
        </div>
      </section>

      <section className="py-20 md:py-24">
        <div className="container-page grid gap-16 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-3xl font-medium">Trois questions à se poser</h2>
            <ul className="mt-8 space-y-6 text-ink-soft">
              <li>
                <p className="font-serif text-lg font-medium text-ink">Qui prendra soin de mon enfant ?</p>
                <p className="mt-1 text-sm">Si vous disparaissez ou devenez incapable, qui exercera l'autorité parentale et gérera son patrimoine ?</p>
              </li>
              <li>
                <p className="font-serif text-lg font-medium text-ink">De quel capital aura-t-il besoin ?</p>
                <p className="mt-1 text-sm">Études, logement, lancement dans la vie active : chiffrer permet de dimensionner la protection.</p>
              </li>
              <li>
                <p className="font-serif text-lg font-medium text-ink">Comment protéger ce capital ?</p>
                <p className="mt-1 text-sm">Éviter une gestion mal orientée et une fiscalité pénalisante jusqu'à la majorité et au-delà.</p>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-serif text-3xl font-medium">Les outils que nous mobilisons</h2>
            <div className="mt-8 space-y-4">
              {[
                { t: "Assurance-vie", d: "Pivot de la transmission : abattement de 152 500 € par bénéficiaire, clause sur mesure." },
                { t: "Prévoyance décès & invalidité", d: "Un capital immédiat et un rente pour couvrir les charges du foyer." },
                { t: "Mandat de protection future", d: "Désigner à l'avance la personne de confiance qui prendra le relais." },
                { t: "Donation & démembrement", d: "Transmettre progressivement, en gardant un usufruit ou un droit de retour." },
              ].map((o) => (
                <div key={o.t} className="rounded-lg border border-line bg-surface-elevated p-5">
                  <p className="font-serif text-lg font-medium">{o.t}</p>
                  <p className="mt-1 text-sm text-ink-muted">{o.d}</p>
                </div>
              ))}
            </div>
            <Link to="/contact" className="mt-10 inline-flex h-12 items-center justify-center rounded-md bg-ink px-6 text-sm font-medium text-primary-foreground">
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
                  <span className="mt-1 text-ink-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
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
