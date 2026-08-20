import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { inscrirePrescripteur } from "@/lib/prescripteurs.functions";

export const Route = createFileRoute("/devenir-prescripteur")({
  head: () => ({
    meta: [
      { title: "Devenir apporteur d'affaires — EJ Partners Assurances" },
      {
        name: "description",
        content:
          "Agents immobiliers et partenaires : recommandez vos clients à EJ Partners Assurances et percevez 200 € par dossier validé. Inscription en ligne et convention d'apport d'affaires.",
      },
      { property: "og:title", content: "Devenir apporteur d'affaires — EJ Partners Assurances" },
      {
        property: "og:description",
        content:
          "Convention d'apport d'affaires : simple mise en relation, 200 € par dossier validé. Inscrivez-vous en ligne.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DevenirPrescripteur,
});

const CONVENTION = [
  "Mon rôle se limite strictement à la mise en relation d'un contact avec le cabinet EJ Partners Assurances.",
  "Je ne délivre aucun conseil en assurance, je ne présente ni ne compare aucun produit d'assurance, et je ne participe à aucune négociation de garanties ou de tarifs.",
  "Toute analyse du besoin, présentation de solution, remise de documentation et souscription relève exclusivement du cabinet, seul intermédiaire immatriculé à l'ORIAS.",
  "Cette limite est essentielle : elle évite que mon activité soit qualifiée d'intermédiation en assurance, laquelle nécessiterait ma propre immatriculation ORIAS.",
  "Je recueille l'accord du contact avant de transmettre ses coordonnées au cabinet.",
  "En contrepartie de la mise en relation, une rémunération de 200 € est due par dossier validé par le cabinet, versée après validation.",
];

function DevenirPrescripteur() {
  const envoyer = useServerFn(inscrirePrescripteur);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await envoyer({
        data: {
          nom: String(fd.get("nom") ?? ""),
          prenom: String(fd.get("prenom") ?? ""),
          email: String(fd.get("email") ?? ""),
          telephone: String(fd.get("telephone") ?? ""),
          zone_activite: String(fd.get("zone_activite") ?? ""),
          type: (String(fd.get("type") ?? "agent_immo") as "agent_immo" | "autre"),
          convention: true,
        },
      });
      if (res.ok) setDone(true);
      else setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    }
    setBusy(false);
  };

  const champ = "mt-1 w-full rounded-sm border border-line bg-surface-elevated px-3 py-2 text-sm text-ink";

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-serif text-3xl font-medium text-ink">Devenir apporteur d'affaires</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Vous accompagnez des clients dans un projet immobilier ou patrimonial ? Recommandez-les à EJ Partners
        Assurances : <strong>200 € vous sont dus par dossier validé</strong>. Votre rôle se limite à la mise en
        relation.
      </p>

      <section className="mt-8 rounded-sm border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">
          Convention d'apport d'affaires
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
          {CONVENTION.map((l) => (
            <li key={l} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </section>

      {done ? (
        <div className="mt-8 rounded-sm border border-line bg-surface-elevated p-6 text-sm text-ink-soft">
          <p className="font-medium text-ink">Inscription enregistrée.</p>
          <p className="mt-2">
            Votre demande est en cours de validation par le cabinet. Vous recevrez un e-mail avec vos accès à
            l'espace prescripteur dès qu'elle sera validée.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
              Nom *
              <input name="nom" required maxLength={100} className={champ} />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
              Prénom
              <input name="prenom" maxLength={100} className={champ} />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
              E-mail *
              <input name="email" type="email" required maxLength={255} className={champ} />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
              Téléphone
              <input name="telephone" maxLength={30} className={champ} />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
              Zone d'activité
              <input name="zone_activite" maxLength={200} placeholder="Ex. Val-d'Oise, Eaubonne" className={champ} />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wider text-ink-muted">
              Type
              <select name="type" className={champ} defaultValue="agent_immo">
                <option value="agent_immo">Agent immobilier</option>
                <option value="autre">Autre</option>
              </select>
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-sm border border-line bg-surface-elevated p-4 text-sm text-ink-soft">
            <input type="checkbox" required className="mt-1" />
            <span>
              J'accepte la convention d'apport d'affaires ci-dessus : mon rôle se limite à la mise en relation, sans
              conseil, sans présentation de produit ni négociation. Rémunération de 200 € par dossier validé.
            </span>
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="rounded-full border border-line bg-surface-elevated px-6 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            {busy ? "Envoi…" : "Envoyer mon inscription"}
          </button>
        </form>
      )}
    </main>
  );
}
