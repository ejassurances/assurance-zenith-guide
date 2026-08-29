/**
 * Heures d'ouverture du cabinet et délai métier des sorties automatiques.
 *
 * Module PUR, source unique de vérité : aucune réponse automatique ne part hors
 * des heures d'ouverture, et jamais avant le délai métier de 45 minutes après
 * réception (fenêtre pendant laquelle un humain peut reprendre la main).
 */

/** Délai métier minimal entre la réception d'un email et une sortie automatique. */
export const DELAI_REPONSE_MINUTES = 45;

/** Lundi = 1 … Vendredi = 5. Samedi et dimanche : fermé. */
export const JOURS_OUVRES = [1, 2, 3, 4, 5];
export const HEURE_OUVERTURE = 9;
export const HEURE_FERMETURE = 18;

const ZONE = "Europe/Paris";

/** Décalage de Paris par rapport à UTC, en minutes, pour un instant donné. */
function offsetParisMinutes(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = fmt.formatToParts(d);
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value ?? "0");
  const local = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour") % 24, v("minute"), v("second"));
  return Math.round((local - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** Représentation locale (Paris) d'un instant. */
function local(d: Date): { date: Date; offset: number } {
  const offset = offsetParisMinutes(d);
  return { date: new Date(d.getTime() + offset * 60000), offset };
}

/** L'instant est-il dans les heures d'ouverture du cabinet ? */
export function dansHeuresOuverture(d: Date = new Date()): boolean {
  const { date } = local(d);
  const jour = date.getUTCDay();
  if (!JOURS_OUVRES.includes(jour)) return false;
  const heure = date.getUTCHours();
  return heure >= HEURE_OUVERTURE && heure < HEURE_FERMETURE;
}

/** Prochaine ouverture (ou l'instant lui-même s'il est déjà ouvré). */
export function prochaineOuverture(d: Date = new Date()): Date {
  if (dansHeuresOuverture(d)) return d;
  let curseur = d;
  for (let i = 0; i < 14; i++) {
    const { date, offset } = local(curseur);
    const jour = date.getUTCDay();
    const heure = date.getUTCHours();
    const ouvreAujourdhui = JOURS_OUVRES.includes(jour) && heure < HEURE_OUVERTURE;
    const cibleLocale = ouvreAujourdhui
      ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), HEURE_OUVERTURE, 0, 0)
      : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, HEURE_OUVERTURE, 0, 0);
    const candidat = new Date(cibleLocale - offset * 60000);
    if (dansHeuresOuverture(candidat) && candidat.getTime() > d.getTime()) return candidat;
    curseur = candidat;
  }
  return curseur;
}

/**
 * Heure de sortie autorisée pour une réponse automatique :
 * réception + 45 minutes, reportée à la prochaine ouverture si nécessaire.
 */
export function prochaineSortieAutorisee(recuLe: Date, maintenant: Date = new Date()): Date {
  const base = new Date(Math.max(recuLe.getTime(), maintenant.getTime() - 0) + DELAI_REPONSE_MINUTES * 60000);
  const cible = new Date(Math.max(base.getTime(), maintenant.getTime() + DELAI_REPONSE_MINUTES * 60000));
  return prochaineOuverture(cible);
}
