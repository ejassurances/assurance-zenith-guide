/**
 * Domaines du cabinet : un email envoyé depuis l'une de ces adresses est un
 * message INTERNE (souvent un transfert). Il ne doit jamais créer une fiche
 * client, un prospect ou un dossier commercial.
 */
export const DOMAINES_INTERNES = ["ej-assurances.fr", "ejpartners.fr"] as const;

export function domaineDeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.toLowerCase().trim().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  return m ? m[1]!.replace(/^www\./, "") : null;
}

export function estEmailInterne(email: string | null | undefined): boolean {
  const d = domaineDeEmail(email);
  if (!d) return false;
  return DOMAINES_INTERNES.some((x) => d === x || d.endsWith(`.${x}`));
}
