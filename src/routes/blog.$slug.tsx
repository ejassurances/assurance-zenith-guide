import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BLOG_POSTS, getPostBySlug, type BlogPost } from "@/lib/blog-posts";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getPostBySlug(params.slug);
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData, params }) => {
    const post = loaderData?.post;
    if (!post) return {};
    return {
      meta: [
        { title: `${post.title} — ${SITE.name}` },
        { name: "description", content: post.excerpt },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.excerpt },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `/blog/${params.slug}` },
        { property: "og:image", content: post.image },
        { property: "article:published_time", content: post.date },
        { property: "article:section", content: post.category },
      ],
      links: [{ rel: "canonical", href: `/blog/${params.slug}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt,
            image: post.image,
            datePublished: post.date,
            author: { "@type": "Organization", name: SITE.name },
            publisher: { "@type": "Organization", name: SITE.name },
          }),
        },
        ...(post.faq
          ? [
              {
                type: "application/ld+json" as const,
                children: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: post.faq.map((f) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                  })),
                }),
              },
            ]
          : []),
      ],
    };
  },
  component: PostPage,
  notFoundComponent: () => (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />
      <div className="container-page py-32 text-center">
        <h1 className="font-serif text-3xl">Article introuvable</h1>
        <Link to="/blog" className="mt-6 inline-block underline">Retour au blog</Link>
      </div>
      <SiteFooter />
    </div>
  ),
});

function PostPage() {
  const { post } = Route.useLoaderData() as { post: BlogPost };
  const others = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <article>
        <header className="border-b border-line">
          <div className="container-page max-w-3xl py-16 md:py-20">
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-ink-muted">
              <span>{post.category}</span>
              <span aria-hidden>·</span>
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span aria-hidden>·</span>
              <span>{post.readingMinutes} min de lecture</span>
            </div>
            <h1 className="mt-6 font-serif text-4xl font-medium leading-[1.1] md:text-5xl">
              {post.title}
            </h1>
            <p className="mt-6 text-lg text-ink-soft">{post.excerpt}</p>
          </div>
        </header>

        <div className="container-page max-w-3xl py-12">
          <div className="aspect-[16/9] overflow-hidden rounded-md bg-surface outline outline-1 -outline-offset-1 outline-black/5">
            <img src={post.image} alt={post.imageAlt} width={1200} height={675} className="h-full w-full object-cover" />
          </div>
        </div>

        <div className="container-page max-w-3xl pb-16">
          <div className="space-y-6 text-lg leading-relaxed text-ink-soft">
            {post.content.map((block, i) => renderBlock(block, i))}
          </div>

          {post.faq && (
            <section className="mt-16 border-t border-line pt-12">
              <h2 className="font-serif text-2xl font-medium text-ink">Questions fréquentes</h2>
              <div className="mt-6 divide-y divide-line">
                {post.faq.map((f) => (
                  <details key={f.q} className="group py-5">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-6 font-serif text-lg font-medium text-ink">
                      {f.q}
                      <span className="mt-1 text-ink-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
                    </summary>
                    <p className="mt-3 text-ink-soft">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>

      <section className="border-t border-line bg-surface py-20">
        <div className="container-page">
          <h2 className="font-serif text-2xl font-medium">À lire également</h2>
          <div className="mt-8 grid gap-10 md:grid-cols-2">
            {others.map((p) => (
              <Link key={p.slug} to="/blog/$slug" params={{ slug: p.slug }} className="group flex gap-4">
                <div className="aspect-square h-24 w-24 shrink-0 overflow-hidden rounded-md bg-background">
                  <img src={p.image} alt={p.imageAlt} loading="lazy" className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-ink-muted">{p.category}</p>
                  <p className="mt-1 font-serif text-lg leading-snug group-hover:underline">{p.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function renderBlock(block: BlogPost["content"][number], i: number) {
  switch (block.type) {
    case "h2":
      return <h2 key={i} className="pt-4 font-serif text-2xl font-medium text-ink">{block.text}</h2>;
    case "p":
      return <p key={i}>{block.text}</p>;
    case "ul":
      return (
        <ul key={i} className="list-disc space-y-2 pl-6 marker:text-ink-muted">
          {block.items.map((it, j) => <li key={j}>{it}</li>)}
        </ul>
      );
    case "quote":
      return (
        <blockquote key={i} className="border-l-2 border-ink pl-6 font-serif text-xl italic text-ink">
          « {block.text} »
          {block.author && <footer className="mt-2 text-sm not-italic text-ink-muted">— {block.author}</footer>}
        </blockquote>
      );
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
