import { useMemo, useState } from "react";
import { SITE } from "@/lib/site";

type Step = "inputs" | "results" | "sent";

const CONTACT_EMAIL = "contact@ej-assurances.fr";

// Estimation du taux annuel d'une assurance déléguée (loi Lemoine)
// exprimé en % du capital initial, selon profil.
function estimateDelegatedRate(age: number, smoker: boolean): number {
  let rate: number;
  if (age < 30) rate = 0.07;
  else if (age < 35) rate = 0.09;
  else if (age < 40) rate = 0.11;
  else if (age < 45) rate = 0.14;
  else if (age < 50) rate = 0.18;
  else if (age < 55) rate = 0.24;
  else if (age < 60) rate = 0.32;
  else rate = 0.42;
  if (smoker) rate *= 1.65;
  return rate; // en pourcentage
}

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
  const [cotisationActuelle, setCotisationActuelle] = useState<number>(75);
  const [age, setAge] = useState<number>(38);
  const [smoker, setSmoker] = useState<boolean>(false);

  // Contact
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const [message, setMessage] = useState("");

  const results = useMemo(() => {
    const rate = estimateDelegatedRate(age, smoker);
    const newMonthly = (capital * (rate / 100)) / 12;
    const monthlySaving = Math.max(0, cotisationActuelle - newMonthly);
    const totalSaving = monthlySaving * 12 * duree;
    return {
      rate,
      newMonthly,
      monthlySaving,
      totalSaving,
    };
  }, [capital, duree, cotisationActuelle, age, smoker]);

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    setStep("results");
  }

  function handleSendMail(e: React.FormEvent) {
    e.preventDefault();
    const subject = `Demande d'étude assurance emprunteur — ${prenom} ${nom}`;
    const body = [
      `Bonjour,`,
      ``,
      `Je souhaite recevoir une étude personnalisée suite à ma simulation :`,
      ``,
      `— Capital restant dû : ${formatEuro(capital)}`,
      `— Durée restante : ${duree} ans`,
      `— Cotisation actuelle : ${formatEuro(cotisationActuelle)} / mois`,
      `— Âge : ${age} ans`,
      `— Fumeur : ${smoker ? "Oui" : "Non"}`,
      ``,
      `Estimation calculée :`,
      `— Nouvelle cotisation estimée : ${formatEuro(results.newMonthly)} / mois`,
      `— Économie mensuelle : ${formatEuro(results.monthlySaving)}`,
      `— Économie totale estimée : ${formatEuro(results.totalSaving)}`,
      ``,
      `Mes coordonnées :`,
      `— Nom : ${prenom} ${nom}`,
      `— Email : ${email}`,
      `— Téléphone : ${telephone}`,
      ``,
      message ? `Message :\n${message}` : ``,
      ``,
      `Cordialement,`,
      `${prenom} ${nom}`,
    ].join("\n");

    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setStep("sent");
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
              label="Capital restant dû"
              suffix="€"
              type="number"
              value={capital}
              min={10000}
              step={1000}
              onChange={setCapital}
            />
            <Field
              label="Durée restante"
              suffix="ans"
              type="number"
              value={duree}
              min={1}
              max={30}
              step={1}
              onChange={setDuree}
            />
            <Field
              label="Cotisation actuelle"
              suffix="€/mois"
              type="number"
              value={cotisationActuelle}
              min={0}
              step={1}
              onChange={setCotisationActuelle}
            />
            <Field
              label="Votre âge"
              suffix="ans"
              type="number"
              value={age}
              min={18}
              max={75}
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
            Simulation indicative fondée sur les taux moyens du marché
            (contrats délégués). Devis personnalisé après étude de votre profil.
          </p>
        </form>
      )}

      {step === "results" && (
        <div className="space-y-6">
          <div className="rounded-xl bg-ink p-6 text-white">
            <p className="text-xs uppercase tracking-widest text-white/60">
              Économie estimée sur la durée restante
            </p>
            <p className="mt-2 font-serif text-4xl md:text-5xl">
              {formatEuro(results.totalSaving)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-white/60">Cotisation estimée</p>
                <p className="font-medium">
                  {formatEuro(results.newMonthly)} / mois
                </p>
              </div>
              <div>
                <p className="text-white/60">Économie mensuelle</p>
                <p className="font-medium">
                  {formatEuro(results.monthlySaving)}
                </p>
              </div>
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
                Vos coordonnées sont transmises uniquement à {SITE.shortName} —
                jamais cédées à des tiers.
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
