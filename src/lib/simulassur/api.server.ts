/**
 * Client HTTP unique de l'API Simulassur — SERVEUR UNIQUEMENT.
 *
 * Centralise l'authentification (X-API-ID / X-API-KEY), le timeout, le parsing
 * JSON, l'erreur normalisée et la journalisation technique. Aucun secret,
 * aucun document Base64, aucune URL d'activation et aucune donnée d'identité
 * ne sont journalisés ni relayés dans les messages d'erreur.
 */

import { readSimulassurCredentials } from "./config";

export interface SimulassurErreur {
  code: string;
  message: string;
  retriable: boolean;
}

export interface SimulassurAppel<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  erreur?: SimulassurErreur;
  correlationId: string;
  dureeMs: number;
}

/** Retire toute trace de secret d'un texte avant journalisation ou affichage. */
export function masquerSecretsSimulassur(texte: string): string {
  const c = readSimulassurCredentials();
  let out = texte ?? "";
  for (const v of [c.apiKey, c.apiId, c.brokerCode, c.source]) {
    if (v && v.length >= 4) out = out.split(v).join("***");
  }
  // Sécurité supplémentaire : neutralise tout Base64 volumineux et les liens d'activation.
  out = out.replace(/[A-Za-z0-9+/]{200,}={0,2}/g, "[document]");
  out = out.replace(/https?:\/\/\S*(activation|activate|token)\S*/gi, "[lien masqué]");
  return out;
}

function messageErreur(status: number, data: unknown): SimulassurErreur {
  const o = (data ?? {}) as Record<string, unknown>;
  const brut =
    (typeof o["MESSAGE"] === "string" && o["MESSAGE"]) ||
    (typeof o["message"] === "string" && o["message"]) ||
    (typeof o["error"] === "string" && o["error"]) ||
    "";

  const table: Record<number, SimulassurErreur> = {
    400: {
      code: "donnees_invalides",
      message: "Simulassur a refusé les données transmises : vérifiez le dossier avant de relancer.",
      retriable: false,
    },
    401: {
      code: "authentification",
      message: "Authentification Simulassur refusée : les identifiants API doivent être vérifiés.",
      retriable: false,
    },
    403: {
      code: "permission",
      message: "Action non autorisée par Simulassur pour ce code courtier.",
      retriable: false,
    },
    404: {
      code: "introuvable",
      message: "Ressource introuvable chez Simulassur (devis ou produit inconnu).",
      retriable: false,
    },
    500: {
      code: "indisponible",
      message: "Simulassur a rencontré une erreur technique : réessayez dans quelques minutes.",
      retriable: true,
    },
  };

  const base =
    table[status] ??
    ({
      code: `http_${status}`,
      message: `Réponse inattendue de Simulassur (HTTP ${status}).`,
      retriable: status >= 500,
    } satisfies SimulassurErreur);

  return brut
    ? { ...base, message: `${base.message} ${masquerSecretsSimulassur(brut).slice(0, 200)}`.trim() }
    : base;
}

/** Journalise l'appel sans secret ni donnée personnelle. */
async function journaliser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any | null,
  ligne: {
    correlationId: string;
    endpoint: string;
    methode: string;
    status: number | null;
    dureeMs: number;
    ok: boolean;
    erreur?: string | undefined;
    dossierId?: string | null | undefined;
  },
) {
  if (!supabase) return;
  try {
    await supabase.from("simulassur_evenements").insert({
      correlation_id: ligne.correlationId,
      endpoint: ligne.endpoint,
      methode: ligne.methode,
      http_status: ligne.status,
      duree_ms: ligne.dureeMs,
      ok: ligne.ok,
      erreur: ligne.erreur ? masquerSecretsSimulassur(ligne.erreur).slice(0, 500) : null,
      dossier_id: ligne.dossierId ?? null,
    });
  } catch (e) {
    console.error("[simulassur] journal technique non écrit", e);
  }
}

/**
 * Appel générique de l'API Simulassur. `path` commence par « / ».
 */
export async function callSimulassur<T = unknown>(params: {
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
  timeoutMs?: number;
  /** Client Supabase pour le journal technique (facultatif). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase?: any | null;
  dossierId?: string | null;
}): Promise<SimulassurAppel<T>> {
  const creds = readSimulassurCredentials();
  const correlationId = crypto.randomUUID();
  const debut = Date.now();

  if (!creds.apiId || !creds.apiKey) {
    throw new Error(
      "Intégration Simulassur non configurée : renseignez les secrets SIMULASSUR_API_ID et SIMULASSUR_API_KEY avant tout appel.",
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), params.timeoutMs ?? 45_000);
  try {
    const res = await fetch(`${creds.baseUrl}${params.path}`, {
      method: params.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-ID": creds.apiId,
        "X-API-KEY": creds.apiKey,
      },
      ...(params.body === undefined ? {} : { body: JSON.stringify(params.body) }),
      signal: ctrl.signal,
    });

    const brut = await res.text();
    let data: unknown = brut;
    try {
      data = brut ? JSON.parse(brut) : null;
    } catch {
      data = masquerSecretsSimulassur(brut).slice(0, 500);
    }

    const dureeMs = Date.now() - debut;
    // 206 = succès partiel du suivi : les données disponibles sont exploitables.
    const ok = res.status >= 200 && res.status < 300;
    const erreur = ok ? undefined : messageErreur(res.status, data);

    await journaliser(params.supabase ?? null, {
      correlationId,
      endpoint: params.path,
      methode: params.method,
      status: res.status,
      dureeMs,
      ok,
      erreur: erreur?.message,
      dossierId: params.dossierId ?? null,
    });

    return { ok, status: res.status, data: data as T, ...(erreur ? { erreur } : {}), correlationId, dureeMs };
  } catch (e) {
    const dureeMs = Date.now() - debut;
    const abandon = e instanceof Error && e.name === "AbortError";
    const erreur: SimulassurErreur = abandon
      ? { code: "timeout", message: "Simulassur n'a pas répondu dans le délai imparti.", retriable: true }
      : {
          code: "reseau",
          message: masquerSecretsSimulassur(
            e instanceof Error ? e.message : "Appel Simulassur impossible",
          ).slice(0, 200),
          retriable: true,
        };
    await journaliser(params.supabase ?? null, {
      correlationId,
      endpoint: params.path,
      methode: params.method,
      status: null,
      dureeMs,
      ok: false,
      erreur: erreur.message,
      dossierId: params.dossierId ?? null,
    });
    return { ok: false, status: 0, erreur, correlationId, dureeMs };
  } finally {
    clearTimeout(timer);
  }
}
