/**
 * CD-SI-001-B — LOT IHM QUALIFICATION — SERVER FUNCTIONS.
 * Référence exclusive : docs/CD-SI-001-B-LOT-IHM-QUALIFICATION-DESIGN-V1.1.md
 *
 * Lectures et unique mutation réalisées avec le client AUTHENTIFIÉ (RLS).
 * `operateurId` provient exclusivement de `context.userId` : tout identifiant
 * transmis par le client est ignoré. Aucun client de service, aucun modèle
 * d'analyse, aucune boîte mail, aucun appel du Lot 4.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EMAIL_CONTEXT_STATUSES,
  type EmailContext,
} from "./email-context-types";
import { lireContexteEmail } from "./email-context-schema";
import type { CorrectionContexte, IntentionHumaine } from "./email-context-validation";

const PLAFOND_FILE = 100;

const statutHumain = z.enum(["CONFIRMED", "AMBIGUOUS", "A_QUALIFIER"]);
const uuidOuNull = z.string().uuid().nullable();

const correctionSchema = z.union([
  z.object({
    cible: z.union([
      z.object({ objet: z.literal("correspondant") }),
      z.object({
        objet: z.enum(["personne", "dossier", "contrat", "produit", "document"]),
        index: z.number().int().min(0),
      }),
    ]),
    champ: z.literal("statut"),
    valeur: statutHumain,
  }),
  z.object({
    cible: z.object({ objet: z.literal("correspondant") }),
    champ: z.enum(["client_id", "compagnie_id"]),
    valeur: uuidOuNull,
  }),
  z.object({
    cible: z.object({ objet: z.literal("correspondant") }),
    champ: z.literal("role_suppose"),
    valeur: z.enum(["client", "prospect", "compagnie", "partenaire", "interne", "inconnu"]).nullable(),
  }),
  z.object({
    cible: z.object({ objet: z.literal("personne"), index: z.number().int().min(0) }),
    champ: z.literal("client_id_propose"),
    valeur: uuidOuNull,
  }),
  z.object({
    cible: z.object({ objet: z.literal("personne"), index: z.number().int().min(0) }),
    champ: z.literal("role"),
    valeur: z
      .enum(["souscripteur", "co_emprunteur", "conjoint", "enfant", "tiers", "inconnu"])
      .nullable(),
  }),
  z.object({
    cible: z.object({ objet: z.literal("dossier"), index: z.number().int().min(0) }),
    champ: z.literal("dossier_id_propose"),
    valeur: uuidOuNull,
  }),
  z.object({
    cible: z.object({ objet: z.literal("contrat"), index: z.number().int().min(0) }),
    champ: z.literal("contrat_id_propose"),
    valeur: uuidOuNull,
  }),
  z.object({
    cible: z.object({ objet: z.literal("produit"), index: z.number().int().min(0) }),
    champ: z.literal("produit_id_propose"),
    valeur: uuidOuNull,
  }),
  z.object({
    cible: z.object({ objet: z.literal("document"), index: z.number().int().min(0) }),
    champ: z.literal("document_id_propose"),
    valeur: uuidOuNull,
  }),
]);

const intentionSchema = z.union([
  z.object({ type: z.literal("valider") }),
  z.object({
    type: z.literal("corriger_et_valider"),
    corrections: z.array(correctionSchema).min(1).max(50),
  }),
  z.object({ type: z.literal("renvoyer_qualification"), motif: z.string().min(3).max(2000) }),
]);

/** File d'attente bornée des contextes non encore validés par un humain. */
export const fileContexteAQualifier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("crm_emails")
      .select("id, gmail_message_id, direction, recu_le, ai_context, updated_at")
      .order("recu_le", { ascending: false, nullsFirst: false })
      .limit(PLAFOND_FILE);
    if (error) return { lignes: [], erreur: "lecture_impossible" as const };

    const lignes = (data ?? [])
      .map((l) => {
        const contexte = lireContexteEmail(l.ai_context);
        return { ligne: l, contexte };
      })
      .filter((x) => x.contexte !== null && x.contexte.analyse?.statut !== "CONFIRMED")
      .map(({ ligne, contexte }) => ({
        id: ligne.id,
        gmail_message_id: ligne.gmail_message_id,
        direction: ligne.direction,
        recu_le: ligne.recu_le,
        statut: contexte?.analyse?.statut ?? null,
        nb_ambiguites: (contexte?.ambiguities ?? []).length,
        nb_propositions:
          (contexte?.personnes_detectees ?? []).length +
          (contexte?.dossiers_detectes ?? []).length +
          (contexte?.contrats_detectes ?? []).length +
          (contexte?.produits_cites ?? []).length +
          (contexte?.documents_associes ?? []).length,
      }));
    return { lignes, erreur: null };
  });

interface LibellesReferentiel {
  clients: { id: string; libelle: string }[];
  dossiers: { id: string; libelle: string }[];
  contrats: { id: string; libelle: string }[];
  compagnies: { id: string; libelle: string }[];
  produits: { id: string; libelle: string }[];
  documents: { id: string; libelle: string }[];
}

const idsProposes = (contexte: EmailContext) => ({
  clients: [
    contexte.correspondant?.client_id ?? null,
    ...(contexte.personnes_detectees ?? []).map((p) => p.client_id_propose ?? null),
  ].filter((v): v is string => Boolean(v)),
  compagnies: [contexte.correspondant?.compagnie_id ?? null].filter((v): v is string => Boolean(v)),
  dossiers: (contexte.dossiers_detectes ?? [])
    .map((d) => d.dossier_id_propose ?? null)
    .filter((v): v is string => Boolean(v)),
  contrats: (contexte.contrats_detectes ?? [])
    .map((c) => c.contrat_id_propose ?? null)
    .filter((v): v is string => Boolean(v)),
  produits: (contexte.produits_cites ?? [])
    .map((p) => p.produit_id_propose ?? null)
    .filter((v): v is string => Boolean(v)),
  documents: (contexte.documents_associes ?? [])
    .map((d) => d.document_id_propose ?? null)
    .filter((v): v is string => Boolean(v)),
});

/** Détail d'un contexte : propositions, libellés lisibles, jeton de version. */
export const detailContexteEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: ligne, error } = await context.supabase
      .from("crm_emails")
      .select("id, gmail_message_id, direction, recu_le, ai_context, updated_at")
      .eq("id", data.email_id)
      .maybeSingle();
    if (error || !ligne) return { trouve: false as const };

    const contexte = lireContexteEmail(ligne.ai_context);
    const vide: LibellesReferentiel = {
      clients: [],
      dossiers: [],
      contrats: [],
      compagnies: [],
      produits: [],
      documents: [],
    };
    if (!contexte) {
      return {
        trouve: true as const,
        contexte: null,
        updated_at: ligne.updated_at,
        lectureSeule: true,
        libelles: vide,
        entete: {
          gmail_message_id: ligne.gmail_message_id,
          direction: ligne.direction,
          recu_le: ligne.recu_le,
        },
      };
    }

    const ids = idsProposes(contexte);
    const libelles: LibellesReferentiel = { ...vide };
    if (ids.clients.length > 0) {
      const { data: r } = await context.supabase
        .from("clients")
        .select("id, reference, nom, prenom")
        .in("id", ids.clients);
      libelles.clients = (r ?? []).map((c) => ({
        id: c.id,
        libelle: [c.prenom, c.nom].filter(Boolean).join(" ") || c.reference || c.id,
      }));
    }
    if (ids.dossiers.length > 0) {
      const { data: r } = await context.supabase
        .from("dossiers")
        .select("id, reference")
        .in("id", ids.dossiers);
      libelles.dossiers = (r ?? []).map((d) => ({ id: d.id, libelle: d.reference ?? d.id }));
    }
    if (ids.contrats.length > 0) {
      const { data: r } = await context.supabase
        .from("contrats")
        .select("id, numero, assureur, produit")
        .in("id", ids.contrats);
      libelles.contrats = (r ?? []).map((c) => ({
        id: c.id,
        libelle: [c.numero, c.assureur, c.produit].filter(Boolean).join(" · ") || c.id,
      }));
    }
    if (ids.compagnies.length > 0) {
      const { data: r } = await context.supabase
        .from("compagnies")
        .select("id, nom")
        .in("id", ids.compagnies);
      libelles.compagnies = (r ?? []).map((c) => ({ id: c.id, libelle: c.nom }));
    }
    if (ids.produits.length > 0) {
      const { data: r } = await context.supabase
        .from("produits")
        .select("id, nom")
        .in("id", ids.produits);
      libelles.produits = (r ?? []).map((p) => ({ id: p.id, libelle: p.nom }));
    }
    if (ids.documents.length > 0) {
      const { data: r } = await context.supabase
        .from("documents")
        .select("id, file_name")
        .in("id", ids.documents);
      libelles.documents = (r ?? []).map((d) => ({ id: d.id, libelle: d.file_name }));
    }

    const a = contexte.analyse;
    const lectureSeule = Boolean(
      a?.validated_by || a?.validated_at || a?.provenance?.source === "humain" || a?.statut === "CONFIRMED",
    );

    return {
      trouve: true as const,
      contexte,
      updated_at: ligne.updated_at,
      lectureSeule,
      libelles,
      entete: {
        gmail_message_id: ligne.gmail_message_id,
        direction: ligne.direction,
        recu_le: ligne.recu_le,
      },
      statuts: EMAIL_CONTEXT_STATUSES,
    };
  });

/** Applique une intention humaine (unique mutation du lot, sous garde Q.11). */
export const appliquerValidationContexte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ email_id: z.string().uuid(), intention: intentionSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { lecteurSupabase } = await import("./email-context-resolver.server");
    const { validerContexteEmail } = await import("./email-context-validation.server");
    const intention: IntentionHumaine =
      data.intention.type === "corriger_et_valider"
        ? {
            type: "corriger_et_valider",
            corrections: data.intention.corrections as CorrectionContexte[],
          }
        : data.intention;
    return await validerContexteEmail({
      emailId: data.email_id,
      intention,
      operateurId: context.userId,
      db: lecteurSupabase(context.supabase),
    });
  });
