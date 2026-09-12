import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  classerEcritureReference,
  lignesNotificationRemplacement,
  type ReferenceExistante,
} from "./reference-remplacement";

/**
 * Écriture AUTOMATIQUE d'une référence assureur (agent e-mail, extraction de
 * document). Unique point d'entrée autorisé : il garantit qu'aucune référence
 * existante n'est remplacée silencieusement — même si la nouvelle valeur vient
 * d'un e-mail fiable de la compagnie, une notification visible indique
 * l'ancienne et la nouvelle valeur.
 */

type Admin = SupabaseClient<Database>;

export interface ResultatEcritureReference {
  action: "inchange" | "creation" | "remplacement" | "refus";
  ancienne?: string;
  nouvelle?: string;
  reference_id?: string;
  motif?: string;
}

export async function ecrireReferenceAutomatique(
  admin: Admin,
  params: {
    dossier_id: string;
    contrat_id?: string | null;
    compagnie_id?: string | null;
    reference: string;
    libelle?: string | null;
    /** Origine de la valeur, citée dans la notification. */
    source: string;
    /** Message Gmail d'origine : clé d'idempotence de la notification. */
    gmail_message_id: string;
    userId: string;
    assure?: string | null;
  },
): Promise<ResultatEcritureReference> {
  const valeur = params.reference.trim();
  if (valeur.length < 5) {
    return { action: "refus", motif: "référence trop courte pour servir de preuve (5 caractères minimum)" };
  }

  const { data, error } = await admin
    .from("dossier_references_externes")
    .select("id, reference, libelle, contrat_id")
    .eq("dossier_id", params.dossier_id)
    .order("created_at", { ascending: false });
  if (error) return { action: "refus", motif: error.message };

  const decision = classerEcritureReference((data ?? []) as ReferenceExistante[], {
    reference: valeur,
    libelle: params.libelle ?? null,
    contrat_id: params.contrat_id ?? null,
  });

  const { notifierActionAgent } = await import("@/lib/agent-notifications.server");

  if (decision.action === "inchange") {
    return { action: "inchange", reference_id: decision.cible.id, nouvelle: valeur };
  }

  if (decision.action === "remplacement") {
    const { error: majErr } = await admin
      .from("dossier_references_externes")
      .update({
        reference: valeur,
        libelle: params.libelle ?? decision.cible.libelle,
        compagnie_id: params.compagnie_id ?? null,
      })
      .eq("id", decision.cible.id)
      .eq("reference", decision.cible.reference);
    if (majErr) return { action: "refus", motif: majErr.message };

    await notifierActionAgent(admin, {
      gmail_message_id: params.gmail_message_id,
      titre: `Référence assureur remplacée — ${valeur}`,
      lignes: lignesNotificationRemplacement({
        ancienne: decision.ancienne,
        nouvelle: valeur,
        libelle: params.libelle ?? decision.cible.libelle,
        assure: params.assure ?? null,
        source: params.source,
      }),
      dossier_id: params.dossier_id,
      priorite: "haute",
      created_by: params.userId,
    }).catch((e: unknown) => {
      console.error("[references] notification de remplacement impossible", e);
      return false;
    });

    return {
      action: "remplacement",
      ancienne: decision.ancienne,
      nouvelle: valeur,
      reference_id: decision.cible.id,
    };
  }

  const { data: cree, error: insErr } = await admin
    .from("dossier_references_externes")
    .insert({
      dossier_id: params.dossier_id,
      contrat_id: params.contrat_id ?? null,
      compagnie_id: params.compagnie_id ?? null,
      reference: valeur,
      libelle: params.libelle ?? null,
      created_by: params.userId,
    })
    .select("id")
    .maybeSingle();
  if (insErr) return { action: "refus", motif: insErr.message };

  await notifierActionAgent(admin, {
    gmail_message_id: params.gmail_message_id,
    titre: `Référence assureur enregistrée automatiquement — ${valeur}`,
    lignes: [
      "L'agent a enregistré une référence assureur sur ce dossier.",
      params.assure ? `Assuré / contrat : ${params.assure}` : null,
      params.libelle ? `Nature : ${params.libelle}` : null,
      `Valeur : ${valeur}`,
      `Source : ${params.source}`,
    ],
    dossier_id: params.dossier_id,
    created_by: params.userId,
  }).catch((e: unknown) => {
    console.error("[references] notification de création impossible", e);
    return false;
  });

  return { action: "creation", nouvelle: valeur, reference_id: (cree as { id: string } | null)?.id };
}

/**
 * Numéro de contrat écrit automatiquement : même règle — un numéro déjà présent
 * n'est jamais remplacé sans notification citant les deux valeurs.
 */
export async function ecrireNumeroContratAutomatique(
  admin: Admin,
  params: {
    contrat_id: string;
    numero: string;
    source: string;
    gmail_message_id: string;
    userId: string;
  },
): Promise<ResultatEcritureReference> {
  const valeur = params.numero.trim();
  if (valeur.length < 5) return { action: "refus", motif: "numéro trop court" };

  const { data, error } = await admin
    .from("contrats")
    .select("id, numero, dossier_id, co_emprunteur")
    .eq("id", params.contrat_id)
    .maybeSingle();
  if (error || !data) return { action: "refus", motif: error?.message ?? "contrat introuvable" };

  const ancienne = (data.numero ?? "").trim();
  const identique = ancienne.replace(/[^a-z0-9]/gi, "").toLowerCase() === valeur.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (ancienne && identique) return { action: "inchange", nouvelle: valeur };

  const { error: majErr } = await admin
    .from("contrats")
    .update({ numero: valeur })
    .eq("id", params.contrat_id);
  if (majErr) return { action: "refus", motif: majErr.message };

  const { notifierActionAgent } = await import("@/lib/agent-notifications.server");
  if (ancienne) {
    await notifierActionAgent(admin, {
      gmail_message_id: params.gmail_message_id,
      titre: `Numéro de contrat remplacé — ${valeur}`,
      lignes: lignesNotificationRemplacement({
        ancienne,
        nouvelle: valeur,
        libelle: "Numéro de contrat",
        assure: data.co_emprunteur ?? "Assuré principal",
        source: params.source,
      }),
      dossier_id: data.dossier_id ?? null,
      priorite: "haute",
      created_by: params.userId,
    }).catch(() => false);
    return { action: "remplacement", ancienne, nouvelle: valeur };
  }

  return { action: "creation", nouvelle: valeur };
}
