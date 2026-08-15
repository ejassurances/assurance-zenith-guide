/**
 * Configuration de l'intégration Simulassur (API B2B v2.0 — assurance
 * emprunteur).
 *
 * Les identifiants ne figurent jamais dans le code et n'atteignent jamais le
 * navigateur : ils sont lus dans les secrets serveur du projet.
 *   - SIMULASSUR_API_ID       (obligatoire — header X-API-ID, code courtier)
 *   - SIMULASSUR_API_KEY      (obligatoire — header X-API-KEY)
 *   - SIMULASSUR_BROKER_CODE  (facultatif — champ `broker` des payloads ;
 *                              à défaut, SIMULASSUR_API_ID est utilisé)
 *   - SIMULASSUR_SOURCE       (facultatif — identifiant d'apporteur)
 *   - SIMULASSUR_ENV          (facultatif — "recette" pour la préproduction)
 *   - SIMULASSUR_API_BASE_URL (facultatif — surcharge explicite de la base)
 *
 * Tant que la clé et l'identifiant sont absents, l'intégration reste inerte.
 */

export const SIMULASSUR_URL_PRODUCTION = "https://apigateway.simulassur.fr";
export const SIMULASSUR_URL_RECETTE = "https://apigateway.preprod.simulassur.fr";

export interface SimulassurCredentials {
  apiId: string;
  apiKey: string;
  brokerCode: string;
  source: string;
  environnement: "production" | "recette";
  baseUrl: string;
}

/** Lecture des secrets — À APPELER UNIQUEMENT dans un handler serveur. */
export function readSimulassurCredentials(): SimulassurCredentials {
  const env = (process.env["SIMULASSUR_ENV"] ?? "").trim().toLowerCase();
  const environnement: "production" | "recette" =
    env === "recette" || env === "preprod" || env === "test" ? "recette" : "production";
  const surcharge = (process.env["SIMULASSUR_API_BASE_URL"] ?? "").trim().replace(/\/+$/, "");
  const apiId = (process.env["SIMULASSUR_API_ID"] ?? "").trim();
  return {
    apiId,
    apiKey: (process.env["SIMULASSUR_API_KEY"] ?? "").trim(),
    brokerCode: (process.env["SIMULASSUR_BROKER_CODE"] ?? "").trim() || apiId,
    source: (process.env["SIMULASSUR_SOURCE"] ?? "").trim(),
    environnement,
    baseUrl:
      surcharge ||
      (environnement === "recette" ? SIMULASSUR_URL_RECETTE : SIMULASSUR_URL_PRODUCTION),
  };
}

export interface SimulassurConfigStatus {
  configured: boolean;
  hasApiId: boolean;
  hasApiKey: boolean;
  hasBrokerCode: boolean;
  hasSource: boolean;
  environnement: "production" | "recette";
  baseUrl: string;
  missing: string[];
  message: string;
}

/** État de configuration, sans jamais révéler la valeur des secrets. */
export function simulassurConfigStatus(): SimulassurConfigStatus {
  const c = readSimulassurCredentials();
  const missing: string[] = [];
  if (!c.apiId) missing.push("SIMULASSUR_API_ID");
  if (!c.apiKey) missing.push("SIMULASSUR_API_KEY");
  const configured = missing.length === 0;
  return {
    configured,
    hasApiId: !!c.apiId,
    hasApiKey: !!c.apiKey,
    hasBrokerCode: !!c.brokerCode,
    hasSource: !!c.source,
    environnement: c.environnement,
    baseUrl: c.baseUrl,
    missing,
    message: configured
      ? `Intégration Simulassur active (environnement ${c.environnement}).`
      : `Intégration Simulassur inactive : secret(s) manquant(s) — ${missing.join(", ")}.`,
  };
}
