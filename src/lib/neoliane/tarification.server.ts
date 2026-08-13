/**
 * Module Tarification (EZ API Néoliane) — SERVEUR UNIQUEMENT.
 *
 * La documentation métier des endpoints de tarification n'a pas encore été
 * fournie : le chemin d'appel est donc paramétrable (secret
 * NEOLIANE_TARIF_PATH, ou saisi dans l'écran de diagnostic) et le payload est
 * transmis tel quel. Dès que la doc sera connue, il suffira de figer
 * `DEFAULT_TARIF_PATH` et de typer `TarificationInput`.
 */

import { neolianeRequest } from './client.server'

export const DEFAULT_TARIF_PATH = '/neoverse/public/ez/tarification'

export interface TarificationInput {
  /** Chemin d'appel (surcharge la valeur par défaut / le secret). */
  path?: string | undefined
  /** Payload métier envoyé à Néoliane. */
  payload: Record<string, unknown>
  /** Certains endpoints EZ exigent le userApiKey dans le payload. */
  withUserApiKey?: boolean
}

export function tarificationPath(override?: string | undefined) {
  return (override || process.env['NEOLIANE_TARIF_PATH'] || DEFAULT_TARIF_PATH).trim()
}

export async function appelerTarification(input: TarificationInput) {
  const res = await neolianeRequest({
    path: tarificationPath(input.path),
    method: 'POST',
    payload: input.payload,
    withUserApiKey: input.withUserApiKey ?? true,
  })
  return {
    ok: res.ok,
    status: res.status,
    authMode: res.authMode,
    resultat: res.data,
  }
}
