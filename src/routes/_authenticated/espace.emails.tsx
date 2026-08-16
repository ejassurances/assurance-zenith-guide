import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { EmailComposeDialog } from "@/components/email-compose-dialog";
import { ReponsesIaPanel } from "@/components/reponses-ia-panel";

import {
  boiteReception,
  messageComplet,
  rattacherMessage,
  rattacherCompagnie,
  detacherMessage,
  creerFicheDepuisEmail,
  marquerLuMessage,
  archiverMessageCrm,
  supprimerMessageCrm,
  etiqueterMessageCrm,
  scannerBoiteCrm,

} from "@/lib/emails.functions";
import { importerFactureDepuisEmail } from "@/lib/factures-achat.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/espace/emails")({
  component: EmailsPage,
  head: () => ({
    meta: [
      { title: "Emails — CRM EJ Partners Assurances" },
      { name: "description", content: "Boîte principale du cabinet : rattachez chaque email à un client, un dossier, un contrat ou une compagnie." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Resume = {
  id: string;
  thread_id: string;
  sujet: string;
  expediteur_nom: string | null;
  expediteur_email: string | null;
  destinataires: string;
  snippet: string;
  date: string | null;
  non_lu: boolean;
  etiquettes: string[];
};

type Lien = {
  id: string;
  gmail_message_id: string;
  client_id: string | null;
  dossier_id: string | null;
  contrat_id: string | null;
  compagnie_id: string | null;
  notes: string | null;
  triage_ia?: unknown;
  triage_le?: string | null;

  clients?: { nom: string | null; prenom: string | null } | null;
  compagnies?: { nom: string | null } | null;
};

type ClientLite = { id: string; nom: string; prenom: string | null; email: string | null };
type CompagnieLite = { id: string; nom: string; contact_email: string | null; site_web: string | null };
type DossierLite = { id: string; reference: string; type_assurance: string; client_id: string | null };
type ContratLite = { id: string; numero: string | null; produit: string; client_id: string };

const TYPES_ASSURANCE = [
  "emprunteur",
  "sante",
  "prevoyance",
  "epargne",
  "auto",
  "moto",
  "trottinette",
  "habitation",
  "pro",
  "autre",
];

/* Charte CRM : bleu nuit, accent doré, cartes détachées. */
const CARTE = "rounded-2xl border border-line bg-surface-elevated shadow-sm";
const BTN_PRIMAIRE =
  "rounded-full bg-ink px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60";
const BTN_SECONDAIRE =
  "rounded-full border border-line bg-surface-elevated px-4 py-2 text-sm text-ink transition hover:border-[color:var(--crm-gold)] hover:text-ink disabled:opacity-60";
const CHAMP =
  "w-full rounded-md border border-line bg-background px-3 py-2 text-sm text-ink outline-none focus:border-[color:var(--crm-gold)] focus:ring-1 focus:ring-[color:var(--crm-gold)]";
const TITRE_SECTION = "font-serif text-base text-ink";


function EmailsPage() {
  const { role } = useAuth();
  const staff = role === "admin" || role === "mandataire";

  const charger = useServerFn(boiteReception);
  const lire = useServerFn(messageComplet);
  const rattacher = useServerFn(rattacherMessage);
  const rattacherCie = useServerFn(rattacherCompagnie);
  const detacher = useServerFn(detacherMessage);
  const creerFiche = useServerFn(creerFicheDepuisEmail);
  const marquerLuFn = useServerFn(marquerLuMessage);
  const archiverFn = useServerFn(archiverMessageCrm);
  const supprimerFn = useServerFn(supprimerMessageCrm);
  const etiqueterFn = useServerFn(etiqueterMessageCrm);
  const importerFacture = useServerFn(importerFactureDepuisEmail);
  const scanner = useServerFn(scannerBoiteCrm);
  const [scanBusy, setScanBusy] = useState(false);

  const lancerScan = async () => {
    setScanBusy(true);
    setError(null);
    try {
      const res = await scanner({ data: {} });
      toast.success(
        `${res.analyses} mails analysés — ${res.rattachesClient} rattachés à un client, ` +
          `${res.rattachesCompagnie} à une compagnie (${res.deja} déjà liés).`,
      );
      await loadBoite();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan de la boîte impossible");
    } finally {
      setScanBusy(false);
    }
  };


  const [messages, setMessages] = useState<Resume[]>([]);
  const [liens, setLiens] = useState<Lien[]>([]);
  const [recherche, setRecherche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Resume | null>(null);
  const [detail, setDetail] = useState<{
    texte: string | null;
    html: string | null;
    cc: string;
    pieces_jointes: { nom: string; mime: string | null; attachment_id: string | null }[];
  } | null>(null);
  const [factureBusy, setFactureBusy] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [compose, setCompose] = useState<{ to: string; sujet: string; threadId: string | null } | null>(null);

  const [clients, setClients] = useState<ClientLite[]>([]);
  const [compagnies, setCompagnies] = useState<CompagnieLite[]>([]);
  const [dossiers, setDossiers] = useState<DossierLite[]>([]);
  const [contrats, setContrats] = useState<ContratLite[]>([]);

  const loadBoite = async (token?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await charger({ data: { recherche: recherche || null, pageToken: token ?? null } });
      setMessages(res.messages as Resume[]);
      setLiens(res.liens as Lien[]);
      if (res.dossiers_crees > 0) {
        toast.success(
          `${res.dossiers_crees} dossier(s) créé(s) automatiquement depuis les emails entrants (lettre de mission envoyée).`,
        );
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Lecture de la boîte impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!staff) return;
    loadBoite();
    (async () => {
      const [cl, cie] = await Promise.all([
        supabase.from("clients").select("id, nom, prenom, email").order("nom").limit(500),
        supabase.from("compagnies").select("id, nom, contact_email, site_web").order("nom"),
      ]);
      setClients((cl.data ?? []) as ClientLite[]);
      setCompagnies((cie.data ?? []) as CompagnieLite[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff]);

  const lienDe = (id: string) => liens.find((l) => l.gmail_message_id === id) ?? null;

  const ouvrir = async (m: Resume) => {
    setSelected(m);
    setDetail(null);
    setDetailBusy(true);
    try {
      const res = await lire({ data: { id: m.id } });
      setDetail(res.message as never);
      if (m.non_lu) {
        await marquerLuFn({ data: { id: m.id, lu: true } }).catch(() => {});
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, non_lu: false } : x)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message illisible");
    } finally {
      setDetailBusy(false);
    }
  };

  const agir = async (action: "archiver" | "supprimer" | "non_lu", m: Resume) => {
    setError(null);
    try {
      if (action === "archiver") await archiverFn({ data: { id: m.id } });
      if (action === "supprimer") await supprimerFn({ data: { id: m.id } });
      if (action === "non_lu") await marquerLuFn({ data: { id: m.id, lu: false } });
      if (action === "non_lu") {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, non_lu: true } : x)));
      } else {
        setMessages((prev) => prev.filter((x) => x.id !== m.id));
        setSelected(null);
        setDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
    }
  };

  const etiqueter = async (m: Resume, etiquette: string) => {
    setError(null);
    try {
      await etiqueterFn({ data: { id: m.id, etiquette } });
      setMessages((prev) =>
        prev.map((x) => (x.id === m.id ? { ...x, etiquettes: [...new Set([...x.etiquettes, etiquette])] } : x)),
      );
      setSelected((prev) =>
        prev && prev.id === m.id ? { ...prev, etiquettes: [...new Set([...prev.etiquettes, etiquette])] } : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Étiquette impossible");
    }
  };

  /** Enregistre une pièce jointe comme facture d'achat (lecture IA des montants). */
  const enregistrerFacture = async (
    m: Resume,
    piece: { nom: string; mime: string | null; attachment_id: string | null },
  ) => {
    if (!piece.attachment_id) return;
    setFactureBusy(piece.attachment_id);
    try {
      const res = await importerFacture({
        data: {
          gmail_message_id: m.id,
          attachment_id: piece.attachment_id,
          nom_fichier: piece.nom,
          mime: piece.mime,
          expediteur_nom: m.expediteur_nom,
          expediteur_email: m.expediteur_email,
          sujet: m.sujet,
          recu_le: m.date,
        },
      });
      if (res.deja_importee) {
        toast.info("Cette pièce jointe a déjà été importée en facture d'achat.");
      } else if (res.lue?.montant_ttc) {
        toast.success(
          `Facture enregistrée : ${res.lue.fournisseur ?? "fournisseur"} — ${res.lue.montant_ttc.toFixed(2)} € TTC. À vérifier dans Comptabilité › Factures d'achat.`,
        );
      } else {
        toast.success("Facture créée dans Comptabilité › Factures d'achat — montants à compléter.");
      }
      if (res.avertissement) toast.warning(res.avertissement);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import de la facture impossible");
    } finally {
      setFactureBusy(null);
    }
  };



  /** Compagnie suggérée d'après le domaine de l'expéditeur. */
  const compagnieSuggeree = useMemo(() => {
    const email = selected?.expediteur_email ?? "";
    const domaine = email.split("@")[1]?.toLowerCase();
    if (!domaine) return null;
    return (
      compagnies.find((c) => (c.contact_email ?? "").toLowerCase().endsWith(`@${domaine}`)) ??
      compagnies.find((c) => (c.site_web ?? "").toLowerCase().includes(domaine.replace(/^mail\./, ""))) ??
      null
    );
  }, [selected, compagnies]);

  /** Client suggéré d'après l'adresse de l'expéditeur. */
  const clientSuggere = useMemo(() => {
    const email = selected?.expediteur_email ?? "";
    if (!email) return null;
    return clients.find((c) => (c.email ?? "").toLowerCase() === email) ?? null;
  }, [selected, clients]);

  if (!staff) return <p className="text-sm text-ink-muted">Accès réservé au cabinet.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="font-serif text-3xl text-ink">Emails</h1>
          <span className="mt-2 block h-0.5 w-16 bg-[color:var(--crm-gold)]" aria-hidden />
          <p className="mt-3 text-sm text-ink-muted">
            Boîte de réception principale du cabinet (onglet « Principal » de Gmail).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => loadBoite()} disabled={loading} className={BTN_SECONDAIRE}>
            {loading ? "Synchronisation…" : "Synchroniser"}
          </button>
          <button onClick={lancerScan} disabled={scanBusy} className={BTN_SECONDAIRE}>
            {scanBusy ? "Scan en cours…" : "Scanner les mails (lus inclus)"}
          </button>
          <button onClick={() => setCompose({ to: "", sujet: "", threadId: null })} className={BTN_PRIMAIRE}>
            Nouvel email
          </button>
        </div>

      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          loadBoite();
        }}
        className="flex gap-2"
      >
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher (expéditeur, objet…)"
          className={CHAMP + " max-w-sm"}
        />
        <button className={BTN_SECONDAIRE}>Rechercher</button>
      </form>

      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <ReponsesIaPanel />



      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className={CARTE + " overflow-hidden"}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className={TITRE_SECTION}>Messages</h2>
            <span className="text-xs text-ink-muted">{messages.length}</span>
          </div>
          {loading ? (
            <p className="px-4 py-6 text-sm text-ink-muted">Chargement de la boîte…</p>
          ) : messages.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">Aucun message.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
              {messages.map((m) => {
                const lien = lienDe(m.id);
                const actif = selected?.id === m.id;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => ouvrir(m)}
                      className={
                        "w-full border-l-2 px-4 py-3 text-left transition-colors " +
                        (actif
                          ? "border-l-[color:var(--crm-gold)] bg-[rgb(212_175_55_/_0.08)]"
                          : "border-l-transparent hover:bg-surface")
                      }
                    >
                      <div className="flex items-center gap-2">
                        <p className={"truncate text-sm " + (m.non_lu ? "font-semibold text-ink" : "text-ink-soft")}>
                          {m.expediteur_nom ?? m.expediteur_email ?? "—"}
                        </p>
                        <span className="ml-auto shrink-0 text-[11px] text-ink-muted">
                          {m.date ? new Date(m.date).toLocaleDateString("fr-FR") : ""}
                        </span>
                      </div>
                      <p className={"truncate text-sm " + (actif ? "font-medium text-ink" : "text-ink")}>{m.sujet}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{m.snippet}</p>
                      {m.etiquettes.length > 0 && (
                        <span className="mt-2 flex flex-wrap gap-1">
                          {m.etiquettes.map((e) => (
                            <span
                              key={e}
                              className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-ink-soft"
                            >
                              {e}
                            </span>
                          ))}
                        </span>
                      )}
                      {lien && (
                        <p className="mt-2 text-[11px] font-medium text-[color:var(--crm-gold)]">
                          Rattaché ·{" "}
                          {lien.clients
                            ? [lien.clients.prenom, lien.clients.nom].filter(Boolean).join(" ")
                            : lien.compagnies?.nom ?? "CRM"}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>


        <div>
          {!selected ? (
            <div className={CARTE + " p-8 text-center"}>
              <p className="text-sm text-ink-muted">Sélectionnez un message pour le lire et le rattacher.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className={CARTE + " overflow-hidden"}>
                <div className="border-b border-line bg-surface px-5 py-4">
                  <h2 className="font-serif text-xl text-ink">{selected.sujet}</h2>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    De {selected.expediteur_nom ?? ""} &lt;{selected.expediteur_email}&gt; ·{" "}
                    {selected.date ? new Date(selected.date).toLocaleString("fr-FR") : ""}
                  </p>
                  <p className="text-xs text-ink-muted">À {selected.destinataires}</p>
                </div>
                <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
                  <button
                    onClick={() =>
                      setCompose({
                        to: selected.expediteur_email ?? "",
                        sujet: selected.sujet.startsWith("Re:") ? selected.sujet : `Re: ${selected.sujet}`,
                        threadId: selected.thread_id,
                      })
                    }
                    className={BTN_PRIMAIRE}
                  >
                    Répondre
                  </button>
                  {lienDe(selected.id) && (
                    <button
                      onClick={async () => {
                        await detacher({ data: { gmail_message_id: selected.id } });
                        loadBoite();
                      }}
                      className={BTN_SECONDAIRE}
                    >
                      Retirer le rattachement
                    </button>
                  )}
                  <button onClick={() => agir("non_lu", selected)} className={BTN_SECONDAIRE}>
                    Marquer non lu
                  </button>
                  <button onClick={() => agir("archiver", selected)} className={BTN_SECONDAIRE}>
                    Archiver
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Mettre ce message à la corbeille Gmail ?")) agir("supprimer", selected);
                    }}
                    className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-700 transition hover:bg-red-50"
                  >
                    Supprimer
                  </button>
                </div>

                <div className="px-5 py-5">
                  <div className="max-h-[420px] overflow-y-auto rounded-xl border border-line bg-background p-4 text-sm text-ink-soft">
                    {detailBusy ? (
                      "Chargement…"
                    ) : detail?.texte ? (
                      <pre className="whitespace-pre-wrap font-sans">{detail.texte}</pre>
                    ) : detail?.html ? (
                      <p className="text-xs italic text-ink-muted">
                        Message au format HTML — extrait : {selected.snippet}
                      </p>
                    ) : (
                      selected.snippet
                    )}
                  </div>
                  {detail?.pieces_jointes?.length ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs uppercase tracking-wider text-ink-muted">Pièces jointes</p>
                      {detail.pieces_jointes.map((p) => {
                        const facturable =
                          !!p.attachment_id &&
                          (/\.(pdf|jpe?g|png)$/i.test(p.nom) || (p.mime ?? "").startsWith("image/") || p.mime === "application/pdf");
                        return (
                          <div
                            key={`${p.nom}-${p.attachment_id ?? ""}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-elevated px-3 py-2"
                          >
                            <span className="text-xs text-ink">{p.nom}</span>
                            {facturable ? (
                              <button
                                onClick={() => enregistrerFacture(selected, p)}
                                disabled={factureBusy === p.attachment_id}
                                className={BTN_SECONDAIRE}
                              >
                                {factureBusy === p.attachment_id
                                  ? "Lecture de la facture…"
                                  : "Enregistrer comme facture d'achat"}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>

              <EtiquettesBloc message={selected} onEtiqueter={(e) => etiqueter(selected, e)} />



              <RattachementPanel
                key={selected.id}
                message={selected}
                lien={lienDe(selected.id)}
                clients={clients}
                compagnies={compagnies}
                dossiers={dossiers}
                contrats={contrats}
                clientSuggere={clientSuggere}
                compagnieSuggeree={compagnieSuggeree}
                onChargerDossiers={async (clientId) => {
                  const [d, k] = await Promise.all([
                    supabase.from("dossiers").select("id, reference, type_assurance, client_id").eq("client_id", clientId),
                    supabase.from("contrats").select("id, numero, produit, client_id").eq("client_id", clientId),
                  ]);
                  setDossiers((d.data ?? []) as DossierLite[]);
                  setContrats((k.data ?? []) as ContratLite[]);
                }}
                onRattacher={async (payload) => {
                  await rattacher({ data: { ...payload, ...metaDe(selected) } });
                  await loadBoite();
                }}
                onRattacherCompagnie={async (compagnieId) => {
                  await rattacherCie({
                    data: {
                      gmail_message_id: selected.id,
                      gmail_thread_id: selected.thread_id,
                      compagnie_id: compagnieId,
                      expediteur_nom: selected.expediteur_nom,
                      expediteur_email: selected.expediteur_email,
                      sujet: selected.sujet,
                      snippet: selected.snippet,
                      recu_le: selected.date,
                    },
                  });
                  await loadBoite();
                }}
                onCreerFiche={async (form) =>
                  await creerFiche({
                    data: {
                      gmail_message_id: selected.id,
                      gmail_thread_id: selected.thread_id,
                      sujet: selected.sujet,
                      snippet: selected.snippet,
                      recu_le: selected.date,
                      ...form,
                    },
                  })
                }
                onCree={loadBoite}
              />
            </div>
          )}
        </div>
      </div>

      <EmailComposeDialog
        open={!!compose}
        onClose={() => setCompose(null)}
        defaultTo={compose?.to}
        defaultSujet={compose?.sujet}
        threadId={compose?.threadId ?? null}
        liens={{
          client_id: selected ? (lienDe(selected.id)?.client_id ?? null) : null,
          dossier_id: selected ? (lienDe(selected.id)?.dossier_id ?? null) : null,
          compagnie_id: selected ? (lienDe(selected.id)?.compagnie_id ?? null) : null,
        }}
      />
    </div>
  );
}

function metaDe(m: Resume) {
  return {
    gmail_message_id: m.id,
    gmail_thread_id: m.thread_id,
    expediteur_nom: m.expediteur_nom,
    expediteur_email: m.expediteur_email,
    destinataires: m.destinataires,
    sujet: m.sujet,
    snippet: m.snippet,
    recu_le: m.date,
  };
}

function RattachementPanel({
  message,
  lien,
  clients,
  compagnies,
  dossiers,
  contrats,
  clientSuggere,
  compagnieSuggeree,
  onChargerDossiers,
  onRattacher,
  onRattacherCompagnie,
  onCreerFiche,
  onCree,
}: {
  message: Resume;
  lien: Lien | null;
  clients: ClientLite[];
  compagnies: CompagnieLite[];
  dossiers: DossierLite[];
  contrats: ContratLite[];
  clientSuggere: ClientLite | null;
  compagnieSuggeree: CompagnieLite | null;
  onChargerDossiers: (clientId: string) => Promise<void>;
  onRattacher: (payload: {
    client_id?: string | null;
    dossier_id?: string | null;
    contrat_id?: string | null;
    notes?: string | null;
  }) => Promise<void>;
  onRattacherCompagnie: (compagnieId: string) => Promise<void>;
  onCreerFiche: (form: {
    nom: string;
    prenom?: string | null;
    email: string;
    telephone?: string | null;
    creer_dossier: boolean;
    type_assurance: string;
  }) => Promise<{ client_id: string; dossier_reference: string | null }>;
  onCree: () => void;
}) {
  const [clientId, setClientId] = useState(lien?.client_id ?? clientSuggere?.id ?? "");
  const [dossierId, setDossierId] = useState(lien?.dossier_id ?? "");
  const [contratId, setContratId] = useState(lien?.contrat_id ?? "");
  const [compagnieId, setCompagnieId] = useState(lien?.compagnie_id ?? compagnieSuggeree?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [creation, setCreation] = useState(false);
  // Suggestion de l'agent commercial lorsque la classification n'est pas certaine.
  const triage = (lien?.triage_ia ?? null) as {
    prospect?: string;
    branche?: string | null;
    nom?: string | null;
    prenom?: string | null;
    telephone?: string | null;
    resume?: string;
  } | null;
  const nomDeduit = (message.expediteur_nom ?? message.expediteur_email ?? "").split(" ");

  const [form, setForm] = useState({
    prenom: nomDeduit.length > 1 ? nomDeduit[0]! : "",
    nom: nomDeduit.length > 1 ? nomDeduit.slice(1).join(" ") : nomDeduit[0] || "Contact",
    email: message.expediteur_email ?? "",
    telephone: "",
    creer_dossier: true,
    type_assurance: "autre",
  });

  useEffect(() => {
    if (clientId) onChargerDossiers(clientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const enregistrer = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await onRattacher({
        client_id: clientId || null,
        dossier_id: dossierId || null,
        contrat_id: contratId || null,
      });
      setMsg("Email rattaché au client.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Rattachement impossible");
    } finally {
      setBusy(false);
    }
  };

  const creer = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await onCreerFiche({
        nom: form.nom.trim(),
        prenom: form.prenom.trim() || null,
        email: form.email.trim(),
        telephone: form.telephone.trim() || null,
        creer_dossier: form.creer_dossier,
        type_assurance: form.type_assurance,
      });
      setClientId(res.client_id);
      setCreation(false);
      setMsg(
        res.dossier_reference
          ? `Fiche client et dossier ${res.dossier_reference} créés.`
          : "Fiche client créée.",
      );
      onCree();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={CARTE + " space-y-5 p-5"}>
      <div>
        <h3 className={TITRE_SECTION}>Traiter cet email</h3>
        <span className="mt-1.5 block h-0.5 w-10 bg-[color:var(--crm-gold)]" aria-hidden />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-muted">Client</span>
          <select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setDossierId("");
              setContratId("");
            }}
            className={CHAMP}
          >
            <option value="">— Aucun —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.prenom, c.nom].filter(Boolean).join(" ")} {c.email ? `· ${c.email}` : ""}
              </option>
            ))}
          </select>
          {clientSuggere && clientId !== clientSuggere.id && (
            <button onClick={() => setClientId(clientSuggere.id)} className="mt-1 text-xs text-[color:var(--crm-gold)] underline">
              Suggestion : {[clientSuggere.prenom, clientSuggere.nom].filter(Boolean).join(" ")}
            </button>
          )}
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-muted">Dossier / projet</span>
          <select
            value={dossierId}
            onChange={(e) => setDossierId(e.target.value)}
            disabled={!clientId}
            className={CHAMP + " disabled:opacity-50"}
          >
            <option value="">— Aucun —</option>
            {dossiers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.reference} · {d.type_assurance}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-muted">Contrat</span>
          <select
            value={contratId}
            onChange={(e) => setContratId(e.target.value)}
            disabled={!clientId}
            className={CHAMP + " disabled:opacity-50"}
          >
            <option value="">— Aucun —</option>
            {contrats.map((k) => (
              <option key={k.id} value={k.id}>
                {k.numero ?? "sans n°"} · {k.produit}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            onClick={enregistrer}
            disabled={busy || !clientId}
            className={BTN_PRIMAIRE}
          >
            {busy ? "…" : "Rattacher au client"}
          </button>
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-2 font-serif text-sm text-ink">Email d'une compagnie</p>
        <div className="flex flex-wrap items-end gap-3">
          <select
            value={compagnieId}
            onChange={(e) => setCompagnieId(e.target.value)}
            className={CHAMP}
          >
            <option value="">— Choisir une compagnie —</option>
            {compagnies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!compagnieId) return;
              setBusy(true);
              try {
                await onRattacherCompagnie(compagnieId);
                setMsg("Email rattaché à la fiche compagnie.");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || !compagnieId}
            className={BTN_SECONDAIRE}
          >
            Rattacher à la compagnie
          </button>
          {compagnieSuggeree && (
            <span className="text-xs text-ink-muted">Suggestion : {compagnieSuggeree.nom}</span>
          )}
          {compagnieId && (
            <Link
              to="/espace/compagnies/$id"
              params={{ id: compagnieId }}
              className="text-xs text-[color:var(--crm-gold)] underline underline-offset-4"
            >
              Ouvrir la fiche compagnie
            </Link>
          )}
        </div>
      </div>

      {triage && triage.prospect !== "non" && !lien?.client_id && (
        <div className="rounded-xl border border-[color:var(--crm-gold)] bg-surface p-4">
          <p className="text-sm font-medium text-ink">Créer un dossier ?</p>
          <p className="mt-1 text-xs text-ink-muted">
            L'analyse automatique hésite sur ce message
            {triage.branche ? ` (branche suggérée : ${triage.branche})` : ""}. {triage.resume}
          </p>
          <button
            onClick={() => {
              setForm((f) => ({
                ...f,
                nom: triage.nom || f.nom,
                prenom: triage.prenom || f.prenom,
                telephone: triage.telephone || f.telephone,
                creer_dossier: true,
                type_assurance: triage.branche || f.type_assurance,
              }));
              setCreation(true);
            }}
            className={BTN_SECONDAIRE + " mt-3"}
          >
            Créer le dossier suggéré
          </button>
        </div>
      )}

      <div className="border-t border-line pt-4">
        {!creation ? (
          <button onClick={() => setCreation(true)} className={BTN_SECONDAIRE}>
            + Créer une fiche client (et un dossier)
          </button>

        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Prénom"
              value={form.prenom}
              onChange={(e) => setForm({ ...form, prenom: e.target.value })}
              className={CHAMP}
            />
            <input
              placeholder="Nom *"
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              className={CHAMP}
            />
            <input
              placeholder="Email *"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={CHAMP}
            />
            <input
              placeholder="Téléphone"
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              className={CHAMP}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.creer_dossier}
                onChange={(e) => setForm({ ...form, creer_dossier: e.target.checked })}
              />
              Créer aussi un dossier
            </label>
            <select
              value={form.type_assurance}
              onChange={(e) => setForm({ ...form, type_assurance: e.target.value })}
              disabled={!form.creer_dossier}
              className={CHAMP + " disabled:opacity-50"}
            >
              {TYPES_ASSURANCE.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="flex gap-2 sm:col-span-2">
              <button
                onClick={creer}
                disabled={busy || !form.nom.trim() || !form.email.trim()}
                className={BTN_PRIMAIRE}
              >
                {busy ? "…" : "Créer"}
              </button>
              <button onClick={() => setCreation(false)} className={BTN_SECONDAIRE}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      {clientId && (
        <Link to="/espace/clients/$id" params={{ id: clientId }} className="text-xs text-[color:var(--crm-gold)] underline underline-offset-4">
          Ouvrir la fiche client
        </Link>
      )}
    </div>
  );
}


/** Étiquetage Gmail rapide : uniquement des étiquettes existantes du cabinet. */
function EtiquettesBloc({
  message,
  onEtiqueter,
}: {
  message: Resume;
  onEtiqueter: (etiquette: string) => Promise<void>;
}) {
  const [libre, setLibre] = useState("");
  const [choix, setChoix] = useState<string>(LABELS_CABINET.prospect_direct);

  return (
    <div className={CARTE + " p-5"}>
      <h3 className={TITRE_SECTION}>Étiquettes Gmail</h3>
      <span className="mt-1.5 block h-0.5 w-10 bg-[color:var(--crm-gold)]" aria-hidden />

      {message.etiquettes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {message.etiquettes.map((e) => (
            <span key={e} className="rounded-full bg-surface px-2.5 py-1 text-xs text-ink-soft">
              {e}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={choix} onChange={(e) => setChoix(e.target.value)} className={CHAMP + " min-w-64"}>
          {Object.values(LABELS_CABINET).map((nom) => (
            <option key={nom} value={nom}>
              {nom}
            </option>
          ))}
        </select>
        <button onClick={() => onEtiqueter(choix)} className={BTN_PRIMAIRE}>
          Étiqueter
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={libre}
          onChange={(e) => setLibre(e.target.value)}
          placeholder="Autre étiquette existante (nom exact)"
          className={CHAMP}
        />
        <button
          disabled={!libre.trim()}
          onClick={async () => {
            await onEtiqueter(libre.trim());
            setLibre("");
          }}
          className={BTN_SECONDAIRE}
        >
          Ajouter
        </button>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Les étiquettes utilisées sont celles de votre arborescence Gmail existante : aucune nouvelle branche n'est
        créée. Une étiquette saisie manuellement doit exister à l'identique dans Gmail, sinon l'action échoue.
      </p>
    </div>
  );
}

