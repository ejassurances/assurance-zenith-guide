import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Simulator } from "@/components/simulator";

const TITLE = "Assurance emprunteur : renégocier avec la loi Lemoine";
const DESC =
  "Grâce à la loi Lemoine, changez d'assurance de prêt à tout moment. Notre cabinet vous accompagne pour réduire vos mensualités sans sacrifier vos garanties.";

const FAQ = [
  { q: "Puis-je changer d'assurance emprunteur à tout moment ?", a: "Oui, depuis la loi Lemoine (1er septembre 2022), la résiliation est possible à tout moment, sans frais ni motif." },
  { q: "Quelles économies puis-je espérer ?", a: "En moyenne 10 000 à 15 000 € sur un prêt de 250 000 € sur 20 ans, selon votre profil (âge, statut fumeur, garanties actuelles)." },
  { q: "La banque peut-elle refuser ma nouvelle assurance ?", a: "Uniquement si le nouveau contrat ne respecte pas l'équivalence des 18 critères CCSF de garanties. Le prix ne peut pas justifier un refus." },
  { q: "Combien de temps prend la démarche ?", a: "Comptez 3 à 6 semaines entre la sélection du nouveau contrat et la prise d'effet de la substitution. Nous gérons l'intégralité du dossier." },
  { q: "Y a-t-il des frais de dossier ?", a: "Notre premier rendez-vous est gratuit et sans engagement. Notre rémunération est intégralement transparente et présentée avant tout engagement." },
];

export const Route = createFileRoute("/assurance-emprunteur")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "/assurance-emprunteur" },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: "/assurance-emprunteur" }],
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
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Expertise emprunteur</p>
          <h1 className="mt-4 max-w-[22ch] text-balance font-serif text-4xl font-medium leading-[1.05] md:text-5xl">
            Réduire le coût de votre crédit, sans renoncer à vos garanties.
          </h1>
          <p className="mt-6 max-w-[60ch] text-lg text-ink-soft">
            La loi Lemoine, entrée en vigueur en 2022, vous permet de changer d'assurance emprunteur à tout moment.
            Nous mettons en concurrence les meilleurs assureurs du marché et nous chargeons de toute la procédure.
          </p>
        </div>
      </section>

      <section className="bg-surface py-16 md:py-20">
        <div className="container-page">
          <Simulator />
        </div>
      </section>

      <section className="py-20 md:py-24">
        <div className="container-page grid gap-16 md:grid-cols-2">
          <div>
            <h2 className="font-serif text-3xl font-medium">Notre méthode en 4 étapes</h2>
            <ol className="mt-8 space-y-6">
              {[
                { t: "Diagnostic", d: "Analyse gratuite de votre contrat actuel, de vos garanties et de votre offre de prêt." },
                { t: "Sélection", d: "Comparaison de 15+ contrats, ligne à ligne, sur les 18 critères d'équivalence CCSF." },
                { t: "Souscription", d: "Nous préparons votre dossier, votre déclaration de santé et envoyons la demande à la banque." },
                { t: "Suivi", d: "Nous suivons la substitution jusqu'à l'avenant final. La banque a 10 jours ouvrés pour répondre." },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-4">
                  <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-line font-serif text-sm">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-serif text-lg font-medium">{s.t}</p>
                    <p className="mt-1 text-sm text-ink-muted">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="font-serif text-3xl font-medium">Pour qui&nbsp;?</h2>
            <ul className="mt-8 space-y-4 text-ink-soft">
              <li className="flex gap-3"><span aria-hidden>✓</span> Vous venez de signer votre prêt et souhaitez présenter une délégation externe.</li>
              <li className="flex gap-3"><span aria-hidden>✓</span> Vous remboursez un crédit depuis plusieurs années et payez toujours le contrat groupe de la banque.</li>
              <li className="flex gap-3"><span aria-hidden>✓</span> Votre situation a évolué (arrêt du tabac, changement de profession) et vous souhaitez ajuster vos garanties.</li>
              <li className="flex gap-3"><span aria-hidden>✓</span> Vous êtes un professionnel de santé ou un profil aggravé et cherchez un contrat adapté.</li>
            </ul>
            <Link to="/contact" className="mt-10 inline-flex h-12 items-center justify-center rounded-md bg-ink px-6 text-sm font-medium text-primary-foreground">
              Étudier mon dossier
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
