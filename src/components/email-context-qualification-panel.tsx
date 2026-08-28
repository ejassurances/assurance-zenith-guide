/**
 * CD-SI-001-B — LOT IHM QUALIFICATION — INTERFACE HUMAINE.
 * Référence exclusive : docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.1.md
 *
 * Présentation seule : toute décision est prise côté serveur. Aucune écriture
 * directe en base depuis le navigateur, aucune FK, aucun rejeu automatique.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import {
  appliquerValidationContexte,
  detailContexteEmail,
  fileContexteAQualifier,
} from "@/lib/email-context-validation.functions";
import type { CorrectionContexte } from "@/lib/email-context-validation";
import { STATUTS_HUMAINS } from "@/lib/email-context-validation";
import {
  CHAMPS_IDENTITE_IHM,
  VALEUR_AUCUNE,
  construireCorrectionIdentite,
  libelleCorrectionIhm,
  optionsIdentite,
  type ChampIdentiteIhm,
  type ObjetIhm,
  type Referentiels,
} from "@/lib/email-context-qualification-ui";

type LigneFile = {
  id: string;
  gmail_message_id: string;
  direction: string;
  recu_le: string | null;
  statut: string | null;
  nb_ambiguites: number;
  nb_propositions: number;
};

type Detail = Awaited<ReturnType<typeof detailContexteEmail>>;
type DetailTrouve = Extract<Detail, { trouve: true }>;

const MESSAGES: Record<string, string> = {
  email_introuvable: "Message introuvable ou non accessible avec vos habilitations.",
  contexte_invalide: "Le contexte enregistré n'est pas conforme au schéma : validation impossible.",
  deja_valide: "Ce contexte a déjà été validé par un opérateur : aucune modification appliquée.",
  degradation_interdite: "Un contexte validé par un humain ne peut pas être renvoyé en qualification.",
  correction_hors_perimetre: "Correction hors périmètre autorisé : aucune modification appliquée.",
  updated_at_inexploitable: "Version du message illisible : validation refusée par sécurité.",
  conflit_concurrent: "Le message a changé pendant votre saisie. Rechargez la fiche et recommencez.",
  erreur_base: "Écriture refusée par la base ou habilitation insuffisante. Rien n'a été modifié.",
};

type IntentionUi =
  | { type: "valider" }
  | { type: "corriger_et_valider"; corrections: CorrectionContexte[] }
  | { type: "renvoyer_qualification"; motif: string };

/** Lecture d'un champ de proposition sans chemin JSON libre (clés bornées par les descripteurs). */
function valeurBrute(objet: object | null | undefined, champ: string): string | null {
  if (!objet) return null;
  const trouve = Object.entries(objet).find(([k]) => k === champ);
  return typeof trouve?.[1] === "string" ? trouve[1] : null;
}

const jour = (v: string | null) => (v ? new Date(v).toLocaleString("fr-FR") : "—");

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </span>
  );
}

/** Sélecteur de statut humain pour un élément proposé. */
function StatutSelect({
  valeur,
  desactive,
  onChange,
}: {
  valeur: string | null;
  desactive: boolean;
  onChange: (v: (typeof STATUTS_HUMAINS)[number]) => void;
}) {
  return (
    <select
      value={STATUTS_HUMAINS.includes(valeur as (typeof STATUTS_HUMAINS)[number]) ? (valeur as string) : ""}
      disabled={desactive}
      onChange={(e) => onChange(e.target.value as (typeof STATUTS_HUMAINS)[number])}
      className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
    >
      <option value="">Statut IA : {valeur ?? "—"}</option>
      {STATUTS_HUMAINS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

/**
 * Sélecteur borné d'une proposition d'identité (§2.1.5). Aucune saisie libre :
 * les seules valeurs proposées sont « aucun » et les référentiels renvoyés par
 * `detailContexteEmail` ou une énumération fermée du schéma 1.1.0.
 */
function IdentiteSelect({
  descripteur,
  referentiels,
  valeurActuelle,
  desactive,
  onChoix,
}: {
  descripteur: ChampIdentiteIhm;
  referentiels: Referentiels;
  valeurActuelle: string | null;
  desactive: boolean;
  onChoix: (valeurBrute: string) => void;
}) {
  const options = optionsIdentite(descripteur, referentiels);
  const selection = options.some((o) => o.valeur === (valeurActuelle ?? VALEUR_AUCUNE))
    ? (valeurActuelle ?? VALEUR_AUCUNE)
    : VALEUR_AUCUNE;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-ink-muted">{descripteur.libelle}</span>
      <select
        data-testid={`identite-${descripteur.champ}`}
        value={selection}
        disabled={desactive}
        onChange={(e) => onChoix(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
      >
        {options.map((o) => (
          <option key={o.valeur || "aucune"} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EmailContextQualificationPanel() {
  const chargerFile = useServerFn(fileContexteAQualifier);
  const chargerDetail = useServerFn(detailContexteEmail);
  const appliquer = useServerFn(appliquerValidationContexte);

  const [file, setFile] = useState<LigneFile[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailTrouve | null>(null);
  const [corrections, setCorrections] = useState<CorrectionContexte[]>([]);
  const [motifRenvoi, setMotifRenvoi] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ton: "ok" | "ko"; texte: string } | null>(null);

  const rafraichirFile = useCallback(async () => {
    const r = await chargerFile();
    setFile((r.lignes ?? []) as LigneFile[]);
  }, [chargerFile]);

  useEffect(() => {
    void rafraichirFile();
  }, [rafraichirFile]);

  const ouvrir = useCallback(
    async (id: string) => {
      setSelection(id);
      setCorrections([]);
      setMotifRenvoi("");
      setMessage(null);
      const r = await chargerDetail({ data: { email_id: id } });
      setDetail(r.trouve ? r : null);
    },
    [chargerDetail],
  );

  const contexte = detail?.contexte ?? null;
  const lectureSeule = detail?.lectureSeule ?? true;

  const libelle = useCallback(
    (groupe: keyof NonNullable<DetailTrouve["libelles"]>, id: string | null | undefined) => {
      if (!id) return null;
      return detail?.libelles?.[groupe]?.find((x) => x.id === id)?.libelle ?? id;
    },
    [detail],
  );

  const poserCorrection = useCallback((c: CorrectionContexte) => {
    setCorrections((prev) => [
      ...prev.filter(
        (p) =>
          !(
            p.cible.objet === c.cible.objet &&
            ("index" in p.cible ? p.cible.index : -1) === ("index" in c.cible ? c.cible.index : -1) &&
            p.champ === c.champ
          ),
      ),
      c,
    ]);
  }, []);

  const referentiels: Referentiels = useMemo(() => detail?.libelles ?? {}, [detail]);

  /** Valeur affichée pour un champ d'identité : correction en attente sinon proposition IA. */
  const valeurIdentite = useCallback(
    (objet: ObjetIhm, index: number | null, champ: string, valeurIa: string | null) => {
      const enAttente = corrections.find(
        (c) =>
          c.cible.objet === objet &&
          ("index" in c.cible ? c.cible.index : null) === index &&
          c.champ === champ,
      );
      if (!enAttente) return valeurIa;
      return typeof enAttente.valeur === "string" ? enAttente.valeur : null;
    },
    [corrections],
  );

  const poserCorrectionIdentite = useCallback(
    (objet: ObjetIhm, index: number | null, champ: string, valeurBrute: string) => {
      const correction = construireCorrectionIdentite({
        objet,
        index,
        champ,
        valeurBrute,
        referentiels,
      });
      if (!correction) return;
      poserCorrection(correction);
    },
    [poserCorrection, referentiels],
  );


  const envoyer = useCallback(
    async (intention: IntentionUi) => {
      if (!selection) return;
      setEnCours(true);
      setMessage(null);
      try {
        const r = await appliquer({ data: { email_id: selection, intention } });
        if (r.ecrit) {
          setMessage({ ton: "ok", texte: "Contexte validé et sentinelles humaines enregistrées." });
        } else if (r.noop) {
          setMessage({ ton: "ok", texte: "Contexte déjà dans cet état : aucune modification nécessaire." });
        } else {
          setMessage({
            ton: "ko",
            texte: MESSAGES[r.motif ?? "erreur_base"] ?? MESSAGES["erreur_base"]!,
          });
        }
        await ouvrir(selection);
        await rafraichirFile();
      } finally {
        setEnCours(false);
      }
    },
    [appliquer, ouvrir, rafraichirFile, selection],
  );

  const resume = useMemo(() => {
    if (!contexte) return null;
    const a = contexte.analyse;
    return {
      statut: a?.statut ?? "—",
      modele: a?.modele ?? null,
      confiance: typeof a?.confiance_globale === "number" ? Math.round(a.confiance_globale * 100) : null,
      validePar: a?.validated_by ?? null,
      valideLe: a?.validated_at ?? null,
      source: a?.provenance?.source ?? null,
    };
  }, [contexte]);

  return (
    <section className="crm-card min-w-0 p-5">
      <p className="crm-eyebrow">Qualification du contexte des e-mails</p>
      <p className="text-xs text-ink-muted">
        Consultez les éléments proposés par l'analyse, corrigez-les si besoin, puis validez. La validation
        humaine est définitive : elle ne peut plus être dégradée ensuite.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-ink-muted">
            À qualifier ({file.length})
          </p>
          {file.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Aucun contexte en attente de qualification.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {file.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => void ouvrir(l.id)}
                    className={
                      "w-full rounded-md border px-3 py-2 text-left text-sm " +
                      (selection === l.id ? "border-[color:var(--crm-gold)] text-ink" : "border-line text-ink-soft")
                    }
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge>{l.statut ?? "—"}</Badge>
                      <span className="text-xs text-ink-muted">{jour(l.recu_le)}</span>
                    </span>
                    <span className="mt-1 block text-xs text-ink-muted">
                      {l.nb_propositions} proposition(s) · {l.nb_ambiguites} ambiguïté(s)
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          {!detail ? (
            <p className="text-sm text-ink-muted">Sélectionnez un message pour afficher son contexte.</p>
          ) : !contexte ? (
            <p className="text-sm text-ink-muted">
              Contexte non conforme au schéma : consultation et validation indisponibles.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-line/70 bg-surface-muted/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{resume?.statut}</Badge>
                  {resume?.confiance !== null && resume?.confiance !== undefined && (
                    <span className="text-[11px] text-ink-muted">Confiance {resume.confiance} %</span>
                  )}
                  {resume?.modele && <span className="text-[11px] text-ink-muted">{resume.modele}</span>}
                  {lectureSeule && <Badge>Lecture seule</Badge>}
                </div>
                {resume?.valideLe && (
                  <p className="mt-1 text-[11px] text-ink-muted">
                    Validé le {jour(resume.valideLe)} (source {resume.source ?? "—"})
                  </p>
                )}
              </div>

              <div>
                <p className="crm-eyebrow">Correspondant</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {contexte.correspondant?.nom_affiche ?? "—"} · {contexte.correspondant?.email ?? "—"}
                </p>
                <p className="text-xs text-ink-muted">
                  Client proposé : {libelle("clients", contexte.correspondant?.client_id) ?? "aucun"} · Compagnie :{" "}
                  {libelle("compagnies", contexte.correspondant?.compagnie_id) ?? "aucune"}
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <StatutSelect
                    valeur={contexte.correspondant?.statut ?? null}
                    desactive={lectureSeule || enCours}
                    onChange={(v) =>
                      poserCorrection({ cible: { objet: "correspondant" }, champ: "statut", valeur: v })
                    }
                  />
                  {CHAMPS_IDENTITE_IHM.correspondant.map((d) => (
                    <IdentiteSelect
                      key={d.champ}
                      descripteur={d}
                      referentiels={referentiels}
                      valeurActuelle={valeurIdentite(
                        "correspondant",
                        null,
                        d.champ,
                        valeurBrute(contexte.correspondant, d.champ),
                      )}
                      desactive={lectureSeule || enCours}
                      onChoix={(v) => poserCorrectionIdentite("correspondant", null, d.champ, v)}
                    />
                  ))}
                </div>
              </div>


              {(
                [
                  ["Personnes détectées", contexte.personnes_detectees ?? [], "personne"],
                  ["Dossiers détectés", contexte.dossiers_detectes ?? [], "dossier"],
                  ["Contrats détectés", contexte.contrats_detectes ?? [], "contrat"],
                  ["Produits cités", contexte.produits_cites ?? [], "produit"],
                  ["Documents associés", contexte.documents_associes ?? [], "document"],
                ] as const
              ).map(([titre, items, objet]) =>
                items.length === 0 ? null : (
                  <div key={objet}>
                    <p className="crm-eyebrow">{titre}</p>
                    <ul className="mt-1 space-y-2">
                      {items.map((it, index) => (
                        <li key={`${objet}-${index}`} className="rounded-md border border-line p-2">
                          <p className="text-sm text-ink-soft">
                            {Object.entries(it)
                              .filter(([k, v]) => v !== null && v !== undefined && k !== "provenance")
                              .map(([k, v]) => `${k} : ${String(v)}`)
                              .join(" · ")}
                          </p>
                          <div className="mt-2 flex flex-wrap items-end gap-3">
                            <StatutSelect
                              valeur={(it as { statut?: string }).statut ?? null}
                              desactive={lectureSeule || enCours}
                              onChange={(v) =>
                                poserCorrection({
                                  cible: { objet, index },
                                  champ: "statut",
                                  valeur: v,
                                } as CorrectionContexte)
                              }
                            />
                            {CHAMPS_IDENTITE_IHM[objet].map((d) => (
                              <IdentiteSelect
                                key={d.champ}
                                descripteur={d}
                                referentiels={referentiels}
                                valeurActuelle={valeurIdentite(objet, index, d.champ, valeurBrute(it, d.champ))}
                                desactive={lectureSeule || enCours}
                                onChoix={(v) => poserCorrectionIdentite(objet, index, d.champ, v)}
                              />
                            ))}
                          </div>

                        </li>
                      ))}
                    </ul>
                  </div>
                ),
              )}

              {(contexte.ambiguities ?? []).length > 0 && (
                <div>
                  <p className="crm-eyebrow">Ambiguïtés à lever</p>
                  <ul className="mt-1 space-y-1">
                    {(contexte.ambiguities ?? []).map((a, i) => (
                      <li key={i} className="text-xs text-ink-muted">
                        {a.type} — {a.description ?? "—"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!lectureSeule && (
                <div className="space-y-3 border-t border-line pt-3">
                  <div>
                    <p className="text-xs text-ink-muted">
                      {corrections.length} correction(s) en attente d'enregistrement.
                    </p>
                    {corrections.length > 0 && (
                      <ul className="mt-1 space-y-0.5" data-testid="panier-corrections">
                        {corrections.map((c, i) => (
                          <li key={i} className="text-[11px] text-ink-soft">
                            {libelleCorrectionIhm(c, referentiels)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() =>
                        void envoyer(
                          corrections.length > 0
                            ? { type: "corriger_et_valider", corrections }
                            : { type: "valider" },
                        )
                      }
                      className="rounded-md border border-[color:var(--crm-gold)] px-3 py-2 text-sm text-ink disabled:opacity-50"
                    >
                      {corrections.length > 0 ? "Corriger et valider" : "Valider le contexte"}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={motifRenvoi}
                      onChange={(e) => setMotifRenvoi(e.target.value)}
                      placeholder="Motif du renvoi en qualification"
                      className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={enCours || motifRenvoi.trim().length < 3}
                      onClick={() =>
                        void envoyer({ type: "renvoyer_qualification", motif: motifRenvoi.trim() })
                      }
                      className="rounded-md border border-line px-3 py-2 text-sm text-ink-muted disabled:opacity-50"
                    >
                      Renvoyer en qualification
                    </button>
                  </div>
                </div>
              )}

              {message && (
                <p
                  className={
                    "text-sm " + (message.ton === "ok" ? "text-ink" : "text-[color:var(--crm-gold)]")
                  }
                >
                  {message.texte}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
