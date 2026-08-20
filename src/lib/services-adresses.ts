import { LABELS_CABINET, type LabelCabinet } from "@/lib/gmail-labels";

/**
 * Services du cabinet et adresses réelles de renvoi. Module client-safe.
 *
 * Certains services n'ont PAS d'adresse dédiée (Gestion Commerciale, Service
 * Conformite) : un mail mal aiguillé vers eux reste sur place, aucun renvoi
 * n'est effectué.
 */
export type ServiceCabinet =
  | "gestion_commerciale"
  | "service_client"
  | "service_partenaire"
  | "service_achat"
  | "service_commission"
  | "service_reclamation"
  | "service_conformite";

export interface DefinitionService {
  cle: ServiceCabinet;
  libelle: string;
  /** Préfixe exact de l'arborescence Gmail du service. */
  prefixe: string;
  /** Adresse réelle de renvoi, ou null si le service n'en a pas. */
  adresse: string | null;
  /** Étiquettes du service (sous-états). */
  a_traiter: LabelCabinet;
  archive: LabelCabinet;
  /** Thèmes traités, utilisés pour la classification IA. */
  theme: string;
}

export const SERVICES: readonly DefinitionService[] = [
  {
    cle: "gestion_commerciale",
    libelle: "Gestion Commerciale",
    prefixe: "Direction Commerciale/Gestion Commerciale/",
    adresse: null,
    a_traiter: "gc_a_traiter",
    archive: "gc_archive",
    theme:
      "prospection entrante, demande de devis ou d'étude, nouveau prospect, souscription en cours de vente",
  },
  {
    cle: "service_client",
    libelle: "Service Client",
    prefixe: "Direction Commerciale/Service Client/",
    adresse: "service.client@ej-assurances.fr",
    a_traiter: "sc_a_traiter",
    archive: "sc_archive",
    theme:
      "demande d'un client existant : gestion de contrat, avenant, résiliation, remboursement, sinistre, envoi de justificatif, question sur ses garanties",
  },
  {
    cle: "service_partenaire",
    libelle: "Service Partenaire",
    prefixe: "Direction Commerciale/Service Partenaire/",
    adresse: "partenaires@ej-assurances.fr",
    a_traiter: "sp_a_traiter",
    archive: "sp_archive",
    theme:
      "échanges avec une compagnie, un assureur, un grossiste ou une plateforme : codes courtier, conventions, actualités produits, invitations, challenges",
  },
  {
    cle: "service_achat",
    libelle: "Service Achat",
    prefixe: "Direction Financiere/Service Achat/",
    adresse: "comptabilite@ej-assurances.fr",
    a_traiter: "achat_a_traiter",
    archive: "achat_archive",
    theme: "factures fournisseurs, abonnements, achats et dépenses du cabinet",
  },
  {
    cle: "service_commission",
    libelle: "Service Commission",
    prefixe: "Direction Financiere/Service Commission/",
    adresse: "comptabilite@ej-assurances.fr",
    a_traiter: "commission_a_traiter",
    archive: "commission_archive",
    theme: "bordereaux de commissions, relevés de rémunération, règlements des compagnies",
  },
  {
    cle: "service_reclamation",
    libelle: "Service Reclamation",
    prefixe: "Direction Juridique et Conformite/Service Reclamation/",
    adresse: "reclamation@ej-assurances.fr",
    a_traiter: "rec_a_traiter",
    archive: "rec_archive",
    theme:
      "réclamation formelle : mécontentement, contestation, mise en cause du cabinet ou de la compagnie, saisine du médiateur",
  },
  {
    cle: "service_conformite",
    libelle: "Service Conformite",
    prefixe: "Direction Juridique et Conformite/Service Conformite/",
    adresse: null,
    a_traiter: "veille_a_traiter",
    archive: "veille_archive",
    theme: "veille réglementaire, ACPR, ORIAS, DDA, RGPD, obligations de conformité",
  },
];

export function serviceParCle(cle: ServiceCabinet): DefinitionService {
  const s = SERVICES.find((x) => x.cle === cle);
  if (!s) throw new Error(`Service inconnu : ${cle}`);
  return s;
}

/** Service d'arrivée d'un message d'après les étiquettes réellement posées. */
export function serviceDeEtiquettes(etiquettes: string[]): DefinitionService | null {
  const bas = etiquettes.map((e) => e.toLowerCase());
  for (const s of SERVICES) {
    const p = s.prefixe.toLowerCase();
    if (bas.some((e) => e.startsWith(p))) return s;
  }
  return null;
}

/** Adresses de service : jamais considérées comme un client à mettre en copie. */
export const ADRESSES_SERVICES: readonly string[] = SERVICES.map((s) => s.adresse).filter(
  (a): a is string => !!a,
);

export { LABELS_CABINET };
