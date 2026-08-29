/**
 * Domaines des compagnies / partenaires du cabinet.
 *
 * Un email provenant d'un de ces domaines n'est JAMAIS un prospect entrant ni
 * une demande client : c'est un échange partenaire (suivi de dossier, actualité
 * produit, gestion). Il doit donc être détecté AVANT toute classification IA
 * prospect / relation client, et routé vers « Service Partenaire ».
 *
 * Module client-safe (réutilisé serveur et UI). La table `compagnies` complète
 * cette liste dynamiquement (contact_email, site_web, email_reclamations).
 */
export const DOMAINES_PARTENAIRES: Record<string, string> = {
  // Kereis (ex-CBP) — plateformes ADE / OAV.
  "kereisfrance.com": "Kereis",
  "kereis.com": "Kereis",
  "cbp-solutions.com": "Kereis",
  // Cardif — service résiliation (CLEenmain@substitutions.fr) : adresse de
  // résiliation de l'assureur Cardif LUI-MÊME, pas une plateforme Kereis.
  "substitutions.fr": "Cardif (service résiliation)",
  "cardif.fr": "Cardif",
  "cardif.com": "Cardif",
  // Néoliane.
  "neoliane.fr": "Néoliane",
  "neoliane.com": "Néoliane",
  "neoliane-sante.fr": "Néoliane",
  // SimulAssur.
  "simulassur.fr": "SimulAssur",
  "simulassur.com": "SimulAssur",
  // UGIP.
  "ugipassurances.com": "UGIP Assurances",
  "ugip-assurances.com": "UGIP Assurances",
  "ugip.fr": "UGIP Assurances",
  // April.
  "april.fr": "April",
  "aprilcourtage.fr": "April",
  "april.com": "April",
  // NetVox.
  "netvox.fr": "NetVox",
  "netvoxassurances.com": "NetVox",
  // Generali.
  "generali.fr": "Generali",
  "generali.com": "Generali",
};

/** Extrait le domaine (sans www.) d'une adresse email ou d'une URL. */
export function extraireDomaine(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  const v = valeur.toLowerCase().trim();
  const apresArobase = v.includes("@") ? v.split("@").pop()! : v;
  const m = apresArobase.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})/);
  return m ? m[1]!.replace(/^www\./, "") : null;
}

/**
 * Le domaine est-il celui d'un partenaire ? Compare le domaine complet puis son
 * domaine racine (sous-domaines type `mail.kereisfrance.com`).
 */
export function nomPartenairePourDomaine(
  domaine: string | null,
  supplementaires?: ReadonlyMap<string, string>,
): string | null {
  if (!domaine) return null;
  const candidats = [domaine];
  const parties = domaine.split(".");
  if (parties.length > 2) candidats.push(parties.slice(-2).join("."));
  for (const d of candidats) {
    const dyn = supplementaires?.get(d);
    if (dyn) return dyn;
    const connu = DOMAINES_PARTENAIRES[d];
    if (connu) return connu;
  }
  return null;
}

/** Raccourci : l'expéditeur appartient-il à un partenaire connu ? */
export function estEmailPartenaire(
  email: string | null | undefined,
  supplementaires?: ReadonlyMap<string, string>,
): boolean {
  return nomPartenairePourDomaine(extraireDomaine(email), supplementaires) !== null;
}
