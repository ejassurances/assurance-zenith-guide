import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE } from "@/lib/site";

const TITLE = "Politique de confidentialité";
const DESC = `Politique de confidentialité et de protection des données personnelles de ${SITE.name}.`;

export const Route = createFileRoute("/politique-de-confidentialite")({
  head: () => ({
    meta: [
      { title: `${TITLE} — ${SITE.name}` },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "/politique-de-confidentialite" },
    ],
    links: [{ rel: "canonical", href: "/politique-de-confidentialite" }],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="min-h-screen bg-background text-ink">
      <SiteHeader />

      <section className="border-b border-line">
        <div className="container-page max-w-3xl py-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Données personnelles
          </p>
          <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.05] md:text-5xl">
            Politique de confidentialité
          </h1>
          <p className="mt-6 text-lg text-ink-soft">
            {SITE.name} s'engage à protéger vos données personnelles et à
            respecter la réglementation en vigueur, notamment le Règlement
            Général sur la Protection des Données (RGPD).
          </p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page max-w-3xl space-y-12">
          <Article title="1. Responsable du traitement">
            <p>
              Le responsable du traitement des données est {SITE.name}, société
              de courtage en assurances, immatriculée sous le numéro SIRET{" "}
              {SITE.siret}, agréée par l'ORIAS sous le numéro {SITE.orias}.
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-ink-soft">
              <li>Adresse : {SITE.address}</li>
              <li>Email : {SITE.email}</li>
              <li>Téléphone : {SITE.phone}</li>
            </ul>
          </Article>

          <Article title="2. Données collectées">
            <p>
              Nous collectons uniquement les données nécessaires à la gestion de
              votre demande :
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-ink-soft">
              <li>Identité (prénom, nom)</li>
              <li>Coordonnées (email, téléphone)</li>
              <li>Informations relatives à votre situation (âge, capital emprunté, durée du prêt, tabagisme)</li>
              <li>Contenu de votre message</li>
            </ul>
          </Article>

          <Article title="3. Finalités du traitement">
            <p>
              Vos données sont utilisées pour :
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-ink-soft">
              <li>Étudier votre demande et vous proposer une offre personnalisée</li>
              <li>Vous recontacter dans le cadre de votre demande</li>
              <li>Gérer la relation commerciale et contractuelle</li>
              <li>Respecter nos obligations légales et réglementaires</li>
            </ul>
          </Article>

          <Article title="4. Base légale">
            <p>
              Le traitement de vos données repose sur votre consentement,
              exprimé lors de l'acceptation de notre politique de
              confidentialité, ainsi que sur l'intérêt légitime du cabinet à
              traiter votre demande et, le cas échéant, sur l'exécution d'un
              contrat.
            </p>
          </Article>

          <Article title="5. Destinataires des données">
            <p>
              Vos données sont destinées aux collaborateurs de {SITE.name} et,
              le cas échéant, à nos partenaires assureurs ou réassureurs
              intervenant dans le cadre de votre demande. Elles ne sont jamais
              cédées à des tiers à des fins commerciales.
            </p>
          </Article>

          <Article title="6. Durée de conservation">
            <p>
              Vos données sont conservées pendant la durée nécessaire à la
              gestion de votre demande, puis archivées à des fins probatoires et
              réglementaires pendant une durée conforme aux obligations légales
              applicables au cabinet de courtage en assurances.
            </p>
          </Article>

          <Article title="7. Vos droits">
            <p>
              Conformément au RGPD, vous disposez des droits suivants :
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-ink-soft">
              <li>Droit d'accès</li>
              <li>Droit de rectification</li>
              <li>Droit à l'effacement</li>
              <li>Droit à la limitation du traitement</li>
              <li>Droit d'opposition</li>
              <li>Droit à la portabilité de vos données</li>
            </ul>
            <p className="mt-4">
              Pour exercer ces droits, contactez-nous à l'adresse{" "}
              <a
                href={`mailto:${SITE.email}`}
                className="underline hover:text-ink"
              >
                {SITE.email}
              </a>
              . Vous disposez également du droit d'introduire une réclamation
              auprès de la CNIL.
            </p>
          </Article>

          <Article title="8. Sécurité">
            <p>
              Nous mettons en œuvre des mesures techniques et organisationnelles
              appropriées pour protéger vos données contre tout accès non
              autorisé, perte, altération ou divulgation.
            </p>
          </Article>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Article({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article>
      <h2 className="font-serif text-2xl font-medium">{title}</h2>
      <div className="mt-4 space-y-3 text-ink-soft leading-relaxed">
        {children}
      </div>
    </article>
  );
}
