/**
 * Configuration de l'intégration Néoliane (assureur partenaire).
 *
 * IMPORTANT — les identifiants ne sont JAMAIS en dur dans le code et ne sont
 * jamais exposés au navigateur. Ils doivent être renseignés dans
 * Paramètres du projet → Secrets :
 *   - NEOLIANE_CLIENT_ID
 *   - NEOLIANE_CLIENT_SECRET
 *   - NEOLIANE_USER_API_KEY   (généré depuis l'extranet Néoliane :
 *                              Mon Compte > Accès externes)
 *
 * Tant que ces secrets sont vides, l'intégration reste inerte et renvoie un
 * message explicite (voir `neolianeConfigStatus`).
 */

export const NEOLIANE_BASE_URL = "https://api.neoliane.fr"

/** Endpoint officiel d'obtention du token OAuth2 (client_credentials). */
export const NEOLIANE_TOKEN_PATH = "/neoverse/public/oauth/token"

/** Méthode d'authentification utilisée pour les appels métier. */
export type NeolianeAuthMode = "oauth2" | "basic"

export interface NeolianeCredentials {
  clientId: string
  clientSecret: string
  userApiKey: string
}

/** Lecture des secrets — À APPELER UNIQUEMENT dans un handler serveur. */
export function readNeolianeCredentials(): NeolianeCredentials {
  return {
    clientId: (process.env['NEOLIANE_CLIENT_ID'] ?? '').trim(),
    clientSecret: (process.env['NEOLIANE_CLIENT_SECRET'] ?? '').trim(),
    userApiKey: (process.env['NEOLIANE_USER_API_KEY'] ?? '').trim(),
  }
}

export interface NeolianeConfigStatus {
  configured: boolean
  hasClientId: boolean
  hasClientSecret: boolean
  hasUserApiKey: boolean
  missing: string[]
  message: string
}

/** État de configuration, sans jamais révéler la valeur des secrets. */
export function neolianeConfigStatus(): NeolianeConfigStatus {
  const c = readNeolianeCredentials()
  const missing: string[] = []
  if (!c.clientId) missing.push('NEOLIANE_CLIENT_ID')
  if (!c.clientSecret) missing.push('NEOLIANE_CLIENT_SECRET')
  if (!c.userApiKey) missing.push('NEOLIANE_USER_API_KEY')
  const configured = !c.clientId || !c.clientSecret ? false : true
  return {
    configured,
    hasClientId: !!c.clientId,
    hasClientSecret: !!c.clientSecret,
    hasUserApiKey: !!c.userApiKey,
    missing,
    message: configured
      ? missing.length
        ? `Authentification prête. Manque encore : ${missing.join(', ')} (nécessaire pour certains endpoints).`
        : 'Identifiants Néoliane complets.'
      : `Identifiants Néoliane non renseignés : ${missing.join(', ')}. À ajouter dans Paramètres du projet → Secrets avant toute utilisation.`,
  }
}

export class NeolianeNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NeolianeNotConfiguredError'
  }
}

export class NeolianeApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'NeolianeApiError'
    this.status = status
    this.body = body
  }
}
