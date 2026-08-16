/**
 * Conseil dans la durée — constantes partagées du suivi périodique des contrats.
 * Le calcul des périodicités vit en base (fonction `periodicite_suivi_mois`),
 * ce module ne porte que les libellés et la détection des retours client.
 */

/** Objet exact de l'email de suivi (texte validé par le cabinet). */
export const OBJET_SUIVI_CONTRATS =
  "Point sur votre/vos contrat(s) d'assurance — EJ Partners Assurances";

/** Titre de la note factuelle déposée sur le contrat au retour du client. */
export const TITRE_NOTE_RETOUR_SUIVI = "Retour du client sur le point de suivi";

/** Titre de la note déposée lorsque le cabinet a répondu au client. */
export const TITRE_NOTE_REPONSE_SUIVI = "Réponse apportée au client";

/** Détecte une réponse du client à l'email de suivi périodique (objet, avec ou sans Re:). */
export function sujetEstSuiviContrats(sujet: string | null | undefined): boolean {
  if (!sujet) return false;
  const normalise = sujet
    .toLowerCase()
    .replace(/[—–-]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return normalise.includes("point sur votre/vos contrat(s) d'assurance");
}

/** "votre complémentaire santé et votre assurance emprunteur" */
export function listeLisibleContrats(produits: string[]): string {
  const items = produits
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .map((p) => (/^(votre|vos)\b/i.test(p) ? p : `votre ${p.charAt(0).toLowerCase()}${p.slice(1)}`));
  if (items.length === 0) return "vos contrats d'assurance";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}
