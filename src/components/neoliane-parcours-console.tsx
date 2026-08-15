import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  neolianeAbonnements,
  neolianeComposerPanier,
  neolianeDemarrerParcours,
  neolianeDeposerSignatures,
  neolianeDocumentsSignature,
  neolianeDonneesDynamiques,
  neolianeEnregistrerOffre,
  neolianeEvenements,
  neolianeFinaliserOffre,
  neolianeGenererTarifs,
  neolianeLirePanier,
  neolianeRadierContrats,
  neolianeRafraichir,
  neolianeSignerElectroniquement,
  neolianeValiderCle,
  neolianeValiderSouscription,
} from "@/lib/neoliane-parcours.functions";
import {
  ETAPE_LABELS,
  ETAPES_PARCOURS,
  PRODUCT_TYPE_LABELS,
  dateEffetParDefaut,
} from "@/lib/neoliane/referentiels";
import { SignaturePad } from "@/components/signature-pad";


/**
 * Console de pilotage du parcours EZ API (tarification → panier → offre →
 * signature) et de la gestion EZ Gestion. Chaque bouton déclenche une server
 * function : aucun appel Néoliane depuis le navigateur.
 */

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface-elevated p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">{titre}</h3>
      {children}
    </section>
  );
}

function Zone({
  label,
  value,
  onChange,
  rows = 6,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink-muted">{label}</span>
      <textarea
        value={value}
        rows={rows}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line bg-background p-3 font-mono text-xs text-ink"
      />
    </label>
  );
}

const btn =
  "rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface disabled:opacity-50";
const btnPrim = "rounded-full bg-ink px-5 py-2 text-sm text-primary-foreground disabled:opacity-50";

export function NeolianeParcoursConsole({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [sortie, setSortie] = useState("");
  const [parcoursId, setParcoursId] = useState("");
  const [etape, setEtape] = useState<string>("");

  const [productType, setProductType] = useState("sante");
  const [zip, setZip] = useState("");
  const [dateEffet, setDateEffet] = useState(dateEffetParDefaut());
  const [membres, setMembres] = useState(
    `[\n  { "familyMember": "holder", "birthYear": 1985, "socialSecurityScheme": "employee" }\n]`,
  );
  const [types, setTypes] = useState(`["sante"]`);
  const [produits, setProduits] = useState(`[\n  { "pricingId": "", "members": ["holder"] }\n]`);
  const [remplacer, setRemplacer] = useState(false);
  const [offre, setOffre] = useState(
    `{\n  "prospectType": "client",\n  "persons": [],\n  "bank": {},\n  "address": {}\n}`,
  );
  const [docsSignes, setDocsSignes] = useState(
    `[\n  { "contractId": "", "ba": "<BASE64>", "sepa": "<BASE64>" }\n]`,
  );
  const [refType, setRefType] = useState<"contract" | "demarche">("contract");
  const [refId, setRefId] = useState("");
  const [radiationIds, setRadiationIds] = useState("");
  const [radiationMotif, setRadiationMotif] = useState("");

  const [signataire, setSignataire] = useState("");
  const [paraphes, setParaphes] = useState<Record<string, string>>({});

  const demarrer = useServerFn(neolianeDemarrerParcours);
  const signerElectronique = useServerFn(neolianeSignerElectroniquement);

  const tarifs = useServerFn(neolianeGenererTarifs);
  const panier = useServerFn(neolianeComposerPanier);
  const lirePanier = useServerFn(neolianeLirePanier);
  const dynamiques = useServerFn(neolianeDonneesDynamiques);
  const enrOffre = useServerFn(neolianeEnregistrerOffre);
  const finaliser = useServerFn(neolianeFinaliserOffre);
  const documents = useServerFn(neolianeDocumentsSignature);
  const deposer = useServerFn(neolianeDeposerSignatures);
  const valider = useServerFn(neolianeValiderSouscription);
  const validerCle = useServerFn(neolianeValiderCle);
  const abonnements = useServerFn(neolianeAbonnements);
  const rafraichir = useServerFn(neolianeRafraichir);
  const evenements = useServerFn(neolianeEvenements);
  const radier = useServerFn(neolianeRadierContrats);

  const json = (raw: string): unknown | null => {
    try {
      return JSON.parse(raw);
    } catch (e) {
      toast.error(`JSON invalide : ${e instanceof Error ? e.message : ""}`);
      return null;
    }
  };

  const lancer = async (cle: string, fn: () => Promise<unknown>) => {
    setBusy(cle);
    try {
      const res = await fn();
      setSortie(JSON.stringify(res, null, 2));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSortie(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const exigeParcours = () => {
    if (!parcoursId) {
      toast.error("Démarrez d'abord un parcours (étape Profil).");
      return false;
    }
    return true;
  };

  return (
    <div className="space-y-5">
      <Bloc titre="Parcours en cours">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {ETAPES_PARCOURS.map((e, i) => {
            const rang = ETAPES_PARCOURS.indexOf(etape as (typeof ETAPES_PARCOURS)[number]);
            const atteinte = rang >= i && rang >= 0;
            return (
              <span
                key={e}
                className={
                  "rounded-full border px-2.5 py-1 " +
                  (atteinte
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-line bg-background text-ink-muted")
                }
              >
                {i + 1}. {ETAPE_LABELS[e]}
              </span>
            );
          })}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">
              Identifiant de parcours interne
            </span>
            <input
              value={parcoursId}
              onChange={(e) => setParcoursId(e.target.value)}
              placeholder="créé automatiquement à l'étape Profil"
              className="w-full rounded-md border border-line bg-background px-3 py-2 font-mono text-xs"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              disabled={busy !== null}
              className={btn}
              onClick={() => lancer("cle", () => validerCle({ data: undefined }))}
            >
              {busy === "cle" ? "…" : "Valider la clé utilisateur"}
            </button>
          </div>
        </div>
      </Bloc>

      <Bloc titre="1 · Profil (POST /profile)">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">Type de produit</span>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            >
              {Object.entries(PRODUCT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">Code postal</span>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="95600"
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">Date d'effet</span>
            <input
              type="date"
              value={dateEffet}
              onChange={(e) => setDateEffet(e.target.value)}
              className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3">
          <Zone
            label="Membres (profileHealth / profileMembers)"
            value={membres}
            onChange={setMembres}
          />
        </div>
        <button
          disabled={busy !== null}
          className={`${btnPrim} mt-3`}
          onClick={() => {
            const m = json(membres);
            if (!Array.isArray(m)) return;
            void lancer("profil", async () => {
              const res = (await demarrer({
                data: {
                  product_type: productType,
                  zip_code: zip,
                  date_effet: dateEffet,
                  ...(productType === "sante"
                    ? { profile_health: m as never }
                    : { profile_members: m as never }),
                },
              })) as { parcours_id: string; etape: string };
              setParcoursId(res.parcours_id);
              setEtape(res.etape);
              return res;
            });
          }}
        >
          {busy === "profil" ? "Création…" : "Créer le profil"}
        </button>
      </Bloc>

      <Bloc titre="2 · Tarifs (POST /generateprices)">
        <Zone label="types" value={types} onChange={setTypes} rows={3} />
        <p className="mt-2 text-xs text-ink-muted">
          Attention : une nouvelle génération peut invalider les{" "}
          <span className="font-mono">pricingId</span> précédents et vider le panier.
        </p>
        <button
          disabled={busy !== null}
          className={`${btnPrim} mt-3`}
          onClick={() => {
            if (!exigeParcours()) return;
            const t = json(types);
            if (!Array.isArray(t)) return;
            void lancer("tarifs", async () => {
              const r = await tarifs({ data: { parcours_id: parcoursId, types: t as string[] } });
              setEtape("tarifs");
              return r;
            });
          }}
        >
          {busy === "tarifs" ? "Appel…" : "Générer les tarifs"}
        </button>
      </Bloc>

      <Bloc titre="3 · Panier (POST / PUT /cart)">
        <Zone
          label="produits retenus (pricingId + members)"
          value={produits}
          onChange={setProduits}
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={remplacer}
            onChange={(e) => setRemplacer(e.target.checked)}
          />
          Remplacement total du panier (PUT) — renvoyer tous les produits conservés
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={busy !== null}
            className={btnPrim}
            onClick={() => {
              if (!exigeParcours()) return;
              const p = json(produits);
              if (!Array.isArray(p)) return;
              void lancer("panier", async () => {
                const r = await panier({
                  data: { parcours_id: parcoursId, produits: p as never, remplacer },
                });
                setEtape("panier");
                return r;
              });
            }}
          >
            {busy === "panier" ? "Appel…" : "Envoyer le panier"}
          </button>
          <button
            disabled={busy !== null}
            className={btn}
            onClick={() =>
              exigeParcours() &&
              lancer("lire", () => lirePanier({ data: { parcours_id: parcoursId } }))
            }
          >
            Lire le panier & produits couplables
          </button>
          <button
            disabled={busy !== null}
            className={btn}
            onClick={() =>
              exigeParcours() &&
              lancer("dyn", () => dynamiques({ data: { parcours_id: parcoursId } }))
            }
          >
            Champs d'offre / résiliations / prélèvements
          </button>
        </div>
      </Bloc>

      <Bloc titre="4 · Offre (POST / PUT /offer)">
        <Zone
          label="corps de l'offre (profileId ajouté côté serveur)"
          value={offre}
          onChange={setOffre}
          rows={8}
        />
        <button
          disabled={busy !== null}
          className={`${btnPrim} mt-3`}
          onClick={() => {
            if (!exigeParcours()) return;
            const c = json(offre);
            if (!c || typeof c !== "object") return;
            void lancer("offre", async () => {
              const r = (await enrOffre({
                data: { parcours_id: parcoursId, corps: c as Record<string, unknown> },
              })) as { ok: boolean };
              if (r.ok) setEtape("offre");
              return r;
            });
          }}
        >
          {busy === "offre" ? "Appel…" : "Enregistrer l'offre"}
        </button>
      </Bloc>

      <Bloc titre="5 · Signature et validation">
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy !== null}
            className={btn}
            onClick={() => {
              if (!exigeParcours()) return;
              void lancer("finalize", async () => {
                const r = await finaliser({
                  data: { parcours_id: parcoursId, sign_type: "handSign" },
                });
                setEtape("finalisation");
                return r;
              });
            }}
          >
            Finaliser l'offre
          </button>
          <button
            disabled={busy !== null}
            className={btn}
            onClick={() => {
              if (!exigeParcours()) return;
              void lancer("docs", async () => {
                const r = await documents({ data: { parcours_id: parcoursId } });
                setEtape("documents");
                return r;
              });
            }}
          >
            Récupérer BA / SEPA / résiliation
          </button>
        </div>
        <div className="mt-3">
          <Zone
            label="documents signés (Base64 par contrat)"
            value={docsSignes}
            onChange={setDocsSignes}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={busy !== null}
            className={btn}
            onClick={() => {
              if (!exigeParcours()) return;
              const d = json(docsSignes);
              if (!Array.isArray(d)) return;
              void lancer("depot", async () => {
                const r = await deposer({
                  data: { parcours_id: parcoursId, documents: d as never },
                });
                setEtape("depot_signature");
                return r;
              });
            }}
          >
            Déposer les documents signés
          </button>
          <button
            disabled={busy !== null}
            className={btnPrim}
            onClick={() => {
              if (!exigeParcours()) return;
              void lancer("validation", async () => {
                const r = (await valider({ data: { parcours_id: parcoursId } })) as { ok: boolean };
                setEtape(r.ok ? "termine" : "validation");
                return r;
              });
            }}
          >
            Valider la souscription
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          La souscription n'est « terminée » que pour les contrats effectivement validés par
          Néoliane.
        </p>
      </Bloc>

      <Bloc titre="5 bis · Signature électronique (paraphe du client)">
        <p className="mb-3 text-xs text-ink-muted">
          L'API Néoliane n'accepte que la finalisation <span className="font-mono">handSign</span> :
          la signature électronique est produite ici. Le paraphe est apposé côté serveur aux
          emplacements fournis par Néoliane (BA, SEPA, mandat de résiliation), avec bandeau de preuve
          (identité, horodatage, IP, référence) puis dépôt et validation automatiques.
        </p>
        <label className="mb-2 block text-xs font-medium text-ink-muted">
          Nom complet du signataire
          <input
            value={signataire}
            onChange={(e) => setSignataire(e.target.value)}
            placeholder="Jean Dupont"
            className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["holder", "spouse"] as const).map((membre) => (
            <div key={membre}>
              <p className="mb-1 text-xs text-ink-muted">
                Paraphe {membre === "holder" ? "titulaire (obligatoire)" : "conjoint (si couvert)"}
              </p>
              <SignaturePad
                height={140}
                onChange={(url) =>
                  setParaphes((prev) => {
                    const suivant = { ...prev };
                    if (url) suivant[membre] = url;
                    else delete suivant[membre];
                    return suivant;
                  })
                }
              />
            </div>
          ))}
        </div>
        <button
          disabled={busy !== null}
          className={`${btnPrim} mt-3`}
          onClick={() => {
            if (!exigeParcours()) return;
            if (signataire.trim().length < 2) {
              toast.error("Renseignez le nom du signataire.");
              return;
            }
            if (!paraphes["holder"]) {
              toast.error("Le paraphe du titulaire est obligatoire.");
              return;
            }
            void lancer("esign", async () => {
              const r = (await signerElectronique({
                data: { parcours_id: parcoursId, signataire: signataire.trim(), paraphes },
              })) as { ok: boolean };
              setEtape(r.ok ? "termine" : "depot_signature");
              return r;
            });
          }}
        >
          {busy === "esign" ? "Signature en cours…" : "Signer électroniquement et valider"}
        </button>
      </Bloc>


      <Bloc titre="EZ Gestion — abonnements et synchronisation">
        <p className="mb-3 text-xs text-ink-muted">
          URL de callback à déclarer (un abonnement par type d'événement) :{" "}
          <span className="break-all font-mono text-ink">{callbackUrl}</span> — protégée par le
          secret <span className="font-mono">NEOLIANE_WEBHOOK_SECRET</span>.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy !== null}
            className={btn}
            onClick={() => lancer("abo-list", () => abonnements({ data: { action: "lister" } }))}
          >
            Lister les abonnements
          </button>
          {(["contract", "contractDemarche"] as const).map((ev) => (
            <button
              key={ev}
              disabled={busy !== null}
              className={btn}
              onClick={() =>
                lancer(`abo-${ev}`, () =>
                  abonnements({
                    data: { action: "abonner", event_name: ev, callback: callbackUrl },
                  }),
                )
              }
            >
              S'abonner à « {ev} »
            </button>
          ))}
          <button
            disabled={busy !== null}
            className={btn}
            onClick={() => lancer("events", () => evenements({ data: undefined }))}
          >
            Derniers événements reçus
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-ink-muted">Rafraîchir</span>
            <select
              value={refType}
              onChange={(e) => setRefType(e.target.value as "contract" | "demarche")}
              className="rounded-md border border-line bg-background px-3 py-2 text-sm"
            >
              <option value="contract">Contrat</option>
              <option value="demarche">Démarche</option>
            </select>
          </label>
          <input
            value={refId}
            onChange={(e) => setRefId(e.target.value)}
            placeholder="identifiant Néoliane"
            className="rounded-md border border-line bg-background px-3 py-2 font-mono text-xs"
          />
          <button
            disabled={busy !== null || !refId}
            className={btn}
            onClick={() =>
              lancer("refresh", () => rafraichir({ data: { type: refType, id: refId } }))
            }
          >
            Recharger l'état
          </button>
        </div>
        <div className="mt-4 rounded-lg border border-line bg-background p-3">
          <p className="mb-2 text-xs text-ink-muted">
            Radiation de contrats (POST /contract/cancel) — possible uniquement tant que le contrat
            n'a pas été transmis à la compagnie : en cours d'adhésion, en attente de signature ou en
            cours de signature.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={radiationIds}
              onChange={(e) => setRadiationIds(e.target.value)}
              placeholder="contractId(s), séparés par une virgule"
              className="min-w-64 flex-1 rounded-md border border-line bg-background px-3 py-2 font-mono text-xs"
            />
            <input
              value={radiationMotif}
              onChange={(e) => setRadiationMotif(e.target.value)}
              placeholder="commentaire (optionnel)"
              className="min-w-48 flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm"
            />
            <button
              disabled={busy !== null || radiationIds.trim() === ""}
              className={btn}
              onClick={() => {
                const ids = radiationIds
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean);
                if (ids.length === 0) return;
                if (!window.confirm(`Radier ${ids.length} contrat(s) chez Néoliane ?`)) return;
                lancer("radiation", () =>
                  radier({
                    data: {
                      contract_ids: ids,
                      ...(radiationMotif.trim() ? { commentaire: radiationMotif.trim() } : {}),
                    },
                  }),
                );
              }}
            >
              Radier les contrats
            </button>
          </div>
        </div>
      </Bloc>

      {sortie && (
        <pre className="max-h-96 overflow-auto rounded-xl border border-line bg-background p-4 font-mono text-xs text-ink">
          {sortie}
        </pre>
      )}
    </div>
  );
}
