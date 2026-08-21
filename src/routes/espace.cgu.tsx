import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { IconFileText } from "@tabler/icons-react";

export const Route = createFileRoute("/espace/cgu")({
  head: () => ({
    meta: [
      { title: "Conditions générales d'utilisation — EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Conditions générales d'utilisation de l'espace client EJ Partners Assurances : accès, signature électronique, disponibilité et propriété des documents.",
      },
      { property: "og:title", content: "Conditions générales d'utilisation — EJ Partners Assurances" },
      {
        property: "og:description",
        content:
          "Règles d'accès et d'utilisation de l'espace client en ligne du cabinet EJ Partners Assurances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Cgu,
});

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-xl font-medium text-ink">{titre}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function Cgu() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <PageHeader
        eyebrow="Espace client"
        title="Conditions générales d'utilisation"
        description="Règles d'accès et d'utilisation de votre espace client sécurisé."
        icon={IconFileText}
      />

      <Bloc titre="Objet">
        <p>
          Les présentes CGU régissent l'accès et l'utilisation de l'espace client en ligne mis à disposition par EJ
          Partners Assurances, permettant de consulter son dossier, signer des documents et déposer des pièces
          justificatives.
        </p>
      </Bloc>

      <Bloc titre="Accès et compte">
        <p>
          L'accès à l'espace client est réservé aux clients du cabinet. Les identifiants de connexion sont
          strictement personnels et confidentiels. Le client s'engage à ne pas les communiquer à un tiers et à
          informer le cabinet en cas de suspicion d'utilisation frauduleuse de son compte.
        </p>
      </Bloc>

      <Bloc titre="Signature électronique">
        <p>
          Les documents signés depuis l'espace client (lettre de mission, devoir de conseil, document d'entrée en
          relation) le sont au moyen d'une signature électronique simple au sens du règlement eIDAS. Cette signature
          a la même valeur probante qu'une signature manuscrite entre les parties.
        </p>
      </Bloc>

      <Bloc titre="Disponibilité du service">
        <p>
          Le cabinet met tout en œuvre pour assurer l'accès à la plateforme mais ne garantit pas une disponibilité
          continue. Le cabinet ne saurait être tenu responsable des interruptions liées à la maintenance ou à des
          causes extérieures à sa volonté.
        </p>
      </Bloc>

      <Bloc titre="Propriété des documents">
        <p>
          Les documents déposés par le client restent sa propriété. Les documents générés par le cabinet (lettre de
          mission, devoir de conseil, DER) sont mis à disposition du client à titre d'information et de preuve, sans
          transfert de droits de propriété intellectuelle.
        </p>
      </Bloc>

      <Bloc titre="Modification des CGU">
        <p>
          Le cabinet se réserve le droit de modifier les présentes CGU. Le client sera informé de toute modification
          substantielle et sera invité à en accepter les nouvelles conditions lors de sa prochaine connexion.
        </p>
      </Bloc>
    </main>
  );
}
