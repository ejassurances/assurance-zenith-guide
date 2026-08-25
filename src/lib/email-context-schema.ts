/**
 * CD-SI-001-B — LOT 1 (fondations).
 * Validateur runtime de `crm_emails.ai_context`, strictement aligné sur
 * `src/lib/schemas/email-context-v1.2.json` (schema_version figée à 1.1.0).
 * Aucune logique métier : validation de forme uniquement.
 */
import { z } from "zod";

import {
  AMBIGUITY_TYPES,
  EMAIL_CONTEXT_SCHEMA_VERSION,
  EMAIL_CONTEXT_STATUSES,
  EVIDENCE_TYPES,
  PROVENANCE_SOURCES,
  type EmailContext,
} from "./email-context-types";

const statut = z.enum(EMAIL_CONTEXT_STATUSES);
const confiance = z.number().min(0).max(1);
const uuidOrNull = z.string().uuid().nullable();
const texte = z.string().nullable();

const provenance = z
  .object({
    source: z.enum(PROVENANCE_SOURCES).optional(),
    champ: texte.optional(),
    modele: texte.optional(),
    detecte_le: texte.optional(),
    preuve_ids: z.array(z.string()).optional(),
  })
  .strict();

const correspondant = z
  .object({
    email: texte.optional(),
    nom_affiche: texte.optional(),
    role_suppose: z
      .enum(["client", "prospect", "compagnie", "partenaire", "interne", "inconnu"])
      .nullable()
      .optional(),
    client_id: uuidOrNull.optional(),
    compagnie_id: uuidOrNull.optional(),
    statut: statut.optional(),
    confiance: confiance.optional(),
    provenance: provenance.optional(),
  })
  .strict();

const detectedPerson = z
  .object({
    nom: texte.optional(),
    prenom: texte.optional(),
    email: texte.optional(),
    telephone: texte.optional(),
    date_naissance: texte.optional(),
    role: z
      .enum(["souscripteur", "co_emprunteur", "conjoint", "enfant", "tiers", "inconnu"])
      .nullable()
      .optional(),
    client_id_propose: uuidOrNull.optional(),
    statut,
    confiance: confiance.optional(),
    provenance: provenance.optional(),
  })
  .strict();

const detectedDossier = z
  .object({
    reference_citee: texte.optional(),
    dossier_id_propose: uuidOrNull.optional(),
    branche: texte.optional(),
    statut,
    confiance: confiance.optional(),
    provenance: provenance.optional(),
  })
  .strict();

const detectedContract = z
  .object({
    numero_police: texte.optional(),
    contrat_id_propose: uuidOrNull.optional(),
    compagnie_citee: texte.optional(),
    statut,
    confiance: confiance.optional(),
    provenance: provenance.optional(),
  })
  .strict();

const citedProduct = z
  .object({
    libelle: texte.optional(),
    produit_id_propose: uuidOrNull.optional(),
    famille: texte.optional(),
    statut,
    confiance: confiance.optional(),
    provenance: provenance.optional(),
  })
  .strict();

const associatedDocument = z
  .object({
    nom_fichier: texte.optional(),
    type_detecte: texte.optional(),
    gmail_attachment_id: texte.optional(),
    document_id_propose: uuidOrNull.optional(),
    statut,
    confiance: confiance.optional(),
    provenance: provenance.optional(),
  })
  .strict();

const evidence = z
  .object({
    id: z.string(),
    type: z.enum(EVIDENCE_TYPES),
    extrait: texte.optional(),
    cible: texte.optional(),
    poids: confiance.optional(),
  })
  .strict();

const ambiguity = z
  .object({
    type: z.enum(AMBIGUITY_TYPES),
    description: texte.optional(),
    candidats: z.array(z.string()).optional(),
    resolution_requise: z.boolean().optional(),
  })
  .strict();

const analyse = z
  .object({
    statut: statut.optional(),
    confiance_globale: confiance.optional(),
    modele: texte.optional(),
    analyse_le: texte.optional(),
    validation_humaine_requise: z.boolean().optional(),
    validated_by: uuidOrNull.optional(),
    validated_at: texte.optional(),
    modifications_apportees: z.array(z.string()).optional(),
    provenance: provenance.optional(),
  })
  .strict();

export const emailContextSchema = z
  .object({
    schema_version: z.literal(EMAIL_CONTEXT_SCHEMA_VERSION),
    correspondant: correspondant.optional(),
    personnes_detectees: z.array(detectedPerson).optional(),
    dossiers_detectes: z.array(detectedDossier).optional(),
    contrats_detectes: z.array(detectedContract).optional(),
    produits_cites: z.array(citedProduct).optional(),
    documents_associes: z.array(associatedDocument).optional(),
    preuves: z.array(evidence).optional(),
    ambiguities: z.array(ambiguity).optional(),
    analyse: analyse.optional(),
  })
  .strict();

/** Validation stricte : renvoie null si la valeur n'est pas un contexte conforme. */
export function lireContexteEmail(valeur: unknown): EmailContext | null {
  const r = emailContextSchema.safeParse(valeur);
  return r.success ? (r.data as EmailContext) : null;
}

export function estContexteEmailValide(valeur: unknown): boolean {
  return emailContextSchema.safeParse(valeur).success;
}
