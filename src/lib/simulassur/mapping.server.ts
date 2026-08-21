/**
 * Construction du payload de tarification Simulassur (POST /api/pricing) à
 * partir du dossier CRM — SERVEUR UNIQUEMENT (lit le code courtier et
 * l'apporteur dans les secrets).
 *
 * Aucune valeur fictive n'est envoyée : les champs manquants font échouer la
 * demande côté CRM avant l'appel (voir `manquesIdentiteSimulassur`).
 */

import type { PersonneEmprunteur } from "@/lib/recueil-besoins-schemas";

import { readSimulassurCredentials } from "./config";
import type { RecueilEmprunteurSimulassur } from "./eligibilite";
import {
  civiliteSimulassur,
  ETAT_PROJET_PRET_EN_PLACE,
  ETAT_PROJET_RECHERCHE,
  garantiesStandard,
  handlingRequis,
  professionSimulassur,
  qualificationProjetSimulassur,
  situationFamilialeSimulassur,
  TYPE_PRET,
  TYPE_TAUX_FIXE,
} from "./referentiels";

export interface ClientSimulassur {
  id: string;
  civilite?: string | null;
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  date_naissance?: string | null;
  situation_familiale?: string | null;
  profession?: string | null;
}

/** Référence stable transmise à Simulassur pour un client CRM. */
export function refClient(clientId: string): string {
  return `CLIENT-${clientId}`;
}

/** Référence stable transmise à Simulassur pour un prêt du dossier. */
export function refPret(dossierId: string, rang: number): string {
  return `PRET-${dossierId}-${rang}`;
}

function jour(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Premier jour du mois suivant, date d'effet par défaut. */
export function premierDuMoisSuivant(): string {
  const d = new Date();
  return jour(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}

function blocAssure(
  rang: number,
  client: ClientSimulassur,
  personne: PersonneEmprunteur,
): Record<string, unknown> {
  const profession = professionSimulassur(personne.csp || client.profession);
  // Aucun questionnaire médical ni sport à risque collecté (loi Lemoine).
  const sportsRisque = false;
  return {
    partnerCustomerRef: refClient(client.id),
    civility: civiliteSimulassur(client.civilite),
    firstname: String(client.prenom ?? "").trim(),
    lastname: String(client.nom ?? "").trim(),
    birthDate: personne.date_naissance || String(client.date_naissance ?? ""),
    address: String(client.adresse ?? "").trim(),
    zipCode: String(client.code_postal ?? "").trim(),
    city: String(client.ville ?? "").trim(),
    country: "france",
    email: String(client.email ?? "").trim(),
    cellPhone: String(client.telephone ?? "").replace(/[^\d+]/g, ""),
    familySituation: situationFamilialeSimulassur(client.situation_familiale),
    profession,
    exactProfession: String(personne.csp || client.profession || "").trim(),
    franchise: 90,
    // `handling` (port de charges) est requis pour certaines professions.
    handling: handlingRequis(profession) ? true : false,
    height: false,
    businessTrip: false,
    isMainCustomer: rang === 1 ? 1 : 0,
    partTime: false,
    riskyProfession: false,
    riskyProfessionId: 0,
    riskySport: sportsRisque,
    smoker: personne.fumeur === true,
    travelingAbroad: false,
    modulation: -1,
  };
}

export interface PayloadTarificationInput {
  dossierId: string;
  recueil: RecueilEmprunteurSimulassur;
  /** Clients CRM par rang (1 = assuré principal, 2 = coassuré). */
  clientsParRang: ClientSimulassur[];
  dateEffet: string;
  /** Code banque issu du référentiel confirmé (facultatif tant que non confirmé). */
  codeBanque?: string | null;
  /** Liste vide = tous les produits, conformément au guide. */
  produits?: string[];
}

/** Construit le corps de POST /api/pricing en mode synchrone. */
export function payloadTarification(input: PayloadTarificationInput): Record<string, unknown> {
  const creds = readSimulassurCredentials();
  const r = input.recueil;

  const customers: Record<string, unknown> = {};
  const waranties: Record<string, unknown> = {};

  r.assures.forEach((personne, index) => {
    const rang = index + 1;
    const client = input.clientsParRang[index] ?? input.clientsParRang[0];
    if (!client) return;
    customers[String(rang)] = blocAssure(rang, client, personne);
    waranties[String(rang)] = garantiesStandard(personne.quotite_pct ?? 100);
  });

  const typePret = TYPE_PRET["amortissable"] ?? 1;

  return {
    broker: creds.brokerCode,
    creationDate: jour(new Date()),
    customers,
    options: {
      ...(input.codeBanque ? { bank: input.codeBanque } : {}),
      couple: Object.keys(customers).length > 1,
      effectiveDate: input.dateEffet,
      loans: {
        "1": {
          partnerLoanRef: refPret(input.dossierId, 1),
          amount: r.capital.toFixed(2),
          duration: String(r.dureeMois),
          rate: (r.taux > 0 ? r.taux * (r.taux < 1 ? 100 : 1) : 0).toFixed(3),
          rateType: TYPE_TAUX_FIXE,
          type: typePret,
          waranties,
        },
      },
      projectQualification: qualificationProjetSimulassur(r.objetPret),
      projectState: r.substitution ? ETAT_PROJET_PRET_EN_PLACE : ETAT_PROJET_RECHERCHE,
    },
    // MVP : réponse synchrone. Le callback asynchrone reste à activer après
    // confirmation du format et de la sécurisation des appels entrants.
    returnResults: true,
    ...(creds.source ? { source: creds.source } : {}),
    products: input.produits ?? [],
  };
}

/** Empreinte du payload pour dédupliquer deux demandes identiques. */
export async function empreintePayload(payload: unknown): Promise<string> {
  const octets = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", octets);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
