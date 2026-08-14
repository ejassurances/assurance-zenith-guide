/**
 * Minimisation RGPD des données Néoliane conservées ou journalisées.
 *
 * Aucune donnée personnelle n'est stockée dans `neoliane_parcours` ni
 * `neoliane_evenements` : seuls les identifiants techniques et les statuts sont
 * retenus. Les corps d'erreur bruts sont réduits à un diagnostic technique.
 */

/** Clés techniques autorisées à la persistance (liste blanche). */
const CLES_AUTORISEES = new Set([
  "id",
  "profileId",
  "profile_id",
  "cartId",
  "cart_id",
  "offerId",
  "offer_id",
  "contractId",
  "contract_id",
  "contractIds",
  "contracts",
  "demarcheId",
  "demarche_id",
  "pricingId",
  "pricing_id",
  "gammeId",
  "formulaId",
  "productId",
  "subscriptionId",
  "status",
  "statut",
  "state",
  "etape",
  "step",
  "code",
  "codes",
  "errorCode",
  "isValid",
  "valid",
  "validated",
  "warnings",
  "errors",
  "eventName",
  "event",
  "signType",
  "type",
  "types",
  "createdAt",
  "updatedAt",
  "dateEffect",
  "amount",
  "label",
  "gammeLabel",
  "formulaLabel",
  "received",
  "refreshed",
]);

/** Longueur au-delà de laquelle une chaîne est écartée (Base64, texte libre). */
const MAX_CHAINE = 200;

/**
 * Ne conserve que les identifiants techniques et statuts d'une réponse
 * Néoliane. Tout le reste (identité, adresse, IBAN, NIR, documents encodés)
 * est retiré, y compris dans les structures imbriquées.
 */
export function reduireReponseNeoliane(data: unknown): unknown {
  if (data === null || data === undefined) return null;

  if (Array.isArray(data)) {
    const items = data
      .map((e) => reduireReponseNeoliane(e))
      .filter((e) => e !== null && !(typeof e === "object" && Object.keys(e as object).length === 0));
    return items;
  }

  if (typeof data !== "object") {
    if (typeof data === "string" && data.length > MAX_CHAINE) return "[retiré]";
    return data;
  }

  const source = data as Record<string, unknown>;
  const sortie: Record<string, unknown> = {};

  for (const [cle, valeur] of Object.entries(source)) {
    const imbrique = valeur !== null && typeof valeur === "object";

    if (CLES_AUTORISEES.has(cle)) {
      if (imbrique) {
        sortie[cle] = reduireReponseNeoliane(valeur);
      } else if (typeof valeur === "string" && valeur.length > MAX_CHAINE) {
        sortie[cle] = "[retiré]";
      } else {
        sortie[cle] = valeur;
      }
      continue;
    }

    // Clé non autorisée : on descend uniquement pour récupérer d'éventuels
    // identifiants techniques imbriqués, jamais la valeur elle-même.
    if (imbrique) {
      const enfant = reduireReponseNeoliane(valeur);
      const vide =
        enfant === null ||
        (Array.isArray(enfant) && enfant.length === 0) ||
        (typeof enfant === "object" && !Array.isArray(enfant) && Object.keys(enfant as object).length === 0);
      if (!vide) sortie[cle] = enfant;
    }
  }

  return sortie;
}

/** Masque un secret : ne laisse apparaître qu'une empreinte non réversible. */
export function masquerSecret(valeur: string): string {
  if (!valeur) return "(absent)";
  return `****(${valeur.length} car.)`;
}

const MOTIFS_SENSIBLES: RegExp[] = [
  /[A-Z]{2}\d{2}[A-Z0-9]{10,30}/g, // IBAN
  /\b[\w.+-]+@[\w-]+\.[A-Za-z]{2,}\b/g, // email
  /\b[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g, // NIR
  /\b\d{4}-\d{2}-\d{2}\b/g, // dates
  /\b\d{6,}\b/g, // longues suites de chiffres
];

/**
 * Réduit un corps d'erreur Néoliane à un diagnostic technique : codes et
 * libellés d'erreur, sans valeur de champ rejetée.
 */
export function diagnosticErreur(prefixe: string, status: number, data: unknown): string {
  const codes = new Set<string>();

  const parcourir = (v: unknown, profondeur = 0) => {
    if (profondeur > 6 || v === null || v === undefined) return;
    if (Array.isArray(v)) {
      v.forEach((e) => parcourir(e, profondeur + 1));
      return;
    }
    if (typeof v === "object") {
      for (const [cle, val] of Object.entries(v as Record<string, unknown>)) {
        const cleBasse = cle.toLowerCase();
        if (
          (cleBasse.includes("code") || cleBasse.includes("message") || cleBasse.includes("error") || cleBasse.includes("field")) &&
          (typeof val === "string" || typeof val === "number")
        ) {
          codes.add(`${cle}=${String(val).slice(0, 80)}`);
        } else {
          parcourir(val, profondeur + 1);
        }
      }
      return;
    }
    if (typeof v === "string" && v.length <= 120) codes.add(v);
  };

  parcourir(data);

  let resume = [...codes].join(" | ").slice(0, 200);
  for (const motif of MOTIFS_SENSIBLES) resume = resume.replace(motif, "[masqué]");

  return `${prefixe} (HTTP ${status})${resume ? ` — ${resume}` : ""}`;
}

/** Tronque un message d'erreur destiné à la persistance. */
export function messageTechnique(message: string, max = 200): string {
  let m = message ?? "";
  for (const motif of MOTIFS_SENSIBLES) m = m.replace(motif, "[masqué]");
  return m.slice(0, max);
}
