import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { NeolianeParcoursConsole } from "@/components/neoliane-parcours-console";

import {
  neolianeSigner,
  neolianeSouscrire,
  neolianeStatut,
  neolianeTarifer,
  neolianeTestConnexion,
} from "@/lib/neoliane.functions";

export const Route = createFileRoute("/_authenticated/espace/neoliane")({
  component: NeolianePage,
  head: () => ({
    meta: [
      { title: "Néoliane — Tarification & souscription | EJ Partners" },
      {
        name: "description",
        content:
          "Module d'intégration API Néoliane : tarification santé/prévoyance, souscription, signature électronique et test de connexion.",
      },
      { property: "og:title", content: "Néoliane — Tarification & souscription" },
      {
        property: "og:description",
        content: "Intégration API Néoliane du CRM EJ Partners Assurances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Statut = {
  configured: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasUserApiKey: boolean;
  missing: string[];
  message: string;
  endpoints: Record<string, string>;
};

const EXEMPLE_TARIF = `{
  "date_effet": "2026-09-01",
  "code_postal": "95600",
  "assures": [
    { "role": "principal", "date_naissance": "1985-04-12", "regime": "TNS" }
  ]
}`;

const EXEMPLE_SOUSCRIPTION = `{
  "devis_id": "REMPLACER_PAR_ID_DEVIS",
  "formule": "REMPLACER_PAR_CODE_FORMULE"
}`;

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-elevated p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function JsonBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      rows={10}
      className="w-full rounded-md border border-line bg-background p-3 font-mono text-xs text-ink"
    />
  );
}

function NeolianePage() {
  const [statut, setStatut] = useState<Statut | null>(null);
  const [test, setTest] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const [tarifPath, setTarifPath] = useState("");
  const [tarifPayload, setTarifPayload] = useState(EXEMPLE_TARIF);
  const [tarifRes, setTarifRes] = useState("");

  const [souscriptionPath, setSouscriptionPath] = useState("");
  const [souscriptionPayload, setSouscriptionPayload] = useState(EXEMPLE_SOUSCRIPTION);
  const [souscriptionRes, setSouscriptionRes] = useState("");

  const getStatut = useServerFn(neolianeStatut);
  const runTest = useServerFn(neolianeTestConnexion);
  const runTarif = useServerFn(neolianeTarifer);
  const runSouscrire = useServerFn(neolianeSouscrire);
  const runSigner = useServerFn(neolianeSigner);

  useEffect(() => {
    getStatut()
      .then((s) => setStatut(s as Statut))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erreur"));
  }, [getStatut]);

  const parsePayload = (raw: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(raw);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("objet JSON attendu");
      return v as Record<string, unknown>;
    } catch (e) {
      toast.error(`JSON invalide : ${e instanceof Error ? e.message : ""}`);
      return null;
    }
  };

  const appel = async (
    key: string,
    fn: (args: { data: { path?: string; payload: Record<string, unknown> } }) => Promise<unknown>,
    path: string,
    raw: string,
    setRes: (v: string) => void,
  ) => {
    const payload = parsePayload(raw);
    if (!payload) return;
    setBusy(key);
    try {
      const res = await fn({ data: { ...(path ? { path } : {}), payload } });
      setRes(JSON.stringify(res, null, 2));
    } catch (e) {
      setRes(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Néoliane — API partenaire</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Tous les appels partent du serveur : les identifiants ne transitent jamais par le navigateur.
        </p>
      </header>

      <Card title="Configuration des identifiants">
        {statut ? (
          <div className="space-y-3">
            <div
              className={
                "rounded-md border p-3 text-sm " +
                (statut.configured && statut.missing.length === 0
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : statut.configured
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-red-300 bg-red-50 text-red-900")
              }
            >
              {statut.message}
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {[
                ["NEOLIANE_CLIENT_ID", statut.hasClientId],
                ["NEOLIANE_CLIENT_SECRET", statut.hasClientSecret],
                ["NEOLIANE_USER_API_KEY", statut.hasUserApiKey],
              ].map(([name, ok]) => (
                <li key={String(name)} className="rounded-md border border-line bg-background p-3 text-xs">
                  <div className="font-mono text-ink">{String(name)}</div>
                  <div className={ok ? "mt-1 text-emerald-600" : "mt-1 text-red-600"}>
                    {ok ? "renseigné" : "à configurer"}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-muted">
              À renseigner dans Paramètres du projet → Secrets. Le <span className="font-mono">userApiKey</span> se
              génère depuis l'extranet Néoliane : Mon Compte &gt; Accès externes.
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Chargement…</p>
        )}
      </Card>

      <Card title="Diagnostic / test de connexion">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
          {[
            ["NEOLIANE_CLIENT_ID", statut?.hasClientId],
            ["NEOLIANE_CLIENT_SECRET", statut?.hasClientSecret],
            ["NEOLIANE_USER_API_KEY", statut?.hasUserApiKey],
          ].map(([name, ok]) => (
            <span
              key={String(name)}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 " +
                (ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700")
              }
            >
              <span
                className={
                  "inline-block h-1.5 w-1.5 rounded-full " + (ok ? "bg-emerald-500" : "bg-red-500")
                }
              />
              <span className="font-mono">{String(name)}</span>
              <span>{ok ? "détecté" : "absent"}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["oauth2", "basic"] as const).map((mode) => (
            <button
              key={mode}
              disabled={busy !== null}
              onClick={async () => {
                setBusy(`test-${mode}`);
                try {
                  const res = await runTest({ data: { mode } });
                  setTest(JSON.stringify(res, null, 2));
                } catch (e) {
                  setTest(String(e instanceof Error ? e.message : e));
                } finally {
                  setBusy(null);
                }
              }}
              className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface disabled:opacity-50"
            >
              {busy === `test-${mode}` ? "Test…" : mode === "oauth2" ? "Tester OAuth2" : "Tester Basic Auth"}
            </button>
          ))}
        </div>
        {test && (
          <pre className="mt-3 overflow-auto rounded-md border border-line bg-background p-3 font-mono text-xs text-ink">
            {test}
          </pre>
        )}
        {statut?.endpoints && (
          <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
            {(["tarification", "souscription", "signature"] as const).map((k) => (
              <div key={k} className="rounded-md border border-line bg-background p-3">
                <dt className="uppercase tracking-wide text-ink-muted">{k}</dt>
                <dd className="mt-1 break-all font-mono text-ink">{statut.endpoints[k]}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card title="Parcours EZ API complet (profil → panier → offre → signature)">
        <NeolianeParcoursConsole
          callbackUrl={`${typeof window === "undefined" ? "" : window.location.origin}/api/public/webhooks/neoliane`}
        />
      </Card>

      <Card title="Appel direct (diagnostic avancé)">
        <p className="mb-3 text-xs text-ink-muted">
          Appel libre pour diagnostic : chemin et payload à la main. Le
          <span className="font-mono"> userApiKey</span> est ajouté automatiquement au payload côté serveur.
        </p>

        <input
          value={tarifPath}
          onChange={(e) => setTarifPath(e.target.value)}
          placeholder={statut?.endpoints?.["tarification"] ?? "/neoverse/public/ez/tarification"}
          className="mb-2 w-full rounded-md border border-line bg-background px-3 py-2 font-mono text-xs"
        />
        <JsonBox value={tarifPayload} onChange={setTarifPayload} />
        <button
          disabled={busy !== null}
          onClick={() => appel("tarif", runTarif as never, tarifPath, tarifPayload, setTarifRes)}
          className="mt-3 rounded-full bg-ink px-5 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {busy === "tarif" ? "Appel…" : "Obtenir le devis"}
        </button>
        {tarifRes && (
          <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-line bg-background p-3 font-mono text-xs">
            {tarifRes}
          </pre>
        )}
      </Card>

      <Card title="Souscription & signature électronique (EZ API)">
        <input
          value={souscriptionPath}
          onChange={(e) => setSouscriptionPath(e.target.value)}
          placeholder={statut?.endpoints?.["souscription"] ?? "/neoverse/public/ez/souscription"}
          className="mb-2 w-full rounded-md border border-line bg-background px-3 py-2 font-mono text-xs"
        />
        <JsonBox value={souscriptionPayload} onChange={setSouscriptionPayload} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={busy !== null}
            onClick={() =>
              appel("souscrire", runSouscrire as never, souscriptionPath, souscriptionPayload, setSouscriptionRes)
            }
            className="rounded-full bg-ink px-5 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {busy === "souscrire" ? "Appel…" : "Lancer la souscription"}
          </button>
          <button
            disabled={busy !== null}
            onClick={() => appel("signer", runSigner as never, "", souscriptionPayload, setSouscriptionRes)}
            className="rounded-full border border-line px-5 py-2 text-sm hover:bg-surface disabled:opacity-50"
          >
            {busy === "signer" ? "Appel…" : "Envoyer en signature électronique"}
          </button>
        </div>
        {souscriptionRes && (
          <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-line bg-background p-3 font-mono text-xs">
            {souscriptionRes}
          </pre>
        )}
      </Card>
    </div>
  );
}
