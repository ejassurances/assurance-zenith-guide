/**
 * Module Souscription + signature électronique (EZ API Néoliane) —
 * SERVEUR UNIQUEMENT.
 *
 * Même principe que la tarification : les chemins sont paramétrables tant que
 * la documentation métier n'a pas été fournie. Aucune hypothèse n'est faite
 * sur la forme du payload, qui est transmis tel quel.
 */

import { neolianeRequest } from './client.server'

export const DEFAULT_SOUSCRIPTION_PATH = '/neoverse/public/ez/souscription'
export const DEFAULT_SIGNATURE_PATH = '/neoverse/public/ez/signature'

export function souscriptionPath(override?: string | undefined) {
  return (override || process.env['NEOLIANE_SOUSCRIPTION_PATH'] || DEFAULT_SOUSCRIPTION_PATH).trim()
}

export function signaturePath(override?: string | undefined) {
  return (override || process.env['NEOLIANE_SIGNATURE_PATH'] || DEFAULT_SIGNATURE_PATH).trim()
}

export interface SouscriptionInput {
  path?: string | undefined
  payload: Record<string, unknown>
  withUserApiKey?: boolean
}

/** Lance la souscription à partir d'un devis retenu. */
export async function lancerSouscription(input: SouscriptionInput) {
  const res = await neolianeRequest({
    path: souscriptionPath(input.path),
    method: 'POST',
    payload: input.payload,
    withUserApiKey: input.withUserApiKey ?? true,
  })
  return { ok: res.ok, status: res.status, authMode: res.authMode, resultat: JSON.stringify(res.data ?? null) }
}

/** Déclenche la signature électronique d'une souscription en cours. */
export async function lancerSignature(input: SouscriptionInput) {
  const res = await neolianeRequest({
    path: signaturePath(input.path),
    method: 'POST',
    payload: input.payload,
    withUserApiKey: input.withUserApiKey ?? true,
  })
  return { ok: res.ok, status: res.status, authMode: res.authMode, resultat: JSON.stringify(res.data ?? null) }
}
