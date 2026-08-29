/**
 * Garde-fou anti-doublon des accusés de réception automatiques.
 *
 * Règle du cabinet : un client ne doit jamais recevoir plusieurs accusés de
 * réception pour une même demande. Avant tout envoi, l'agent regarde
 * l'historique CRM (`activites`) et s'abstient si :
 *   - un accusé du même genre a déjà été envoyé pour ce message Gmail ;
 *   - un accusé du même genre a déjà été envoyé pour le même fil Gmail ;
 *   - un accusé du même genre a été envoyé au même client dans la fenêtre
 *     glissante (72 h par défaut) — cas du client qui relance par plusieurs
 *     messages successifs sur la même demande.
 *
 * Lecture seule : aucune décision d'envoi n'est prise ici.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<any, any, any>;

/** Genres d'accusés suivis dans l'historique (un titre d'activité par genre). */
export const TITRE_ACCUSE = {
  message: "Accusé de réception automatique envoyé au client",
  pieces: "Accusé de réception des pièces jointes envoyé au client",
} as const;

export type GenreAccuse = keyof typeof TITRE_ACCUSE;

/** Fenêtre glissante par défaut : 72 heures. */
export const FENETRE_HEURES = 72;

export interface DemandeAccuse {
  client_id: string;
  genre: GenreAccuse;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
  fenetre_heures?: number;
}

export interface DecisionAccuse {
  /** Vrai si un accusé peut être envoyé. */
  autorise: boolean;
  /** Motif du refus, journalisable tel quel. */
  motif?: string;
}

/** Repère `id` (message ou fil) dans le contenu d'une activité. */
function contient(contenu: string | null | undefined, id: string | null | undefined): boolean {
  if (!contenu || !id) return false;
  return contenu.includes(id);
}

/**
 * Décide si un accusé de réception peut partir, en s'appuyant uniquement sur
 * l'historique CRM du client.
 */
export async function accuseAutorise(admin: Admin, d: DemandeAccuse): Promise<DecisionAccuse> {
  const titre = TITRE_ACCUSE[d.genre];
  const heures = d.fenetre_heures ?? FENETRE_HEURES;
  const depuis = new Date(Date.now() - heures * 3600 * 1000).toISOString();

  try {
    const { data, error } = await admin
      .from("activites")
      .select("id, contenu, created_at")
      .eq("client_id", d.client_id)
      .eq("titre", titre)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      // En cas d'erreur de lecture, on n'envoie pas : mieux vaut un accusé
      // manquant qu'un doublon chez le client.
      return { autorise: false, motif: `Historique illisible : ${error.message}` };
    }

    const historique = (data ?? []) as { contenu: string | null; created_at: string }[];

    for (const a of historique) {
      if (contient(a.contenu, d.gmail_message_id)) {
        return { autorise: false, motif: "Accusé déjà envoyé pour ce message." };
      }
      if (contient(a.contenu, d.gmail_thread_id)) {
        return { autorise: false, motif: "Accusé déjà envoyé pour ce fil de discussion." };
      }
    }

    const recent = historique.find((a) => a.created_at >= depuis);
    if (recent) {
      return {
        autorise: false,
        motif: `Accusé déjà envoyé au client il y a moins de ${heures} h (${recent.created_at}).`,
      };
    }

    return { autorise: true };
  } catch (e) {
    return { autorise: false, motif: e instanceof Error ? e.message : "erreur inconnue" };
  }
}
