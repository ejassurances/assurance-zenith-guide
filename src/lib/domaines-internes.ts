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
  if (DOMAINES_INTERNES.some((x) => d === x || d.endsWith(`.${x}`))) return true;
  // Adresses de service / notification : jamais un prospect non plus
  // (Yousign, plateformes assureurs, no-reply divers).
  return /^(no[-_.]?reply|ne[-_.]?pas[-_.]?repondre|noreply|notifications?|mailer|postmaster|donotreply)/i.test(
    (email ?? "").trim(),
  );
}

