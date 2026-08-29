/**
 * ANALYSE ÉPARGNE (assurance-vie / PER) — fonctions PURES.
 *
 * Principes non négociables :
 *  - aucune donnée inventée : un frais, un rendement ou un encours absent du
 *    relevé reste `null` et l'analyse le signale comme non disponible ;
 *  - le rendement retenu est celui RÉELLEMENT CONSTATÉ sur le contrat du
 *    prospect (relevé annuel), jamais une hypothèse commerciale ;
 *  - la comparaison porte uniquement sur les FRAIS (versement / gestion) : à
 *    rendement brut identique, seul l'écart de frais explique l'écart de
 *    performance nette ;
 *  - le module ne décide rien : il calcule, le conseiller conclut (devoir de
 *    conseil en validation humaine).
 */

export type ProfilRisque = "prudent" | "equilibre" | "dynamique";

/** Données du contrat actuel du prospect, telles que lues sur son relevé. */
export interface ContratEpargneActuel {
  assureur: string | null;
  contrat: string | null;
  /** Encours à la date du relevé (€). */
  valeur_actuelle: number | null;
  /** Encours au début de la période couverte par le relevé (€). */
  valeur_initiale: number | null;
  /** Versements réalisés sur la période (€). */
  versements_periode: number | null;
  /** Performance NETTE annuelle constatée sur la période (%). */
  performance_nette_pct: number | null;
  /** Frais de gestion annuels du contrat actuel (%). */
  frais_gestion_pct: number | null;
  /** Frais sur versement du contrat actuel (%). */
  frais_versement_pct: number | null;
  /** Date du relevé (AAAA-MM-JJ). */
  date_releve: string | null;
  /** Nombre d'années couvertes par le relevé (par défaut 1). */
  annees_periode: number | null;
}

/** Notre offre : frais issus du catalogue produits du cabinet. */
export interface OffreEpargneCabinet {
  produit_id: string | null;
  produit_nom: string;
  assureur: string | null;
  frais_versement_pct: number | null;
  frais_gestion_pct: number | null;
}

export interface HypothesesProjection {
  /** Versement initial ou encours transféré (€). */
  capital_initial: number;
  /** Versements réguliers (€ / mois). */
  versement_mensuel: number;
  /** Rendement BRUT annuel retenu (%), avant frais de gestion. */
  rendement_brut_pct: number;
  /** Origine du rendement retenu — tracé dans l'étude. */
  source_rendement: "contrat_actuel" | "aucune";
}

export interface PointProjection {
  annees: number;
  valeur_actuel: number | null;
  valeur_cabinet: number;
  ecart_euros: number | null;
  ecart_pct: number | null;
}

export interface ComparatifEpargne {
  disponible: boolean;
  /** Motif lorsque la comparaison n'est pas possible. */
  motif: string | null;
  rendement_brut_pct: number | null;
  rendement_net_actuel_pct: number | null;
  rendement_net_cabinet_pct: number | null;
  /** Écart de performance nette annuelle en points de %. */
  gain_annuel_points: number | null;
  /** Rétrospective : ce que le contrat aurait rapporté avec nos frais. */
  retrospective: {
    annees: number;
    valeur_constatee: number;
    valeur_avec_nos_frais: number;
    gain_euros: number;
    gain_pct: number;
  } | null;
  projections: PointProjection[];
}

export const HORIZONS_PROJECTION = [3, 8, 10] as const;

/** Répartition indicative fonds euros / unités de compte selon le profil. */
export const REPARTITION_PROFIL: Record<ProfilRisque, { euros_pct: number; uc_pct: number }> = {
  prudent: { euros_pct: 80, uc_pct: 20 },
  equilibre: { euros_pct: 50, uc_pct: 50 },
  dynamique: { euros_pct: 20, uc_pct: 80 },
};

function nombre(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Rendement BRUT constaté : performance nette du relevé + frais de gestion
 * réellement supportés. Sans performance nette écrite au relevé, aucun
 * rendement n'est retenu (aucune hypothèse inventée).
 */
export function rendementBrutConstate(actuel: ContratEpargneActuel): number | null {
  const net = nombre(actuel.performance_nette_pct);
  if (net === null) return null;
  const gestion = nombre(actuel.frais_gestion_pct) ?? 0;
  return Math.round((net + gestion) * 100) / 100;
}

/**
 * Capitalisation d'un capital + versements mensuels, frais sur versement
 * prélevés à l'entrée et frais de gestion prélevés annuellement.
 */
export function capitaliser(input: {
  capital_initial: number;
  versement_mensuel: number;
  annees: number;
  rendement_brut_pct: number;
  frais_versement_pct: number;
  frais_gestion_pct: number;
}): number {
  const net = (input.rendement_brut_pct - input.frais_gestion_pct) / 100;
  const mensuelNet = input.versement_mensuel * (1 - input.frais_versement_pct / 100);
  let valeur = input.capital_initial * (1 - input.frais_versement_pct / 100);
  const mois = Math.round(input.annees * 12);
  const tauxMensuel = net === 0 ? 0 : Math.pow(1 + net, 1 / 12) - 1;
  for (let m = 0; m < mois; m++) {
    valeur = valeur * (1 + tauxMensuel) + mensuelNet;
  }
  return Math.round(valeur * 100) / 100;
}

/**
 * Comparatif complet contrat actuel / offre du cabinet, à rendement brut
 * constaté identique. Retourne `disponible: false` avec un motif explicite
 * quand une donnée indispensable manque.
 */
export function comparerEpargne(input: {
  actuel: ContratEpargneActuel | null;
  offre: OffreEpargneCabinet;
  capital_initial: number;
  versement_mensuel: number;
  /** Rendement brut de repli lorsqu'il n'y a aucun contrat actuel (0 = aucun). */
  rendement_brut_pct?: number | null;
}): ComparatifEpargne {
  const fraisVersementCabinet = nombre(input.offre.frais_versement_pct);
  const fraisGestionCabinet = nombre(input.offre.frais_gestion_pct);
  if (fraisVersementCabinet === null || fraisGestionCabinet === null) {
    return {
      disponible: false,
      motif:
        "Frais du produit du cabinet non renseignés au catalogue : comparaison non disponible pour ce produit.",
      rendement_brut_pct: null,
      rendement_net_actuel_pct: null,
      rendement_net_cabinet_pct: null,
      gain_annuel_points: null,
      retrospective: null,
      projections: [],
    };
  }

  const brut = input.actuel
    ? rendementBrutConstate(input.actuel)
    : (nombre(input.rendement_brut_pct) ?? null);
  if (brut === null) {
    return {
      disponible: false,
      motif:
        "Aucune performance constatée disponible sur le relevé du contrat actuel : projection non disponible (aucune hypothèse de rendement n'est inventée).",
      rendement_brut_pct: null,
      rendement_net_actuel_pct: null,
      rendement_net_cabinet_pct: null,
      gain_annuel_points: null,
      retrospective: null,
      projections: [],
    };
  }

  const fraisGestionActuel = input.actuel ? nombre(input.actuel.frais_gestion_pct) : null;
  const fraisVersementActuel = input.actuel ? nombre(input.actuel.frais_versement_pct) : null;
  const netActuel = fraisGestionActuel === null ? null : Math.round((brut - fraisGestionActuel) * 100) / 100;
  const netCabinet = Math.round((brut - fraisGestionCabinet) * 100) / 100;

  const projections: PointProjection[] = HORIZONS_PROJECTION.map((annees) => {
    const cabinet = capitaliser({
      capital_initial: input.capital_initial,
      versement_mensuel: input.versement_mensuel,
      annees,
      rendement_brut_pct: brut,
      frais_versement_pct: fraisVersementCabinet,
      frais_gestion_pct: fraisGestionCabinet,
    });
    const actuel =
      fraisGestionActuel === null || fraisVersementActuel === null
        ? null
        : capitaliser({
            capital_initial: input.capital_initial,
            versement_mensuel: input.versement_mensuel,
            annees,
            rendement_brut_pct: brut,
            frais_versement_pct: fraisVersementActuel,
            frais_gestion_pct: fraisGestionActuel,
          });
    return {
      annees,
      valeur_actuel: actuel,
      valeur_cabinet: cabinet,
      ecart_euros: actuel === null ? null : Math.round((cabinet - actuel) * 100) / 100,
      ecart_pct:
        actuel === null || actuel === 0
          ? null
          : Math.round(((cabinet - actuel) / actuel) * 10000) / 100,
    };
  });

  // Rétrospective : « avec nos frais, vous auriez eu X € de plus ».
  let retrospective: ComparatifEpargne["retrospective"] = null;
  const valeurActuelle = input.actuel ? nombre(input.actuel.valeur_actuelle) : null;
  const valeurInitiale = input.actuel ? nombre(input.actuel.valeur_initiale) : null;
  const annees = input.actuel ? (nombre(input.actuel.annees_periode) ?? 1) : null;
  if (
    valeurActuelle !== null &&
    valeurInitiale !== null &&
    annees !== null &&
    annees > 0 &&
    fraisGestionActuel !== null
  ) {
    const versementsAnnuels = ((input.actuel && nombre(input.actuel.versements_periode)) ?? 0) / annees;
    const avecNosFrais = capitaliser({
      capital_initial: valeurInitiale,
      versement_mensuel: versementsAnnuels / 12,
      annees,
      rendement_brut_pct: brut,
      frais_versement_pct: fraisVersementCabinet,
      frais_gestion_pct: fraisGestionCabinet,
    });
    retrospective = {
      annees,
      valeur_constatee: valeurActuelle,
      valeur_avec_nos_frais: avecNosFrais,
      gain_euros: Math.round((avecNosFrais - valeurActuelle) * 100) / 100,
      gain_pct:
        valeurActuelle === 0
          ? 0
          : Math.round(((avecNosFrais - valeurActuelle) / valeurActuelle) * 10000) / 100,
    };
  }

  return {
    disponible: true,
    motif: null,
    rendement_brut_pct: brut,
    rendement_net_actuel_pct: netActuel,
    rendement_net_cabinet_pct: netCabinet,
    gain_annuel_points: netActuel === null ? null : Math.round((netCabinet - netActuel) * 100) / 100,
    retrospective,
    projections,
  };
}

/** Lecture tolérante d'une extraction `releves_placements` vers le modèle d'analyse. */
export function contratActuelDepuisExtraction(
  donnees: Record<string, unknown> | null,
): ContratEpargneActuel | null {
  if (!donnees) return null;
  const c: ContratEpargneActuel = {
    assureur: typeof donnees["assureur"] === "string" ? donnees["assureur"] : null,
    contrat: typeof donnees["nom_contrat"] === "string" ? donnees["nom_contrat"] : null,
    valeur_actuelle: nombre(donnees["valeur_acquise"]),
    valeur_initiale: nombre(donnees["valeur_debut_periode"]),
    versements_periode: nombre(donnees["versements_periode"]),
    performance_nette_pct: nombre(donnees["performance_nette_pct"]),
    frais_gestion_pct: nombre(donnees["frais_gestion_pct"]),
    frais_versement_pct: nombre(donnees["frais_versement_pct"]),
    date_releve: typeof donnees["date_releve"] === "string" ? donnees["date_releve"] : null,
    annees_periode: nombre(donnees["annees_periode"]) ?? 1,
  };
  const renseigne = Object.values(c).some((v) => v !== null && v !== 1);
  return renseigne ? c : null;
}
