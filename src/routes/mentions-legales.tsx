import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE } from "@/lib/site";

const TITLE = "Mentions légales";
const DESC = `Mentions légales de ${SITE.name} : éditeur, responsable de publication, immatriculation ORIAS, assurance RCPro et hébergement.`;

export const Route = createFileRoute("/mentions-legales")({
  head: () => ({
    meta: [
      { title: `${TITLE} — ${SITE.name}` },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: "/mentions-legales" },
    ],
    links: [{ rel: "canonical", href: "/mentions-legales" }],
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
            Informations réglementaires
          </p>
          <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.05] md:text-5xl">
            Mentions légales
          </h1>
          <p className="mt-6 text-lg text-ink-soft">
            Conformément aux dispositions des articles 6-III et 19 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), nous vous informons des mentions légales suivantes.
          </p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container-page max-w-3xl space-y-12">
          <Article title="1. Éditeur du site">
            <p>
              Le site {SITE.name} est édité par <strong>JAFFRELOT ERWAN E.I.</strong>,
              entrepreneur individuel, exerçant sous le nom commercial {SITE.name},
              société de courtage en assurances.
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-ink-soft">
              <li>Adresse du siège social : {SITE.address}</li>
              <li>Email : <a href={`mailto:${SITE.email}`} className="underline hover:text-ink">{SITE.email}</a></li>
              <li>Téléphone : {SITE.phone}</li>
              <li>SIRET : {SITE.siret}</li>
              <li>Numéro ORIAS : {SITE.orias}</li>
            </ul>
            <p className="mt-4">
              {SITE.name} est immatriculée au Registre du Commerce et des Sociétés de
              Versailles sous le numéro SIRET {SITE.siret} et à l'ORIAS sous le
              numéro 25005811 en qualité <strong>d'intermédiaire en assurance</strong>.
            </p>
          </Article>

          <Article title="2. Directeur de la publication">
            <p>
              Le directeur de la publication est <strong>Erwan Jaffrelot</strong>,
              en sa qualité de gérant de l'entreprise individuelle {SITE.name}.
            </p>
          </Article>

          <Article title="3. Activité réglementée et contrôle">
            <p>
              {SITE.name} exerce une activité d'intermédiation en assurance régie par
              le Code des assurances. En tant qu'intermédiaire d'assurance, le cabinet
              est soumis au contrôle de l'Autorité de contrôle prudentiel et de
              résolution (ACPR) — 4 Place de Budapest, 75009 Paris —
              <a href="https://www.acpr.banque-france.fr" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink"> www.acpr.banque-france.fr</a>.
            </p>
            <p className="mt-4">
              L'inscription à l'ORIAS peut être vérifiée sur le site officiel :
              <a href="https://www.orias.fr" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink"> www.orias.fr</a>.
            </p>
          </Article>

          <Article title="4. Assurance responsabilité civile professionnelle (RCPro)">
            <p>
              Conformément aux articles L. 512-6, R. 512-14 et A. 512-4 du Code des
              assurances, ainsi qu'aux articles L. 519-3-4, R. 519-16, L. 541-3 et
              D. 541-9 du Code monétaire et financier, {SITE.name} a souscrit un
              contrat d'assurance responsabilité civile professionnelle couvrant ses
              activités sur le territoire de la Communauté européenne et de l'Espace
              économique européen.
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-ink-soft">
              <li><strong>Assureur :</strong> Lloyd's Insurance Company SA</li>
              <li><strong>Contrat n° :</strong> BZIA0001756</li>
              <li><strong>Gestionnaire / intermédiaire :</strong> +Simple, 2 rue Grignan, 13001 Marseille, immatriculée au RCS de Marseille sous le n° 810 992 792, ORIAS n° 15002981</li>
              <li><strong>Période de garantie :</strong> du 01/03/2026 au 28/02/2027</li>
              <li><strong>Activité couverte :</strong> Intermédiaire d'assurance — délégation de souscription, délégation de gestion et délégation de gestion de sinistres</li>
              <li><strong>Garantie par sinistre :</strong> 1 564 610 €</li>
              <li><strong>Garantie par année d'assurance :</strong> 2 315 610 €</li>
              <li><strong>Franchise :</strong> 10 % du montant du sinistre, plafonnée à 3 000 €</li>
            </ul>
            <p className="mt-4">
              Cette attestation est établie pour servir et valoir ce que de droit, sans
              pouvoir engager l'assureur au-delà des clauses et conditions du contrat
              auquel elle se réfère.
            </p>
          </Article>

          <Article title="5. Hébergeur du site">
            <p>
              Le site est hébergé par la plateforme Lovable, qui assure la mise à
              disposition et l'exploitation technique du service. Pour toute question
              relative à l'hébergement, vous pouvez contacter le cabinet à l'adresse
              <a href={`mailto:${SITE.email}`} className="underline hover:text-ink"> {SITE.email}</a>.
            </p>
          </Article>

          <Article title="6. Propriété intellectuelle">
            <p>
              L'ensemble des éléments constituant le site (textes, graphismes,
              logiciels, photographies, images, vidéos, sons, plans, logos,
              marques, architecture technique, code source, etc.) est la propriété
              exclusive de {SITE.name} ou de ses partenaires. Toute reproduction,
              représentation, modification, publication, adaptation ou exploitation,
              totale ou partielle, des éléments du site, par quelque procédé que ce
              soit, sans l'autorisation écrite préalable de {SITE.name}, est
              strictement interdite et constituerait une contrefaçon sanctionnée par
              les articles L. 335-2 et suivants du Code de la propriété intellectuelle.
            </p>
          </Article>

          <Article title="7. Limitation de responsabilité">
            <p>
              {SITE.name} s'efforce d'assurer l'exactitude et la mise à jour des
              informations diffusées sur le site. Toutefois, les informations et
              contenus sont fournis à titre indicatif et ne constituent pas un
              conseil personnalisé. {SITE.name} ne saurait être tenue responsable des
              erreurs, omissions ou résultats qui pourraient être obtenus par
              l'usage de ces informations. L'utilisateur est invité à prendre contact
              avec le cabinet pour obtenir un conseil adapté à sa situation.
            </p>
            <p className="mt-4">
              Les simulations présentées sur le site (notamment l'estimateur
              d'économies sur l'assurance emprunteur) sont réalisées à partir de
              taux moyens et de simplifications. Elles ne constituent pas une offre
              ferme ni un devis contractuel. Les économies réelles dépendent de la
              situation personnelle de l'emprunteur, des garanties choisies et des
              conditions propres à chaque assureur.
            </p>
          </Article>

          <Article title="8. Liens hypertextes">
            <p>
              Le site peut contenir des liens hypertextes vers d'autres sites.
              {SITE.name} n'exerce aucun contrôle sur ces sites et décline toute
              responsabilité quant à leur contenu, leur disponibilité ou leur
              politique de confidentialité.
            </p>
          </Article>

          <Article title="9. Données personnelles">
            <p>
              Pour plus d'informations sur la collecte et le traitement de vos données
              personnelles, veuillez consulter notre{" "}
              <a href="/politique-de-confidentialite" className="underline hover:text-ink">
                Politique de confidentialité
              </a>.
            </p>
          </Article>

          <Article title="10. Droit applicable et juridiction compétente">
            <p>
              Les présentes mentions légales sont régies par le droit français. En cas
              de litige, et après tentative de règlement amiable, les tribunaux
              compétents seront ceux du ressort du siège social de {SITE.name}.
            </p>
          </Article>

          <Article title="11. Date de mise à jour">
            <p>Les présentes mentions légales ont été mises à jour le 21 juillet 2026.</p>
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
      <div className="mt-4 space-y-3 leading-relaxed text-ink-soft">
        {children}
      </div>
    </article>
  );
}
