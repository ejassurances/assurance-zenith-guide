import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE } from "@/lib/site";

const TITLE = "Contact & prise de rendez-vous";
const DESC = `Contactez ${SITE.name} pour un premier rendez-vous gratuit, sans engagement.`;

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: `${TITLE} — ${SITE.name}` },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "/contact" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: Page,
});

function Page() {
  const [sent, setSent] = useState(false);

  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <section className="border-b border-line">
        <div className="container-page max-w-3xl py-20 md:py-24">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Contact</p>
          <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.05] md:text-5xl">
            Un premier rendez-vous, gratuit et sans engagement.
          </h1>
          <p className="mt-6 text-lg text-ink-soft">
            30 minutes pour comprendre votre situation, poser vos questions et repartir avec une première analyse.
          </p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page grid max-w-5xl gap-12 md:grid-cols-[1fr_20rem]">
          <form
            className="space-y-5"
            onSubmit={(e) => { e.preventDefault(); setSent(true); }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Prénom" name="firstname" required />
              <Input label="Nom" name="lastname" required />
            </div>
            <Input label="Email" name="email" type="email" required />
            <Input label="Téléphone" name="phone" type="tel" />
            <div>
              <label className="mb-2 block text-sm font-medium text-ink-soft">Sujet</label>
              <select
                name="subject"
                className="w-full rounded-md border border-line bg-background px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ink"
                defaultValue="emprunteur"
              >
                <option value="emprunteur">Assurance emprunteur</option>
                <option value="coparentalite">Coparentalité / transmission</option>
                <option value="autre">Autre demande</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink-soft">Votre message</label>
              <textarea
                name="message"
                rows={5}
                required
                className="w-full rounded-md border border-line bg-background px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ink"
                placeholder="Décrivez brièvement votre situation…"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-md bg-ink px-8 text-sm font-medium text-primary-foreground"
            >
              Envoyer ma demande
            </button>
            {sent && (
              <p className="rounded-md bg-surface p-4 text-sm text-ink-soft">
                Merci, votre demande a été enregistrée. Nous vous recontactons sous 24h ouvrées.
              </p>
            )}
          </form>

          <aside className="space-y-6 rounded-lg border border-line bg-surface p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Nous joindre</p>
              <p className="mt-3 font-serif text-lg">{SITE.email}</p>
              <p className="font-serif text-lg">{SITE.phone}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Cabinet</p>
              <p className="mt-3 text-sm text-ink-soft">{SITE.address}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Agrément</p>
              <p className="mt-3 text-sm text-ink-soft">{SITE.orias}</p>
            </div>
          </aside>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Input({ label, name, type = "text", required }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-ink-soft">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-md border border-line bg-background px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-ink"
      />
    </div>
  );
}
