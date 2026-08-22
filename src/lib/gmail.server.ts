import {
  ARCHIVE,
  A_VALIDER,
  COUPLES_LABELS,
  LABELS_CABINET,
  LABELS_CREABLES,
  LABELS_ETATS,
  type LabelCabinet,
} from "@/lib/gmail-labels";


/**
 * Accès Gmail (boîte du cabinet) via la passerelle de connecteurs Lovable.
 * Server-only : n'importez jamais ce fichier depuis un composant.
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

/** Requête « boîte principale » : onglet Principal de la boîte de réception. */
export const REQUETE_BOITE_PRINCIPALE = "in:inbox category:primary";

function headers() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gmailKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY n'est pas configurée");
  if (!gmailKey) throw new Error("GOOGLE_MAIL_API_KEY n'est pas configurée (connecteur Gmail)");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gmailKey,
    "Content-Type": "application/json",
  };
}

async function gmailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { ...init, headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Gmail ${path} [${res.status}]: ${body}`);
    throw new Error(`Gmail a répondu ${res.status} : ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

function decodeB64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

function header(msg: GmailMessage, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

/** « Nom <email> » → parties séparées. */
export function parseFrom(value: string): { nom: string | null; email: string | null } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { nom: match[1]?.replace(/^"|"$/g, "") || null, email: match[2]!.toLowerCase() };
  const trimmed = value.trim();
  return { nom: null, email: trimmed ? trimmed.toLowerCase() : null };
}

export interface EmailResume {
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
}

const LABELS_SYSTEME = /^(INBOX|SENT|DRAFT|SPAM|TRASH|UNREAD|STARRED|IMPORTANT|CATEGORY_.*|CHAT)$/;

function toResume(msg: GmailMessage, nomsLabels?: Map<string, string>): EmailResume {
  const from = parseFrom(header(msg, "From"));
  const dateHeader = header(msg, "Date");
  const ts = msg.internalDate ? Number(msg.internalDate) : Date.parse(dateHeader);
  return {
    id: msg.id,
    thread_id: msg.threadId,
    sujet: header(msg, "Subject") || "(sans objet)",
    expediteur_nom: from.nom,
    expediteur_email: from.email,
    destinataires: header(msg, "To"),
    snippet: msg.snippet ?? "",
    date: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
    non_lu: (msg.labelIds ?? []).includes("UNREAD"),
    etiquettes: nomsLabels
      ? (msg.labelIds ?? [])
          .map((id) => nomsLabels.get(id))
          .filter((n): n is string => !!n && !LABELS_SYSTEME.test(n.toUpperCase()))
      : [],
  };
}

/** Liste les messages de la boîte principale (métadonnées uniquement). */
export async function listerBoitePrincipale(params: {
  recherche?: string | null;
  pageToken?: string | null;
  maxResults?: number;
}): Promise<{ messages: EmailResume[]; nextPageToken: string | null }> {
  const q = [REQUETE_BOITE_PRINCIPALE, params.recherche?.trim()].filter(Boolean).join(" ");
  const search = new URLSearchParams({
    q,
    maxResults: String(params.maxResults ?? 25),
  });
  if (params.pageToken) search.set("pageToken", params.pageToken);

  const list = await gmailFetch<{
    messages?: { id: string }[];
    nextPageToken?: string;
  }>(`/users/me/messages?${search.toString()}`);

  const ids = (list.messages ?? []).map((m) => m.id);
  const details = await Promise.all(
    ids.map((id) =>
      gmailFetch<GmailMessage>(
        `/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      ).catch(() => null),
    ),
  );

  const { labels } = await gmailFetch<{ labels?: { id: string; name: string }[] }>("/users/me/labels").catch(
    () => ({ labels: [] as { id: string; name: string }[] }),
  );
  const nomsLabels = new Map((labels ?? []).map((l) => [l.id, l.name] as const));

  return {
    messages: details.filter((m): m is GmailMessage => !!m).map((m) => toResume(m, nomsLabels)),
    nextPageToken: list.nextPageToken ?? null,
  };
}

/**
 * Étiquette parent servant de filet de rattrapage manuel : le staff pose
 * « Direction Commerciale » SEUL (sans sous-étiquette) sur un message mal
 * classé ou non classé pour demander sa réanalyse par le job de tri.
 */
export const LABEL_PARENT_RATTRAPAGE = "Direction Commerciale";

/**
 * Messages en rattrapage : porteurs du seul label parent « Direction
 * Commerciale », sans aucune sous-étiquette de service. Indépendant du statut
 * lu / non lu et de la présence dans la boîte de réception.
 */
/** Messages portant une étiquette donnée (nom exact), métadonnées uniquement. */
export async function listerParLabel(nom: string, maxResults = 100): Promise<EmailResume[]> {
  const nomReel = await nomLabelReel(nom);
  const search = new URLSearchParams({ q: `label:"${nomReel}"`, maxResults: String(Math.min(maxResults, 200)) });
  const list = await gmailFetch<{ messages?: { id: string }[] }>(`/users/me/messages?${search.toString()}`);

  const ids = (list.messages ?? []).map((m) => m.id);
  if (!ids.length) return [];
  const details = await Promise.all(
    ids.map((id) =>
      gmailFetch<GmailMessage>(
        `/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      ).catch(() => null),
    ),
  );
  const { labels } = await gmailFetch<{ labels?: { id: string; name: string }[] }>("/users/me/labels").catch(() => ({
    labels: [] as { id: string; name: string }[],
  }));
  const nomsLabels = new Map((labels ?? []).map((l) => [l.id, l.name] as const));
  return details.filter((m): m is GmailMessage => !!m).map((m) => toResume(m, nomsLabels));
}

/**
 * Ancien filet de rattrapage (label parent posé seul) : sans objet depuis le
 * passage à une arborescence à plat — « Direction Commerciale » EST désormais la
 * file de travail, lue directement par les agents.
 */
export async function listerRattrapage(_params?: { maxResults?: number }): Promise<EmailResume[]> {
  return [];
}

/** Sans objet depuis l'arborescence à plat : ne retire plus aucune étiquette. */
export async function retirerLabelRattrapage(_id: string): Promise<void> {
  return;
}



function collecterCorps(part: GmailPart | undefined, out: { texte: string[]; html: string[] }) {
  if (!part) return;
  if (part.body?.data && !part.filename) {
    if (part.mimeType === "text/plain") out.texte.push(decodeB64Url(part.body.data));
    else if (part.mimeType === "text/html") out.html.push(decodeB64Url(part.body.data));
  }
  for (const p of part.parts ?? []) collecterCorps(p, out);
}

export interface EmailDetail extends EmailResume {
  cc: string;
  texte: string | null;
  html: string | null;
  pieces_jointes: { nom: string; taille: number | null; mime: string | null; attachment_id: string | null }[];
}

/** Contenu complet d'un message. */
export async function lireMessage(id: string): Promise<EmailDetail> {
  const msg = await gmailFetch<GmailMessage>(`/users/me/messages/${id}?format=full`);
  const out = { texte: [] as string[], html: [] as string[] };
  collecterCorps(msg.payload, out);

  const pieces: EmailDetail["pieces_jointes"] = [];
  const walk = (p?: GmailPart) => {
    if (!p) return;
    if (p.filename)
      pieces.push({
        nom: p.filename,
        taille: p.body?.size ?? null,
        mime: p.mimeType ?? null,
        attachment_id: p.body?.attachmentId ?? null,
      });
    for (const c of p.parts ?? []) walk(c);
  };
  walk(msg.payload);

  return {
    ...toResume(msg),
    cc: header(msg, "Cc"),
    texte: out.texte.join("\n") || null,
    html: out.html.join("\n") || null,
    pieces_jointes: pieces,
  };
}

/** Télécharge une pièce jointe (contenu en base64 standard). */
export async function telechargerPieceJointe(
  messageId: string,
  attachmentId: string,
): Promise<{ base64: string; taille: number }> {
  const att = await gmailFetch<{ data?: string; size?: number }>(
    `/users/me/messages/${messageId}/attachments/${attachmentId}`,
  );
  if (!att.data) throw new Error("Pièce jointe introuvable dans Gmail.");
  return { base64: att.data.replace(/-/g, "+").replace(/_/g, "/"), taille: att.size ?? 0 };
}


function encodeB64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeSujet(sujet: string): string {
  // RFC 2047 pour préserver les accents.
  return /^[\x20-\x7E]*$/.test(sujet) ? sujet : `=?UTF-8?B?${encodeB64Url(sujet).replace(/-/g, "+").replace(/_/g, "/")}?=`;
}

/**
 * Envoie un email HTML depuis la boîte du cabinet (adresse d'entreprise).
 * Les pièces jointes sont transmises en base64 (multipart/mixed).
 */
export async function envoyerMessage(params: {
  to: string;
  cc?: string | null;
  sujet: string;
  html: string;
  threadId?: string | null;
  from?: string | null;
  replyTo?: string | null;
  attachments?: { name: string; base64: string; mime?: string }[];
}): Promise<{ id: string; threadId: string }> {
  const entetes = [
    `To: ${params.to}`,
    ...(params.cc ? [`Cc: ${params.cc}`] : []),
    ...(params.from ? [`From: ${params.from}`] : []),
    ...(params.replyTo ? [`Reply-To: ${params.replyTo}`] : []),
    `Subject: ${encodeSujet(params.sujet)}`,
    "MIME-Version: 1.0",
  ];

  let lignes: string[];
  if (params.attachments && params.attachments.length > 0) {
    const frontiere = `ejp_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    lignes = [
      ...entetes,
      `Content-Type: multipart/mixed; boundary="${frontiere}"`,
      "",
      `--${frontiere}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 7bit",
      "",
      params.html,
      ...params.attachments.flatMap((a) => [
        `--${frontiere}`,
        `Content-Type: ${a.mime ?? "application/pdf"}; name="${a.name}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${a.name}"`,
        "",
        ...(a.base64.match(/.{1,76}/g) ?? []),
      ]),
      `--${frontiere}--`,
      "",
    ];
  } else {
    lignes = [...entetes, 'Content-Type: text/html; charset="UTF-8"', "", params.html];
  }

  const body: Record<string, unknown> = { raw: encodeB64Url(lignes.join("\r\n")) };
  if (params.threadId) body["threadId"] = params.threadId;

  return await gmailFetch<{ id: string; threadId: string }>("/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Modifie les étiquettes Gmail d'un message. */
export async function modifierLabels(
  id: string,
  params: { ajouter?: string[]; retirer?: string[] },
): Promise<void> {
  await gmailFetch(`/users/me/messages/${id}/modify`, {
    method: "POST",
    body: JSON.stringify({
      addLabelIds: params.ajouter ?? [],
      removeLabelIds: params.retirer ?? [],
    }),
  });
}

/** Met un message à la corbeille Gmail (purge automatique après 30 jours). */
export async function mettreCorbeille(id: string): Promise<void> {
  await gmailFetch(`/users/me/messages/${id}/trash`, { method: "POST", body: "{}" });
}

/** Archive un message (retire de la boîte de réception). */
export async function archiverMessage(id: string): Promise<void> {
  await modifierLabels(id, { retirer: ["INBOX"] });
}

/** Marque un message comme lu ou non lu. */
export async function marquerLu(id: string, lu: boolean): Promise<void> {
  await modifierLabels(id, lu ? { retirer: ["UNREAD"] } : { ajouter: ["UNREAD"] });
}

type GmailLabel = { id: string; name: string };

export { LABELS_CABINET, type LabelCabinet };


async function listerLabels(): Promise<GmailLabel[]> {
  const { labels } = await gmailFetch<{ labels?: GmailLabel[] }>("/users/me/labels");
  return labels ?? [];
}

/**
 * La boîte du cabinet n'utilise pas toujours le chemin complet d'une étiquette :
 * « Service Partenaire/A_Traiter » existe sans le parent « Direction
 * Commerciale/ ». On accepte donc l'étiquette réelle dont le nom est un suffixe
 * du chemin attendu (le plus long d'abord) — jamais une autre étiquette.
 */
function trouverLabel(labels: GmailLabel[], nom: string): GmailLabel | null {
  const attendu = nom.toLowerCase();
  const exact = labels.find((l) => l.name.toLowerCase() === attendu);
  if (exact) return exact;
  const segments = nom.split("/");
  for (let i = 1; i < segments.length; i++) {
    const suffixe = segments.slice(i).join("/").toLowerCase();
    const trouve = labels.find((l) => l.name.toLowerCase() === suffixe);
    if (trouve) return trouve;
  }
  return null;
}

/** Nom réellement utilisé dans Gmail pour une étiquette attendue du cabinet. */
export async function nomLabelReel(nom: string): Promise<string> {
  const labels = await listerLabels().catch(() => [] as GmailLabel[]);
  return trouverLabel(labels, nom)?.name ?? nom;
}

/**
 * Résolution d'une étiquette : renvoie l'identifiant de l'étiquette existante
 * (chemin exact ou suffixe réellement utilisé dans la boîte), ou la crée
 * uniquement si elle fait partie des sous-libellés validés. Sinon l'erreur est
 * propagée (pas de doublon silencieux).
 */
export async function resoudreLabel(nom: string): Promise<string> {
  const labels = await listerLabels();
  const existant = trouverLabel(labels, nom);
  if (existant) return existant.id;
  if (!LABELS_CREABLES.includes(nom)) {
    throw new Error(
      `Étiquette Gmail « ${nom} » introuvable dans la boîte du cabinet : aucune étiquette n'a été créée ni posée.`,
    );
  }
  const cree = await gmailFetch<GmailLabel>("/users/me/labels", {
    method: "POST",
    body: JSON.stringify({ name: nom, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return cree.id;
}


/**
 * Applique les libellés du cabinet à un message. Structure à plat : on pose le
 * libellé de DIRECTION et, s'il y en a un, le libellé d'ÉTAT (« A valider » ou
 * « Archives ») — deux libellés indépendants, jamais un libellé composé. Poser
 * « Archives » retire « A valider » (et inversement), le libellé de direction
 * reste toujours en place. Aucune erreur n'est avalée.
 *
 * Règle cabinet : la boîte de réception générale reste gérée manuellement par le
 * dirigeant — l'étiquetage NE retire donc PAS INBOX. Un mail portant seulement
 * son libellé de direction est implicitement « à traiter ». Passer
 * `sortirDeLInbox: true` pour un cas particulier (corbeille / archivage).
 */
export async function poserLabelCabinet(
  id: string,
  cle: LabelCabinet,
  options?: { retirer?: LabelCabinet[]; sortirDeLInbox?: boolean },
): Promise<void> {
  const couple = COUPLES_LABELS[cle];
  const noms = [couple.direction, couple.etat].filter((n): n is string => !!n);
  const ajouter = await Promise.all([...new Set(noms)].map((n) => resoudreLabel(n)));

  // États à retirer : l'autre état partagé (un seul état à la fois), plus les
  // états explicitement demandés par l'appelant. Jamais un libellé de direction.
  const etatsARetirer = new Set<string>();
  for (const etat of LABELS_ETATS) if (etat !== couple.etat) etatsARetirer.add(etat);
  for (const c of options?.retirer ?? []) {
    const e = COUPLES_LABELS[c].etat;
    if (e && e !== couple.etat) etatsARetirer.add(e);
  }
  const resolus = await Promise.all(
    [...etatsARetirer].map((n) => resoudreLabel(n).catch(() => null)),
  );
  const retirer = resolus.filter((l): l is string => !!l && !ajouter.includes(l));
  if (options?.sortirDeLInbox) retirer.push("INBOX");
  await modifierLabels(id, { ajouter, retirer });
}

/**
 * Pose UNIQUEMENT un libellé d'état (« Archives » ou « A valider ») sans
 * toucher au libellé de direction déjà posé par le staff : utilisé par les
 * agents qui terminent le traitement d'un mail rangé dans n'importe quelle
 * direction (finance, veille, arbitrage interne, relation client).
 */
export async function marquerEtat(id: string, etat: "archives" | "a_valider"): Promise<void> {
  const cible = etat === "archives" ? ARCHIVE : A_VALIDER;
  const ajouter = [await resoudreLabel(cible)];
  const autres = await Promise.all(
    LABELS_ETATS.filter((e) => e !== cible).map((e) => resoudreLabel(e).catch(() => null)),
  );
  const retirer = autres.filter((l): l is string => !!l && !ajouter.includes(l));
  await modifierLabels(id, { ajouter, retirer });
}



/**
 * Applique une étiquette Gmail existante, désignée par son nom exact. Le message
 * reste dans la boîte générale (gérée manuellement) sauf `sortirDeLInbox`.
 */
export async function etiqueterMessage(
  id: string,
  nom: string,
  options?: { sortirDeLInbox?: boolean },
): Promise<void> {
  const labelId = await resoudreLabel(nom);
  await modifierLabels(id, {
    ajouter: [labelId],
    retirer: options?.sortirDeLInbox ? ["INBOX"] : [],
  });
}


/**
 * Files de travail des agents : les trois étiquettes de direction. Le libellé de
 * direction est posé MANUELLEMENT par le staff depuis la boîte principale ; les
 * agents ne lisent QUE ces files, jamais l'inbox.
 */
export const FILES_A_TRAITER: readonly LabelCabinet[] = [
  "gc_a_traiter", // Direction Commerciale
  "achat_a_traiter", // Direction Financiere
  "rec_a_traiter", // Direction Juridique et Conformite
];

/**
 * Messages en attente de traitement : union des étiquettes de direction (noms
 * dédoublonnés). Aucune lecture de la boîte de réception générale.
 */
export async function listerFilesATraiter(params?: {
  maxParFile?: number;
}): Promise<EmailResume[]> {
  const maxParFile = Math.max(1, Math.min(params?.maxParFile ?? 25, 100));
  const parId = new Map<string, EmailResume>();
  const noms = [...new Set(FILES_A_TRAITER.map((cle) => LABELS_CABINET[cle]))];
  const etats = LABELS_ETATS.map((e) => e.toLowerCase());
  for (const nom of noms) {
    const messages = await listerParLabel(nom, maxParFile).catch((e) => {
      console.error(`[files-a-traiter] lecture de « ${nom} » impossible`, e);
      return [] as EmailResume[];
    });
    for (const m of messages) {
      // Structure à plat : le libellé de direction reste posé après traitement.
      // La SEULE marque de traitement est un libellé d'état (« Archives » ou
      // « A valider ») — un mail qui en porte un n'est plus à traiter.
      const traite = m.etiquettes.some((e) => etats.includes(e.trim().toLowerCase()));
      if (traite) continue;
      if (!parId.has(m.id)) parId.set(m.id, m);
    }
  }
  return [...parId.values()];
}

/** Un message porte-t-il déjà un libellé d'état (« Archives » / « A valider ») ? */
export function porteEtatTraitement(etiquettes: string[]): boolean {
  const etats = LABELS_ETATS.map((e) => e.toLowerCase());
  return etiquettes.some((e) => etats.includes(e.trim().toLowerCase()));
}





/**
 * Nettoyage fiable d'étiquettes : au lieu de résoudre des noms attendus (qui
 * peut échouer si une étiquette n'existe pas, et qui ne voit pas les étiquettes
 * réellement posées), on lit les étiquettes RÉELLES du message et on retire
 * toutes celles dont le nom commence par l'un des préfixes donnés. Le retrait
 * est ensuite vérifié par relecture (une tentative de plus si nécessaire), pour
 * qu'aucun doublon ne subsiste silencieusement (course avec un autre agent).
 */
export async function retirerLabelsParPrefixe(
  id: string,
  prefixes: string[],
): Promise<{ retires: string[] }> {
  const bas = prefixes.map((p) => p.toLowerCase());
  const concerne = (nom: string) => bas.some((p) => nom.toLowerCase().startsWith(p));

  const labels = await listerLabels();
  const parId = new Map(labels.map((l) => [l.id, l.name] as const));
  const retires: string[] = [];

  for (let tentative = 0; tentative < 2; tentative++) {
    const msg = await gmailFetch<GmailMessage>(`/users/me/messages/${id}?format=minimal`);
    const aRetirer = (msg.labelIds ?? []).filter((lid) => {
      const nom = parId.get(lid);
      return !!nom && concerne(nom);
    });
    if (!aRetirer.length) return { retires };
    await modifierLabels(id, { retirer: aRetirer });
    for (const lid of aRetirer) {
      const nom = parId.get(lid);
      if (nom && !retires.includes(nom)) retires.push(nom);
    }
  }

  const final = await gmailFetch<GmailMessage>(`/users/me/messages/${id}?format=minimal`);
  const restants = (final.labelIds ?? [])
    .map((lid) => parId.get(lid))
    .filter((n): n is string => !!n && concerne(n));
  if (restants.length) {
    throw new Error(`Étiquettes non retirées sur ${id} : ${restants.join(", ")}`);
  }
  return { retires };
}




/** Étiquettes lisibles d'un message (hors étiquettes système). */
export async function etiquettesMessage(id: string): Promise<string[]> {
  const [msg, { labels }] = await Promise.all([
    gmailFetch<GmailMessage>(`/users/me/messages/${id}?format=minimal`),
    gmailFetch<{ labels?: GmailLabel[] }>("/users/me/labels"),
  ]);
  const noms = new Map((labels ?? []).map((l) => [l.id, l.name] as const));
  return (msg.labelIds ?? [])
    .map((id2) => noms.get(id2))
    .filter((n): n is string => !!n && !/^(INBOX|SENT|DRAFT|SPAM|TRASH|UNREAD|STARRED|IMPORTANT|CATEGORY_.*|CHAT)$/.test(n.toUpperCase()));
}
