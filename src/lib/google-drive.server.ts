/**
 * Accès Google Drive via la passerelle de connecteurs (serveur uniquement).
 * Toutes les requêtes passent par le connecteur google_drive du cabinet.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function headers() {
  const lovable = process.env["LOVABLE_API_KEY"];
  const connection = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovable || !connection) throw new Error("Connecteur Google Drive non configuré");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": connection,
  };
}

async function driveFetch(path: string, init?: RequestInit & { json?: unknown }) {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`${GATEWAY}${path}`, {
    ...rest,
    headers: {
      ...headers(),
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
    body: json ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[drive] ${path} → ${res.status} ${text.slice(0, 500)}`);
    throw new Error(`Google Drive ${res.status} : ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function escapeQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Recherche un dossier par nom dans un parent donné (racine par défaut). */
export async function trouverDossier(nom: string, parentId?: string | null): Promise<string | null> {
  const clauses = [
    `mimeType='${FOLDER_MIME}'`,
    `name='${escapeQuery(nom)}'`,
    "trashed=false",
    `'${parentId ?? "root"}' in parents`,
  ];
  const params = new URLSearchParams({
    q: clauses.join(" and "),
    fields: "files(id,name)",
    pageSize: "10",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const data = (await driveFetch(`/drive/v3/files?${params}`)) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

/** Retourne l'ID du dossier, en le créant s'il n'existe pas encore. */
export async function assurerDossier(nom: string, parentId?: string | null): Promise<string> {
  const existant = await trouverDossier(nom, parentId);
  if (existant) return existant;
  const cree = (await driveFetch("/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    json: { name: nom, mimeType: FOLDER_MIME, parents: [parentId ?? "root"] },
  })) as { id: string };
  return cree.id;
}

/** Crée (ou retrouve) une arborescence complète et renvoie l'ID du dernier niveau. */
export async function assurerChemin(segments: string[], parentId?: string | null): Promise<string> {
  let courant = parentId ?? "root";
  for (const segment of segments) {
    courant = await assurerDossier(segment, courant);
  }
  return courant;
}

export function urlDossierDrive(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Dépose un fichier binaire (PDF) dans un dossier Drive.
 * Le contenu est envoyé en multipart/related (upload simple).
 */
export async function deposerFichier(params: {
  folderId: string;
  nom: string;
  contenu: Uint8Array;
  mimeType?: string;
}): Promise<{ id: string; webViewLink: string | null }> {
  const boundary = `ejp-${crypto.randomUUID()}`;
  const mime = params.mimeType ?? "application/pdf";
  const metadata = JSON.stringify({ name: params.nom, parents: [params.folderId] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
    `${toBase64(params.contenu)}\r\n--${boundary}--\r\n`;

  const res = await fetch(
    `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`,
    {
      method: "POST",
      headers: { ...headers(), "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) {
    console.error(`[drive] upload ${params.nom} → ${res.status} ${text.slice(0, 500)}`);
    throw new Error(`Google Drive upload ${res.status} : ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as { id: string; webViewLink?: string };
  return { id: data.id, webViewLink: data.webViewLink ?? null };
}
