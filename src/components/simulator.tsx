import { useMemo, useState } from "react";
import { SITE } from "@/lib/site";
import {
  getRatesForAge,
  coutTotalGroupe,
  coutTotalCourtier,
  SURPRIME_FUMEUR,
} from "@/lib/insurance-rates";

type Step = "inputs" | "results" | "sent";

const CONTACT_EMAIL = "contact@ej-assurances.fr";

function formatEuro(v: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(v)));
}

export function Simulator() {
  const [step, setStep] = useState<Step>("inputs");

  // Inputs
  const [capital, setCapital] = useState<number>(200000);
  const [duree, setDuree] = useState<number>(20);
  const [age, setAge] = useState<number>(38);
  const [smoker, setSmoker] = useState<boolean>(false);

  // Contact
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [message, setMessage] = useState("");
  const [acceptContact, setAcceptContact] = useState(false);
  const [acceptRgpd, setAcceptRgpd] = useState(false);

  const results = useMemo(() => {
    const { taux_groupe, taux_courtier } = getRatesForAge(age);
    const surprime = smoker ? SURPRIME_FUMEUR : 0;
    const tauxGroupe = taux_groupe + surprime;
    const tauxCourtier = taux_courtier + surprime;

    const totalGroupe = coutTotalGroupe(capital, duree, tauxGroupe);
    const totalCourtier = coutTotalCourtier(capital, duree, tauxCourtier);

    const mensGroupe = totalGroupe / (duree * 12);
    const mensCourtier = totalCourtier / (duree * 12);

    const totalSaving = Math.max(0, totalGroupe - totalCourtier);
    const monthlySaving = Math.max(0, mensGroupe - mensCourtier);

    return {
      tauxGroupe,
      tauxCourtier,
      totalGroupe,
      totalCourtier,
      mensGroupe,
      mensCourtier,
      totalSaving,
      monthlySaving,
    };
  }, [capital, duree, age, smoker]);

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    setStep("results");
  }

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSendMail(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptContact || !acceptRgpd) {
      alert("Veuillez accepter les conditions de recontact et la politique RGPD pour envoyer votre demande.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "simulateur",
          prenom,
          nom,
          email,
          telephone,
          message: message || null,
          simulation: {
            capital,
            duree_ans: duree,
            age,
            fumeur: smoker,
            economie_totale: results.totalSaving,
            economie_mensuelle: results.monthlySaving,
          },
          consent_contact: acceptContact,
          consent_rgpd: acceptRgpd,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      setStep("sent");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface-elevated p-5 shadow-sm ring-1 ring-black/5 md:p-7">
      <div className="mb-5 flex items-center gap-2">
        <span className="size-2 rounded-full bg-ink" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink">
          Simulateur — assurance emprunteur
        </h2>
      </div>

      {step === "inputs" && (
        <form onSubmit={handleCalculate} className="space-y-5">
          <p className="text-sm text-ink-soft">
            Estimez en 30 secondes vos économies grâce à la loi Lemoine. Aucune
            coordonnée requise pour obtenir votre résultat.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Capital emprunté"
              suffix="€"
              type="number"
              value={capital}
              min={10000}
              step={1000}
              onChange={setCapital}
            />
            <Field
              label="Durée du prêt"
              suffix="ans"
              type="number"
              value={duree}
              min={1}
              max={30}
              step={1}
              onChange={setDuree}
            />
            <Field
              label="Votre âge"
              suffix="ans"
              type="number"
              value={age}
              min={20}
              max={70}
              step={1}
              onChange={setAge}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={smoker}
              onChange={(e) => setSmoker(e.target.checked)}
              className="size-4 rounded border-line accent-ink"
            />
            Je suis fumeur / vapoteur (12 derniers mois)
          </label>

          <button
            type="submit"
            className="w-full rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-ink/90"
          >
            Calculer mes économies
          </button>
          <p className="text-[11px] italic text-ink-muted">
            Simulation indicative fondée sur les taux moyens du marché. Contrat
            groupe calculé sur capital initial ; contrat délégué calculé sur
            capital restant dû. Devis personnalisé après étude de votre profil.
          </p>
        </form>
      )}

      {step === "results" && (
        <div className="space-y-6">
          <div className="rounded-xl bg-ink p-6 text-white">
            <p className="text-xs uppercase tracking-widest text-white/60">
              Économie estimée sur la durée du prêt
            </p>
            <p className="mt-2 font-serif text-4xl md:text-5xl">
              {formatEuro(results.totalSaving)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-white/60">Économie mensuelle</p>
                <p className="font-medium">
                  {formatEuro(results.monthlySaving)}
                </p>
              </div>
              <div>
                <p className="text-white/60">Durée</p>
                <p className="font-medium">{duree} ans</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-surface p-4 text-xs text-ink-soft ring-1 ring-line">
            <p>
              <strong className="text-ink">Tarif provisoire.</strong> Cette
              estimation est fondée sur les taux moyens du marché et sur les
              informations que vous avez saisies. Le tarif définitif dépend de
              votre profil (santé, profession, sports pratiqués, etc.) et des
              garanties retenues. Une <strong>étude complémentaire</strong>{" "}
              peut vous être demandée par {SITE.shortName} afin d'établir une
              proposition personnalisée et contractuelle.
            </p>
          </div>


          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-5 ring-1 ring-line">
              <p className="text-xs uppercase tracking-widest text-ink-muted">
                Contrat groupe (banque)
              </p>
              <p className="mt-2 font-serif text-2xl text-ink">
                {formatEuro(results.mensGroupe)}
                <span className="text-sm text-ink-muted"> / mois</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Taux {results.tauxGroupe.toFixed(2)}% sur capital initial
              </p>
              <p className="mt-3 text-sm text-ink-soft">
                Coût total : <strong>{formatEuro(results.totalGroupe)}</strong>
              </p>
            </div>
            <div className="rounded-xl bg-white p-5 ring-1 ring-line">
              <p className="text-xs uppercase tracking-widest text-ink-muted">
                Contrat délégué (courtier)
              </p>
              <p className="mt-2 font-serif text-2xl text-ink">
                {formatEuro(results.mensCourtier)}
                <span className="text-sm text-ink-muted"> / mois</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Taux {results.tauxCourtier.toFixed(2)}% sur capital restant dû
              </p>
              <p className="mt-3 text-sm text-ink-soft">
                Coût total :{" "}
                <strong>{formatEuro(results.totalCourtier)}</strong>
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-white p-5 ring-1 ring-line">
            <h3 className="font-serif text-xl text-ink">
              Recevez votre étude personnalisée
            </h3>
            <p className="mt-1 text-sm text-ink-soft">
              Un conseiller {SITE.shortName} vous rappelle sous 24 h ouvrées
              pour affiner ce chiffrage et sélectionner les meilleures
              garanties.
            </p>
            <form onSubmit={handleSendMail} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  label="Prénom"
                  value={prenom}
                  onChange={setPrenom}
                  required
                />
                <TextField
                  label="Nom"
                  value={nom}
                  onChange={setNom}
                  required
                />
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  required
                />
                <TextField
                  label="Téléphone"
                  type="tel"
                  value={telephone}
                  onChange={setTelephone}
                  required
                />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-soft">
                  Message (facultatif)
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
                />
              </label>

              <div className="space-y-2 rounded-xl bg-surface p-4 text-sm text-ink-soft ring-1 ring-line">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    required
                    checked={acceptContact}
                    onChange={(e) => setAcceptContact(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-line accent-ink"
                  />
                  <span>
                    J'accepte d'être recontacté(e) par le cabinet{" "}
                    {SITE.shortName} ou l'un de ses partenaires pour affiner mon
                    étude. <span className="text-ink">*</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    required
                    checked={acceptRgpd}
                    onChange={(e) => setAcceptRgpd(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-line accent-ink"
                  />
                  <span>
                    J'ai pris connaissance de la{" "}
                    <a
                      href="/politique-de-confidentialite"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-ink"
                    >
                      politique de confidentialité
                    </a>{" "}
                    et j'accepte le traitement de mes données personnelles dans
                    le cadre de ma demande. <span className="text-ink">*</span>
                  </span>
                </label>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setStep("inputs")}
                  className="rounded-xl px-4 py-3 text-sm font-medium text-ink ring-1 ring-line hover:bg-white"
                >
                  ← Modifier
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-ink/90"
                >
                  Envoyer ma demande
                </button>
              </div>
              <p className="text-[11px] italic text-ink-muted">
                Vos coordonnées sont transmises uniquement à {SITE.shortName} et
                ses partenaires dans le cadre de votre demande — jamais cédées
                à des tiers à des fins commerciales.
              </p>
            </form>
          </div>
        </div>
      )}

      {step === "sent" && (
        <div className="space-y-4 py-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-ink text-white">
            ✓
          </div>
          <h3 className="font-serif text-2xl text-ink">Demande transmise</h3>
          <p className="mx-auto max-w-md text-sm text-ink-soft">
            Votre message a été préparé à destination de{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
              {CONTACT_EMAIL}
            </a>
            . Un conseiller {SITE.shortName} vous recontacte sous 24 h ouvrées.
          </p>
          <button
            type="button"
            onClick={() => setStep("inputs")}
            className="rounded-xl px-4 py-2 text-sm font-medium text-ink ring-1 ring-line hover:bg-white"
          >
            Nouvelle simulation
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  suffix,
  value,
  onChange,
  ...rest
}: {
  label: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft">
        {label}
      </span>
      <div className="flex items-center rounded-lg border border-line bg-white focus-within:border-ink">
        <input
          {...rest}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-3 py-2 text-sm text-ink outline-none"
        />
        {suffix && (
          <span className="pr-3 text-xs text-ink-muted">{suffix}</span>
        )}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft">
        {label}
        {required && " *"}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
      />
    </label>
  );
}
