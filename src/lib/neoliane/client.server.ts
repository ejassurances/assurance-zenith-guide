/**
 * Client HTTP Néoliane — SERVEUR UNIQUEMENT.
 *
 * Responsabilités :
 *  - obtention et cache mémoire de l'access_token OAuth2 (client_credentials),
 *    avec renouvellement automatique avant expiration (expires_in = 86400 s) ;
 *  - alternative Basic Auth (base64(client_id:client_secret)) ;
 *  - injection du `userApiKey` dans le payload des endpoints qui l'exigent.
 *
 * Aucun endpoint métier n'est supposé ici : seule l'authentification est
 * connue. Les modules métier (tarification, souscription, …) fournissent le
 * chemin et le payload.
 */

import {
  NEOLIANE_BASE_URL,
  NEOLIANE_TOKEN_PATH,
  NeolianeApiError,
  NeolianeNotConfiguredError,
  neolianeConfigStatus,
  readNeolianeCredentials,
  type NeolianeAuthMode,
} from "./config";

type TokenCache = { accessToken: string; expiresAt: number; fingerprint: string };

/** Cache process-local (une instance = un worker). */
let tokenCache: TokenCache | null = null;

/** Marge de sécurité : on renouvelle 5 min avant l'expiration réelle. */
const RENEW_MARGIN_MS = 5 * 60 * 1000;

function fingerprint(clientId: string, clientSecret: string) {
  return `${clientId}:${clientSecret.length}`;
}

function requireCredentials() {
  const creds = readNeolianeCredentials();
  if (!creds.clientId || !creds.clientSecret) {
    throw new NeolianeNotConfiguredError(neolianeConfigStatus().message);
  }
  return creds;
}

export function basicAuthHeader(): string {
  const { clientId, clientSecret } = requireCredentials();
  const raw = `${clientId}:${clientSecret}`;
  const b64 =
    typeof Buffer !== "undefined" ? Buffer.from(raw, "utf8").toString("base64") : btoa(raw);
  return `Basic ${b64}`;
}

/** Invalide le cache (utile après rotation des secrets ou 401). */
export function resetNeolianeToken() {
  tokenCache = null;
}

/** Récupère un access_token valide, depuis le cache si possible. */
export async function getNeolianeAccessToken(force = false): Promise<{
  accessToken: string;
  expiresAt: number;
  fromCache: boolean;
}> {
  const { clientId, clientSecret } = requireCredentials();
  const fp = fingerprint(clientId, clientSecret);
  const now = Date.now();

  if (
    !force &&
    tokenCache &&
    tokenCache.fingerprint === fp &&
    tokenCache.expiresAt - RENEW_MARGIN_MS > now
  ) {
    return {
      accessToken: tokenCache.accessToken,
      expiresAt: tokenCache.expiresAt,
      fromCache: true,
    };
  }

  const res = await fetch(`${NEOLIANE_BASE_URL}${NEOLIANE_TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* réponse non JSON : on garde le texte brut */
  }

  if (!res.ok) {
    throw new NeolianeApiError(
      `Échec de l'authentification Néoliane (HTTP ${res.status})`,
      res.status,
      body,
    );
  }

  const parsed = body as { access_token?: string; expires_in?: number; token_type?: string } | null;
  if (!parsed?.access_token) {
    throw new NeolianeApiError("Réponse Néoliane sans access_token", res.status, body);
  }

  const expiresAt = now + (parsed.expires_in ?? 86400) * 1000;
  tokenCache = { accessToken: parsed.access_token, expiresAt, fingerprint: fp };
  return { accessToken: parsed.access_token, expiresAt, fromCache: false };
}

export interface NeolianeRequestOptions {
  /** Chemin relatif à https://api.neoliane.fr (ex. "/neoverse/..."). */
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Payload JSON (objet). */
  payload?: Record<string, unknown> | undefined;
  /** Mode d'authentification. Par défaut OAuth2 avec fallback Basic sur 401. */
  authMode?: NeolianeAuthMode;
  /** Ajoute le userApiKey dans le payload (endpoints qui l'exigent). */
  withUserApiKey?: boolean;
  /** Nom de la clé attendue dans le payload pour le userApiKey. */
  userApiKeyField?: string;
  /** En-têtes additionnels. */
  headers?: Record<string, string>;
}

export interface NeolianeResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  authMode: NeolianeAuthMode;
}

/**
 * Appel générique authentifié. Toute extension future (gestion de contrat,
 * éditique, …) passe par cette fonction : rien d'autre à réécrire.
 */
export async function neolianeRequest<T = unknown>(
  options: NeolianeRequestOptions,
): Promise<NeolianeResponse<T>> {
  const {
    path,
    method = "POST",
    payload,
    authMode = "oauth2",
    withUserApiKey = false,
    userApiKeyField = "userApiKey",
    headers = {},
  } = options;

  const creds = requireCredentials();
  let body: Record<string, unknown> | undefined = payload ? { ...payload } : undefined;

  if (withUserApiKey) {
    if (!creds.userApiKey) {
      throw new NeolianeNotConfiguredError(
        "NEOLIANE_USER_API_KEY est requis pour cet endpoint. À générer depuis l'extranet Néoliane (Mon Compte > Accès externes) puis à ajouter dans Paramètres du projet → Secrets.",
      );
    }
    body = { ...(body ?? {}), [userApiKeyField]: creds.userApiKey };
  }

  const send = async (mode: NeolianeAuthMode) => {
    const authHeader =
      mode === "basic"
        ? basicAuthHeader()
        : `Bearer ${(await getNeolianeAccessToken()).accessToken}`;

    const res = await fetch(`${NEOLIANE_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        Authorization: authHeader,
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* texte brut */
    }
    return { res, data };
  };

  let attempt = await send(authMode);

  // Token périmé ou révoqué : on renouvelle une fois, puis on tente Basic Auth.
  if (attempt.res.status === 401 && authMode === "oauth2") {
    resetNeolianeToken();
    attempt = await send("oauth2");
    if (attempt.res.status === 401) {
      const fallback = await send("basic");
      return {
        ok: fallback.res.ok,
        status: fallback.res.status,
        data: fallback.data as T,
        authMode: "basic",
      };
    }
  }

  return {
    ok: attempt.res.ok,
    status: attempt.res.status,
    data: attempt.data as T,
    authMode,
  };
}
