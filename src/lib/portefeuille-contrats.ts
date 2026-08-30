/**
 * D5 — Portefeuille de contrats : classification pure (aucun accès base).
 *
 * Chaque contrat actif est classé en quatre états de suivi :
 *  - « echeance_proche »    : échéance dans les 60 jours ;
 *  - « suivi_du »           : le prochain point de suivi est échu ;
 *  - « suivi_non_planifie » : aucun point de suivi planifié ;
 *  - « a_jour »             : rien à faire dans l'immédiat.
 */

export type EtatContrat = "echeance_proche" | "suivi_du" | "suivi_non_planifie" | "a_jour";

/** Statuts considérés comme « en portefeuille » (contrats vivants). */
export const STATUTS_PORTEFEUILLE = ["actif", "en_cours", "en_gestion"] as const;

/** Fenêtre (jours) d'anticipation d'une échéance. */
export const FENETRE_ECHEANCE_JOURS = 60;

export interface LigneContrat {
  contrat_id: string;
  numero: string | null;
  client_id: string | null;
  client_nom: string | null;
  produit: string;
  assureur: string;
  compagnie_nom: string | null;
  statut: string;
  date_effet: string | null;
  date_echeance: string | null;
  prochain_suivi_le: string | null;
  prime_annuelle: number | null;
  is_emprunteur: boolean;
  etat: EtatContrat;
  /** Jours restants avant l'échéance (négatif si dépassée), null si inconnue. */
  jours_avant_echeance: number | null;
}

const JOUR_MS = 86_400_000;

/** Nombre de jours entiers entre `reference` et `date` (positif dans le futur). */
export function joursRestants(date: string | null | undefined, reference: Date): number | null {
  if (!date) return null;
  const cible = new Date(date);
  if (Number.isNaN(cible.getTime())) return null;
  const a = Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth(), cible.getUTCDate());
  const b = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  return Math.round((a - b) / JOUR_MS);
}

/** Classe un contrat selon son échéance et son point de suivi. */
export function classifierContrat(
  c: { date_echeance: string | null; prochain_suivi_le: string | null },
  reference: Date = new Date(),
): { etat: EtatContrat; jours_avant_echeance: number | null } {
  const jours = joursRestants(c.date_echeance, reference);
  if (jours !== null && jours <= FENETRE_ECHEANCE_JOURS) {
    return { etat: "echeance_proche", jours_avant_echeance: jours };
  }
  const suivi = joursRestants(c.prochain_suivi_le, reference);
  if (suivi === null) return { etat: "suivi_non_planifie", jours_avant_echeance: jours };
  if (suivi <= 0) return { etat: "suivi_du", jours_avant_echeance: jours };
  return { etat: "a_jour", jours_avant_echeance: jours };
}

export interface AgregatsPortefeuille {
  total: number;
  prime_annuelle_totale: number;
  par_etat: Record<EtatContrat, number>;
  par_compagnie: { nom: string; nb: number; prime: number }[];
}

/** Agrège les compteurs et primes du portefeuille. */
export function agregerPortefeuille(lignes: LigneContrat[]): AgregatsPortefeuille {
  const par_etat: Record<EtatContrat, number> = {
    echeance_proche: 0,
    suivi_du: 0,
    suivi_non_planifie: 0,
    a_jour: 0,
  };
  const compagnies = new Map<string, { nb: number; prime: number }>();
  let prime = 0;

  for (const l of lignes) {
    par_etat[l.etat] += 1;
    prime += Number(l.prime_annuelle ?? 0);
    const nom = l.compagnie_nom ?? l.assureur ?? "—";
    const acc = compagnies.get(nom) ?? { nb: 0, prime: 0 };
    acc.nb += 1;
    acc.prime += Number(l.prime_annuelle ?? 0);
    compagnies.set(nom, acc);
  }

  return {
    total: lignes.length,
    prime_annuelle_totale: Math.round(prime * 100) / 100,
    par_etat,
    par_compagnie: [...compagnies.entries()]
      .map(([nom, v]) => ({ nom, nb: v.nb, prime: Math.round(v.prime * 100) / 100 }))
      .sort((a, b) => b.prime - a.prime || b.nb - a.nb),
  };
}

export const LABEL_ETAT: Record<EtatContrat, string> = {
  echeance_proche: "Échéance proche",
  suivi_du: "Suivi à faire",
  suivi_non_planifie: "Suivi non planifié",
  a_jour: "À jour",
};
