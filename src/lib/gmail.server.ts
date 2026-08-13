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

/** Envoie un email HTML depuis la boîte du cabinet. */
export async function envoyerMessage(params: {
  to: string;
  cc?: string | null;
  sujet: string;
  html: string;
  threadId?: string | null;
}): Promise<{ id: string; threadId: string }> {
  const lignes = [
    `To: ${params.to}`,
    ...(params.cc ? [`Cc: ${params.cc}`] : []),
    `Subject: ${encodeSujet(params.sujet)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    params.html,
  ];
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

/** Récupère (ou crée) une étiquette Gmail par nom, imbriquée avec « / ». */
export async function assurerLabel(nom: string): Promise<string> {
  const { labels } = await gmailFetch<{ labels?: GmailLabel[] }>("/users/me/labels");
  const existant = (labels ?? []).find((l) => l.name.toLowerCase() === nom.toLowerCase());
  if (existant) return existant.id;
  const cree = await gmailFetch<GmailLabel>("/users/me/labels", {
    method: "POST",
    body: JSON.stringify({
      name: nom,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });
  return cree.id;
}

/** Applique une étiquette CRM (créée si besoin) à un message. */
export async function etiqueterMessage(id: string, nom: string): Promise<void> {
  const labelId = await assurerLabel(nom);
  await modifierLabels(id, { ajouter: [labelId] });
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
