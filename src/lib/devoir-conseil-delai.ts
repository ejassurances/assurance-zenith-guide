/**
 * Délai de réflexion avant envoi du devoir de conseil (agent commercial) :
 * au moins 16 h après la signature de la lettre de mission, et uniquement
 * pendant les horaires d'ouverture du cabinet (lundi-vendredi, 9h-18h,
 * heure de Paris).
 */

export const DELAI_HEURES = 16;
const OUVERTURE = 9;
const FERMETURE = 18;

/** Heure et jour de la semaine à Paris pour un instant donné. */
function parisParts(d: Date): { jour: number; heure: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const val = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const jours = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    jour: Math.max(0, jours.indexOf(val("weekday"))),
    heure: Number(val("hour")) % 24,
    minute: Number(val("minute")),
  };
}

export function dansHorairesOuverture(maintenant: Date = new Date()): boolean {
  const { jour, heure } = parisParts(maintenant);
  if (jour === 0 || jour === 6) return false;
  return heure >= OUVERTURE && heure < FERMETURE;
}

export interface EtatDelaiEnvoi {
  autorise: boolean;
  motif: string | null;
  /** Instant à partir duquel le délai de 16 h est écoulé. */
  disponible_le: Date | null;
}

/**
 * L'envoi du devoir de conseil est-il autorisé maintenant ?
 * `signeLe` = date de signature de la lettre de mission (null = non signée).
 */
export function etatDelaiEnvoi(signeLe: string | Date | null, maintenant: Date = new Date()): EtatDelaiEnvoi {
  if (!signeLe) {
    return {
      autorise: false,
      motif: "La lettre de mission doit être signée par le client avant l'envoi du devoir de conseil.",
      disponible_le: null,
    };
  }
  const signature = signeLe instanceof Date ? signeLe : new Date(signeLe);
  const dispo = new Date(signature.getTime() + DELAI_HEURES * 3600 * 1000);

  if (maintenant < dispo) {
    const restant = Math.ceil((dispo.getTime() - maintenant.getTime()) / 3600000);
    return {
      autorise: false,
      motif: `Délai de réflexion de ${DELAI_HEURES} h après la signature de la lettre de mission : envoi possible dans ${restant} h (le ${dispo.toLocaleString("fr-FR")}).`,
      disponible_le: dispo,
    };
  }
  if (!dansHorairesOuverture(maintenant)) {
    return {
      autorise: false,
      motif: `Envoi possible uniquement pendant les horaires d'ouverture du cabinet (lundi-vendredi, ${OUVERTURE}h-${FERMETURE}h).`,
      disponible_le: dispo,
    };
  }
  return { autorise: true, motif: null, disponible_le: dispo };
}
