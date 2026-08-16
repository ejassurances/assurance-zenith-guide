/* Contrôle interne de 1er niveau — utilitaires de trimestre (client-safe). */

export function trimestreDe(date: Date): string {
  return `T${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
}

export function trimestreCourant(): string {
  return trimestreDe(new Date());
}

/** Dernier jour (inclus) du trimestre contenant `date`. */
export function finTrimestre(date: Date): Date {
  const t = Math.floor(date.getUTCMonth() / 3);
  return new Date(Date.UTC(date.getUTCFullYear(), t * 3 + 3, 0, 23, 59, 59));
}

/** Jours restants avant la fin du trimestre courant. */
export function joursAvantFinTrimestre(date = new Date()): number {
  return Math.ceil((finTrimestre(date).getTime() - date.getTime()) / 86_400_000);
}

/** Taille de l'échantillon : 12 % du portefeuille actif, minimum 3. */
export function tailleEchantillon(nbClientsActifs: number): number {
  if (nbClientsActifs === 0) return 0;
  return Math.min(nbClientsActifs, Math.max(3, Math.round(nbClientsActifs * 0.12)));
}
