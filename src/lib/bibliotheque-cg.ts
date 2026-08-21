/**
 * Bibliothèque évolutive des conditions générales apportées par les CLIENTS.
 *
 * Même logique que `produit_documents` pour nos produits partenaires, mais pour
 * les contrats que les clients apportent — y compris de compagnies que le
 * cabinet ne distribue pas. La structure de la grille reste celle du code
 * (`src/lib/garanties-grille.ts`) : seules les valeurs sont extraites puis
 * VALIDÉES par un humain, avec une exigence encore plus stricte que pour nos
 * propres produits (aucune reprise d'une édition non confirmée).
 */

export const BUCKET_CG_CLIENTS = "cg-clients";

/** Branche du recueil → famille de la grille de garanties standardisée. */
export const FAMILLE_PAR_BRANCHE: Record<string, string> = {
  emprunteur: "emprunteur",
  sante: "sante",
  prevoyance: "prevoyance",
  prevoyance_sante: "prevoyance",
  epargne_retraite: "epargne",
  iard: "mrh",
  trottinette: "edpm",
};

export function familleCodePourBranche(branche: string | null | undefined): string | null {
  if (!branche) return null;
  return FAMILLE_PAR_BRANCHE[branche] ?? null;
}

export const NIVEAU_COUVERTURE_SOUHAITE = [
  {
    value: "conserver",
    label: "Conserver un niveau équivalent",
    description: "Garanties au moins équivalentes à mon contrat actuel.",
  },
  {
    value: "ameliorer",
    label: "Faire évoluer ma couverture",
    description: "J'accepte d'étudier une couverture plus large.",
  },
  {
    value: "peu_importe",
    label: "Peu importe",
    description: "Je m'en remets à l'analyse du cabinet.",
  },
] as const;

export function labelNiveauCouverture(value: unknown): string | null {
  return NIVEAU_COUVERTURE_SOUHAITE.find((n) => n.value === value)?.label ?? null;
}

/** Entrée de bibliothèque proposée à la réutilisation. */
export type EntreeBibliothequeCg = {
  id: string;
  compagnie_nom: string;
  branche: string;
  edition_annee: string | null;
  valide: boolean;
  statut: string;
  created_at: string;
  nom_fichier: string | null;
};

/**
 * Une entrée ne peut JAMAIS être réutilisée en confiance quand son édition est
 * inconnue : dans ce cas le vrai document du client est exigé.
 */
export function editionIncertaine(entree: { edition_annee: string | null }): boolean {
  return !entree.edition_annee || entree.edition_annee.trim() === "";
}

export const MESSAGE_EDITION_INCERTAINE =
  "L'année d'édition de ce document n'est pas identifiée : impossible de confirmer qu'il s'agit de la même édition que votre contrat. Merci de déposer quand même votre propre document.";
