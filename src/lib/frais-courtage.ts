/**
 * FRAIS DE COURTAGE (= FRAIS DE DISTRIBUTION, synonymes) — fonction PURE.
 *
 * Règle actée avec Erwan (22/09/2026) :
 *  1. Base = 10 % de l'économie brute réalisée par le client (cotisations
 *     seules, avant tout frais).
 *  2. Plancher = 175 € par assuré sur le contrat.
 *  3. Si la base est déjà inférieure ou égale au plancher, le plancher
 *     s'applique tel quel — aucune déduction des frais partenaires.
 *  4. Si la base dépasse le plancher, on déduit ce que le partenaire
 *     (grossiste/compagnie) retient pour lui (frais de dossier + frais
 *     d'adhésion partenaires), sans jamais redescendre sous le plancher.
 *
 * Le client ne voit qu'un seul montant de frais de courtage au final ; la
 * répartition cabinet / partenaire reste un détail interne (affiché dans le
 * devoir de conseil, pas comme deux lignes côté client).
 *
 * Ce que cette fonction NE couvre PAS (non actée / pas assez précisée pour
 * être codée sans risque) : l'échelonnement sur 12 mois, le prélèvement
 * combiné du premier mois, le popup d'information client, l'alerte au
 * courtier pour mise à jour de l'intranet partenaire. Chantier séparé.
 */

export interface FraisCourtageEntree {
  /** Économie brute réalisée (cotisations seules), sur la durée résiduelle du prêt. */
  economieBrute: number | null;
  /** Nombre d'assurés sur le contrat (têtes assurées). */
  nbAssures: number | null;
  /** Frais de dossier retenus par le partenaire (grossiste/compagnie), pas pour le cabinet. */
  fraisDossierPartenaire?: number | null;
  /** Frais d'adhésion retenus par le partenaire, pas pour le cabinet. */
  fraisAdhesionPartenaire?: number | null;
}

export interface FraisCourtageResultat {
  /** Montant final facturé au client au titre des frais de courtage (= frais de distribution). */
  montant: number;
  /** 10 % de l'économie brute, avant application du plancher ou déduction partenaire. */
  base: number;
  /** 175 € × nombre d'assurés. */
  plancher: number;
  /** true si le plancher a été appliqué directement (base ≤ plancher, pas de déduction). */
  planchierApplique: boolean;
  /** Part réellement retenue par le(s) partenaire(s), déduite du montant — 0 si le plancher s'applique tel quel. */
  partPartenaireDeduite: number;
  /** Part qui reste au cabinet une fois la part partenaire déduite. */
  partCabinet: number;
}

const PLANCHER_PAR_ASSURE = 175;
const TAUX_COURTAGE = 0.1;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcule le montant de frais de courtage. Retourne null si les données
 * indispensables (économie, nombre d'assurés) manquent — jamais une
 * estimation inventée à leur place.
 */
export function calculerFraisCourtage(e: FraisCourtageEntree): FraisCourtageResultat | null {
  if (e.economieBrute == null || !Number.isFinite(e.economieBrute) || e.economieBrute <= 0) return null;
  if (e.nbAssures == null || !Number.isFinite(e.nbAssures) || e.nbAssures < 1) return null;

  const base = r2(e.economieBrute * TAUX_COURTAGE);
  const plancher = r2(PLANCHER_PAR_ASSURE * e.nbAssures);

  if (base <= plancher) {
    return {
      montant: plancher,
      base,
      plancher,
      planchierApplique: true,
      partPartenaireDeduite: 0,
      partCabinet: plancher,
    };
  }

  const partPartenaire = r2((e.fraisDossierPartenaire ?? 0) + (e.fraisAdhesionPartenaire ?? 0));
  const montant = Math.max(plancher, r2(base - partPartenaire));
  return {
    montant,
    base,
    plancher,
    planchierApplique: false,
    partPartenaireDeduite: r2(base - montant > 0 ? partPartenaire : 0),
    partCabinet: montant,
  };
}
