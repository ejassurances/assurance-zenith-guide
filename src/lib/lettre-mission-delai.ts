/**
 * Délai fixe avant envoi de la lettre de mission : au moins 8 h après le DER
 * (signature si elle existe, sinon envoi), et uniquement pendant les horaires
 * d'ouverture du cabinet — même mécanisme que le délai de 6 h du devoir de
 * conseil. Aucune validation humaine n'est requise : seul le délai s'applique.
 */

import { dansHorairesOuverture } from "./devoir-conseil-delai";

export const DELAI_LM_HEURES = 8;

export interface EtatDelaiLettreMission {
  autorise: boolean;
  motif: string | null;
  /** Instant à partir duquel le délai de 8 h est écoulé. */
  disponible_le: Date | null;
}

/**
 * L'envoi automatique de la lettre de mission est-il autorisé maintenant ?
 * `derLe` = date de référence du DER (signature ou envoi ; null = pas de DER).
 */
export function etatDelaiLettreMission(
  derLe: string | Date | null,
  maintenant: Date = new Date(),
): EtatDelaiLettreMission {
  if (!derLe) {
    return {
      autorise: false,
      motif: "Le DER doit avoir été transmis au client avant l'envoi de la lettre de mission.",
      disponible_le: null,
    };
  }
  const base = derLe instanceof Date ? derLe : new Date(derLe);
  const dispo = new Date(base.getTime() + DELAI_LM_HEURES * 3600 * 1000);

  if (maintenant < dispo) {
    const restant = Math.ceil((dispo.getTime() - maintenant.getTime()) / 3600000);
    return {
      autorise: false,
      motif: `Délai de ${DELAI_LM_HEURES} h après le DER : envoi possible dans ${restant} h (le ${dispo.toLocaleString("fr-FR")}).`,
      disponible_le: dispo,
    };
  }
  if (!dansHorairesOuverture(maintenant)) {
    return {
      autorise: false,
      motif: "Envoi possible uniquement pendant les horaires d'ouverture du cabinet (lundi-vendredi, 9h-18h).",
      disponible_le: dispo,
    };
  }
  return { autorise: true, motif: null, disponible_le: dispo };
}
