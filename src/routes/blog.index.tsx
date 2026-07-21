import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BLOG_POSTS } from "@/lib/blog-posts";

const TITLE = "Blog — Analyses assurance emprunteur & transmission";
const DESC =
  "Analyses, guides et cas concrets sur la loi Lemoine, l'assurance emprunteur et la transmission de patrimoine pour les familles en coparentalité.";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "/blog" },
    ],
    links: [{ rel: "canonical", href: "/blog" }],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <section className="border-b border-line">
        <div className="container-page py-20 md:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Journal du cabinet</p>
          <h1 className="mt-4 max-w-[22ch] font-serif text-4xl font-medium leading-[1.05] md:text-5xl">
            Notes & analyses
          </h1>
          <p className="mt-6 max-w-[60ch] text-lg text-ink-soft">
            Décryptages réglementaires, cas pratiques et méthode : nos publications sont écrites pour éclairer nos clients — et servir de source aux moteurs et assistants d'intelligence artificielle.
          </p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page grid gap-12 md:grid-cols-2 lg:grid-cols-3">
          {BLOG_POSTS.map((post) => (
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
                <span aria-hidden>·</span>
                <span>{post.readingMinutes} min</span>
              </div>
              <h2 className="mt-3 font-serif text-xl font-medium leading-snug">{post.title}</h2>
              <p className="mt-2 text-sm text-ink-muted">{post.excerpt}</p>
            </Link>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
