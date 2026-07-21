import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Simulator } from "@/components/simulator";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { SITE } from "@/lib/site";
import expertiseEmprunteurImg from "@/assets/expertise-emprunteur.jpg";
import expertiseParentsImg from "@/assets/expertise-parents.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${SITE.name} — Courtier en assurance emprunteur & transmission` },
      { name: "description", content: SITE.description },
      { property: "og:title", content: `${SITE.name}` },
      { property: "og:description", content: SITE.description },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: HomePage,
});

function HomePage() {
  const posts = BLOG_POSTS.slice(0, 3);

  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-line">
        <div className="container-page py-20 md:py-28">
          <p className="mb-6 text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Cabinet de courtage indépendant · Eaubonne (95)
          </p>
          <h1 className="max-w-[18ch] text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            {SITE.tagline}
          </h1>
          <p className="mt-6 max-w-[58ch] text-pretty text-base text-ink-soft md:text-lg">
            Nous accompagnons deux profils avec la même exigence : les emprunteurs qui veulent réduire le coût
            de leur crédit immobilier, et les parents solos qui préparent la transmission de leur patrimoine.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/assurance-emprunteur"
              className="inline-flex h-12 items-center justify-center rounded-md bg-ink px-6 text-sm font-medium text-primary-foreground transition-transform active:scale-95"
            >
              Optimiser mon assurance emprunteur
            </Link>
            <Link
              to="/parents-solos"
              className="inline-flex h-12 items-center justify-center rounded-md border border-line bg-surface-elevated px-6 text-sm font-medium text-ink"
            >
              Transmission & Parents solos
            </Link>
          </div>
        </div>
      </section>

      {/* Simulator */}
      <section id="simulateur" className="bg-surface py-16 md:py-24">
        <div className="container-page">
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Outil</p>
            <h2 className="mt-2 font-serif text-3xl font-medium md:text-4xl">
              Combien pouvez-vous économiser sur votre assurance de prêt ?
            </h2>
            <p className="mt-4 text-base text-ink-soft">
              Grâce à la loi Lemoine, vous pouvez changer d'assurance emprunteur à tout moment, sans frais.
              Notre simulateur vous donne une première estimation en 30 secondes.
            </p>
          </div>
          <Simulator />
        </div>
      </section>

      {/* Expertises */}
      <section className="py-20 md:py-28">
        <div className="container-page grid gap-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Nos expertises</p>
            <h2 className="mt-2 font-serif text-3xl font-medium md:text-4xl">
              Deux spécialités. Une seule méthode&nbsp;: la vôtre.
            </h2>
          </div>

          <ExpertiseRow
            eyebrow="Expertise emprunteur"
            title="Renégociation & délégation d'assurance"
            body="La loi Lemoine vous permet de changer d'assurance à tout moment. Nous sélectionnons les contrats les plus protecteurs au meilleur tarif pour réduire vos mensualités sans sacrifier vos garanties. Économie moyenne constatée sur nos dossiers : 11 400 €."
            to="/assurance-emprunteur"
            cta="Découvrir l'expertise"
            image={expertiseEmprunteurImg}
            imageAlt="Bureau d'un cabinet moderne, lumière naturelle"
          />

          <ExpertiseRow
            reverse
            eyebrow="Accompagnement parents solos"
            title="Patrimoine, transmission & prévoyance"
            body="Parce que protéger son enfant seul(e) demande une ingénierie spécifique, nous structurons vos placements, votre prévoyance et vos clauses bénéficiaires pour garantir son avenir — quels que soient les aléas de la vie."
            to="/parents-solos"
            cta="Découvrir l'accompagnement"
            image={expertiseParentsImg}
            imageAlt="Bureau chaleureux avec un cadre photo de famille"
          />
        </div>
      </section>

      {/* Case Studies */}
      <section className="bg-ink py-20 text-primary-foreground md:py-28">
        <div className="container-page">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Dossiers concrets</p>
              <h2 className="mt-2 font-serif text-3xl font-medium md:text-4xl">Ce que nous obtenons pour nos clients</h2>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <CaseCard
              tag="Cas #01 — Emprunt immobilier"
              date="Validé Oct. 2024"
              headline="Couple, 38 ans, 450 000 € restants sur 20 ans."
              beforeLabel="Contrat groupe banque"
              beforeValue="0.38 % / an"
              afterLabel="Délégation EJ Partners"
              afterValue="0.12 % / an"
              gain="Économie totale : 18 420 € sur la durée restante."
            />
            <CaseCard
              tag="Cas #02 — Parent solo"
              date="Structuré Févr. 2025"
              headline="Mère célibataire, un enfant de 6 ans, 320 000 € d'épargne."
              beforeLabel="Avant"
              beforeValue="Aucune clause bénéficiaire adaptée"
              afterLabel="Après"
              afterValue="Clause démembrée + mandat de protection future"
              gain="Fiscalité optimisée de 45 % sur la transmission, gestion sécurisée jusqu'aux 25 ans de l'enfant."
            />
          </div>
        </div>
      </section>

      {/* Blog Preview */}
      <section className="py-20 md:py-28">
        <div className="container-page">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Notes & analyses</p>
              <h2 className="mt-2 font-serif text-3xl font-medium md:text-4xl">Le journal du cabinet</h2>
            </div>
            <Link to="/blog" className="text-sm font-medium underline underline-offset-4 hover:text-ink-soft">
              Tout lire
            </Link>
          </div>
          <div className="grid gap-10 md:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.slug}
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="group flex flex-col"
              >
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-surface outline outline-1 -outline-offset-1 outline-black/5">
                  <img
                    src={post.image}
                    alt={post.imageAlt}
                    width={1200}
                    height={900}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="mt-4 flex items-center gap-3 text-[11px] uppercase tracking-widest text-ink-muted">
                  <span>{post.category}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                </div>
                <h3 className="mt-3 font-serif text-xl font-medium leading-snug">{post.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{post.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-line bg-surface py-20">
        <div className="container-page grid gap-10 md:grid-cols-3">
          <TrustItem
            title="Indépendance"
            body="Nous ne sommes liés à aucune banque. Notre seul mandat est votre intérêt."
          />
          <TrustItem
            title="Réglementation"
            body={`Cabinet immatriculé ${SITE.orias}, sous le contrôle de l'ACPR.`}
          />
          <TrustItem
            title="Sans frais cachés"
            body="Notre rémunération est transparente et détaillée avant tout engagement."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line py-20 md:py-28">
        <div className="container-page max-w-3xl text-center">
          <h2 className="font-serif text-3xl font-medium md:text-4xl">
            Un premier rendez-vous, sans engagement.
          </h2>
          <p className="mt-4 text-ink-soft">
            30 minutes pour comprendre votre situation et vous dire, très concrètement, ce que nous pouvons faire.
          </p>
          <Link
            to="/contact"
            className="mt-8 inline-flex h-12 items-center justify-center rounded-md bg-ink px-8 text-sm font-medium text-primary-foreground"
          >
            Prendre rendez-vous
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function ExpertiseRow({
  eyebrow, title, body, to, cta, image, imageAlt, reverse,
}: {
  eyebrow: string; title: string; body: string; to: string; cta: string;
  image: string; imageAlt: string; reverse?: boolean;
}) {
  return (
    <article className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
      <div className={reverse ? "md:order-2" : ""}>
        <div className="aspect-video overflow-hidden rounded-md bg-surface outline outline-1 -outline-offset-1 outline-black/5">
          <img src={image} alt={imageAlt} width={1600} height={900} loading="lazy" className="h-full w-full object-cover" />
        </div>
      </div>
      <div className={reverse ? "md:order-1" : ""}>
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">{eyebrow}</p>
        <h3 className="mt-2 font-serif text-2xl font-medium md:text-3xl">{title}</h3>
        <p className="mt-4 max-w-[56ch] text-ink-soft">{body}</p>
        <Link to={to} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ink underline underline-offset-4">
          {cta} <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}

function CaseCard(props: {
  tag: string; date: string; headline: string;
  beforeLabel: string; beforeValue: string; afterLabel: string; afterValue: string; gain: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-6 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/60">{props.tag}</span>
        <span className="text-xs italic text-white/40">{props.date}</span>
      </div>
      <p className="mt-6 font-serif text-lg text-white md:text-xl">{props.headline}</p>
      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-white/10 pt-6">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/50">{props.beforeLabel}</p>
          <p className="mt-1 font-serif text-lg text-white/90">{props.beforeValue}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/50">{props.afterLabel}</p>
          <p className="mt-1 font-serif text-lg text-white">{props.afterValue}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-white/70">{props.gain}</p>
    </div>
  );
}

function TrustItem({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="font-serif text-xl font-medium">{title}</p>
      <p className="mt-2 text-sm text-ink-muted">{body}</p>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
