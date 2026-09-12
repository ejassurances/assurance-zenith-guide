/**
 * RÉFÉRENCES ASSUREUR — JAMAIS DE REMPLACEMENT SILENCIEUX (règle DG).
 *
 * Logique pure décidant ce que fait une écriture AUTOMATIQUE de référence
 * (agent e-mail, extraction de document) quand une référence existe déjà :
 *  - valeur identique  -> aucune écriture, aucune notification ;
 *  - valeur différente -> remplacement + notification indiquant l'ANCIENNE et
 *    la NOUVELLE valeur, même si la source est un e-mail fiable de la compagnie ;
 *  - aucune référence  -> création + notification de l'action de l'agent.
 */

export interface ReferenceExistante {
  id: string;
  reference: string;
  libelle: string | null;
  contrat_id: string | null;
}

export type ActionReference =
  | { action: "inchange"; cible: ReferenceExistante }
  | { action: "creation" }
  | { action: "remplacement"; cible: ReferenceExistante; ancienne: string };

const cle = (v: string) => v.replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Décide l'action pour une référence entrante, à périmètre identique
 * (même assuré/contrat et, si fourni, même nature de référence).
 */
export function classerEcritureReference(
  existantes: ReferenceExistante[],
  entrante: { reference: string; libelle?: string | null; contrat_id?: string | null },
): ActionReference {
  const memePerimetre = existantes.filter(
    (r) => (r.contrat_id ?? null) === (entrante.contrat_id ?? null),
  );
  const memeNature = entrante.libelle
    ? memePerimetre.filter((r) => (r.libelle ?? "").trim().toLowerCase() === entrante.libelle!.trim().toLowerCase())
    : memePerimetre;
  const candidats = memeNature.length > 0 ? memeNature : memePerimetre;

  const identique = candidats.find((r) => cle(r.reference) === cle(entrante.reference));
  if (identique) return { action: "inchange", cible: identique };

  const cible = candidats[0];
  if (!cible) return { action: "creation" };
  return { action: "remplacement", cible, ancienne: cible.reference };
}

/** Corps de la notification visible d'un remplacement de référence. */
export function lignesNotificationRemplacement(params: {
  ancienne: string;
  nouvelle: string;
  libelle?: string | null;
  assure?: string | null;
  source: string;
}): string[] {
  return [
    "Une référence assureur existante a été remplacée automatiquement.",
    params.assure ? `Assuré / contrat : ${params.assure}` : null,
    params.libelle ? `Nature : ${params.libelle}` : null,
    `Ancienne valeur : ${params.ancienne}`,
    `Nouvelle valeur : ${params.nouvelle}`,
    `Source de la nouvelle valeur : ${params.source}`,
    "Vérifiez la valeur retenue : l'ancienne référence peut rester utile au rapprochement.",
  ].filter((l): l is string => !!l);
}
