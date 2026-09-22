/**
 * Domaines du cabinet : un email envoyé depuis l'une de ces adresses est un
 * message INTERNE (souvent un transfert). Il ne doit jamais créer une fiche
 * client, un prospect ou un dossier commercial.
 *
 * RÈGLE STRICTE : « interne » se déduit UNIQUEMENT du domaine du cabinet.
 * Une adresse de service (no-reply, notifications…) d'un tiers n'est PAS
 * interne : elle est « automatique », ce qui est un motif distinct — sans quoi
 * un partenaire non répertorié serait pris à tort pour le cabinet lui-même.
 */
export const DOMAINES_INTERNES = ["ej-assurances.fr", "ejpartners.fr"] as const;

/**
 * Adresses personnelles nominatives du cabinet, hébergées chez un fournisseur
 * grand public : traitées comme INTERNES (transfert), donc jamais un prospect.
 * Les documents reçus concernent des tiers, à rattacher par qualification.
 */
export const ADRESSES_INTERNES = ["erwan.jaffrelot@icloud.com"] as const;

function estAdresseInterneNominative(email: string | null | undefined): boolean {
  const e = (email ?? "").toLowerCase().trim();
  const m = e.match(/<([^>]+)>/);
  const adresse = m ? m[1]!.trim() : e;
  return ADRESSES_INTERNES.some((x) => adresse === x);
}

export function domaineDeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.toLowerCase().trim().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  return m ? m[1]!.replace(/^www\./, "") : null;
}

/** Vrai pour un domaine du cabinet ou une adresse personnelle répertoriée. */
export function estEmailInterne(email: string | null | undefined): boolean {
  if (estAdresseInterneNominative(email)) return true;
  const d = domaineDeEmail(email);
  if (!d) return false;
  return DOMAINES_INTERNES.some((x) => d === x || d.endsWith(`.${x}`));
}

/**
 * Adresse d'automate (no-reply, notifications, mailer…), quel qu'en soit le
 * domaine : jamais un prospect, mais jamais « interne » non plus.
 */
export function estAdresseAutomatique(email: string | null | undefined): boolean {
  return /^(no[-_.]?reply|ne[-_.]?pas[-_.]?repondre|noreply|notifications?|mailer|postmaster|donotreply)/i.test(
    (email ?? "").trim(),
  );
}


