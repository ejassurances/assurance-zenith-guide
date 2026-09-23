import { SITE } from "@/lib/site";

/**
 * Modèle du DER (Document d'Entrée en Relation).
 *
 * Mentions légales fixes définies en code (texte validé, ne pas reformuler
 * sans validation d'Erwan — la mention "remuneration" a été corrigée le
 * 23/09/2026 : l'ancien texte n'annonçait aucun honoraire direct au client,
 * incohérent avec les frais de courtage désormais facturés).
 * + zone dynamique calculée à partir des compagnies et produits actifs en base.
 */

/** Numéro ORIAS du cabinet — variable de configuration. */
export const ORIAS_NUMERO = SITE.orias.replace(/[^0-9]/g, "");

export const DER_MENTIONS = {
  identite: `EJ Partners Assurances, courtier en assurance immatriculé à l'ORIAS (n° ${ORIAS_NUMERO}), soumis au contrôle de l'ACPR (4 place de Budapest, CS 92459, 75436 Paris Cedex 09).`,
  statut:
    "Le cabinet exerce en qualité de courtier indépendant, sans lien capitalistique avec les entreprises d'assurance dont il distribue les produits, et n'est tenu par aucune obligation contractuelle de travailler exclusivement avec une ou plusieurs d'entre elles.",
  remuneration:
    "Le cabinet perçoit une rémunération sous forme de commissions versées par les entreprises d'assurance partenaires, incluse dans le montant de la prime, et peut également percevoir des honoraires facturés directement au client sous forme de frais de courtage — notamment lors de la mise en place d'un contrat d'assurance vie ou d'épargne. Le montant de ces frais de courtage, lorsqu'ils s'appliquent, est précisé dans le devoir de conseil remis avant toute souscription.",
  reclamation:
    "Toute réclamation peut être adressée au cabinet par écrit ; à défaut de réponse satisfaisante sous deux mois, le client peut saisir La Médiation de l'Assurance, TSA 50110, 75441 Paris Cedex 09.",
  registre: "Le registre ORIAS est consultable sur www.orias.fr.",
  intelligence_artificielle:
    "Le cabinet peut avoir recours à des outils d'intelligence artificielle pour enrichir la qualité de son analyse et la préparation de ses recommandations. Ce recours reste systématiquement encadré et validé par un professionnel habilité du cabinet, seul responsable du conseil délivré.",
} as const;

export const DER_SECTIONS = [
  { cle: "identite", titre: "1. Identité du distributeur" },
  { cle: "statut", titre: "2. Statut et indépendance" },
  { cle: "remuneration", titre: "3. Mode de rémunération" },
  { cle: "reclamation", titre: "4. Réclamations et médiation" },
  { cle: "registre", titre: "5. Registre des intermédiaires" },
  { cle: "intelligence_artificielle", titre: "6. Recours à l'intelligence artificielle" },
] as const;


export type DerPartenaire = { compagnie: string; produits: string[] };

export type DerContenu = {
  version: string;
  genere_le: string;
  cabinet: {
    nom: string;
    orias: string;
    siret: string;
    adresse: string;
    telephone: string;
    email: string;
  };
  mentions: Record<string, string>;
  partenaires: DerPartenaire[];
};

/** Construit le contenu structuré du DER à partir des partenaires actifs. */
export function construireContenuDer(params: {
  version: string;
  partenaires: DerPartenaire[];
}): DerContenu {
  return {
    version: params.version,
    genere_le: new Date().toISOString(),
    cabinet: {
      nom: SITE.name,
      orias: ORIAS_NUMERO,
      siret: SITE.siret,
      adresse: SITE.address,
      telephone: SITE.phone,
      email: SITE.email,
    },
    mentions: { ...DER_MENTIONS },
    partenaires: params.partenaires,
  };
}

/** Version suivante au format aaaa.n. */
export function prochaineVersion(versionsExistantes: string[]): string {
  const annee = new Date().getFullYear();
  const n = versionsExistantes.filter((v) => v.startsWith(`${annee}.`)).length + 1;
  return `${annee}.${n}`;
}
