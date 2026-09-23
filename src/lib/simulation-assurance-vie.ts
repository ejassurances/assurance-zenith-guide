/**
 * SIMULATION ASSURANCE VIE — économies de l'assurance emprunteur réinvesties.
 * Fonction PURE. Règles actées avec Erwan (23/09/2026) :
 *
 *  - Effort d'épargne mensuel du client = 50 € − économie mensuelle réalisée
 *    (jamais négatif : si l'économie dépasse déjà 50 €, l'effort est nul et
 *    seule l'économie alimente le contrat).
 *  - Dépôt initial à l'ouverture : 100 €.
 *  - Rendement simulé : 3 % par an, capitalisé mensuellement.
 *  - Le graphique compare 3 scénarios de versement mensuel total :
 *      1. « Économie seule »   — seulement l'économie réalisée, sans effort
 *         supplémentaire du client (montre ce que l'économie apporte seule).
 *      2. « 50 € / mois »      — le montant minimum réellement mis en place
 *         (économie + effort d'épargne du client).
 *      3. « 100 € / mois »     — simulation d'un effort doublé, à titre
 *         d'illustration.
 *  - Aucun frais sur versement n'est appliqué dans ce calcul (mise en avant
 *    commerciale : « nous n'appliquons pas de frais sur les versements »).
 */

export interface SimulationVieEntree {
  /** Économie mensuelle réalisée grâce à la substitution d'assurance emprunteur. */
  economieMensuelle: number;
  /** Durée de la simulation, en années (typiquement la durée résiduelle du prêt). */
  dureeAnnees: number;
  /** Rendement annuel simulé, en % (3 par défaut). */
  rendementAnnuel?: number;
  /** Dépôt initial à l'ouverture, en € (100 par défaut). */
  depotInitial?: number;
  /** Versement mensuel minimum visé, en € (50 par défaut). */
  versementMinimum?: number;
  /** Versement mensuel du scénario "effort doublé", en € (100 par défaut — montant fixe, pas un doublement du minimum réel). */
  versementSimule?: number;
}

export interface LigneAnneeSimulation {
  annee: number;
  economieSeule: number;
  versementMinimum: number;
  versementSimule100: number;
}

export interface ResultatSimulationVie {
  /** 50 − économie mensuelle, jamais négatif. */
  effortEpargne: number;
  /** Montant du versement mensuel minimum réellement mis en place (= max(50, économie)). */
  versementMensuelMinimum: number;
  depotInitial: number;
  rendementAnnuel: number;
  /** Une ligne par année, valorisation de fin d'année pour les 3 scénarios. */
  lignes: LigneAnneeSimulation[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Valeur d'un contrat après n mois, avec un dépôt initial et un versement
 * mensuel constant, à un taux annuel capitalisé mensuellement. Aucun frais
 * sur versement (mise en avant commerciale actée).
 */
function valeurContrat(depotInitial: number, versementMensuel: number, tauxAnnuel: number, mois: number): number {
  const tauxMensuel = tauxAnnuel / 100 / 12;
  let valeur = depotInitial;
  for (let m = 0; m < mois; m++) {
    valeur = valeur * (1 + tauxMensuel) + versementMensuel;
  }
  return r2(valeur);
}

export function simulerAssuranceVie(e: SimulationVieEntree): ResultatSimulationVie {
  const rendement = e.rendementAnnuel ?? 3;
  const depotInitial = e.depotInitial ?? 100;
  const versementMin = e.versementMinimum ?? 50;
  const versementSimule = e.versementSimule ?? 100;

  const economieMensuelle = Math.max(0, r2(e.economieMensuelle));
  const effortEpargne = Math.max(0, r2(versementMin - economieMensuelle));
  const versementMensuelMinimum = economieMensuelle + effortEpargne; // = max(versementMin, économie)

  const lignes: LigneAnneeSimulation[] = [];
  for (let annee = 1; annee <= Math.max(1, Math.round(e.dureeAnnees)); annee++) {
    const mois = annee * 12;
    lignes.push({
      annee,
      economieSeule: valeurContrat(depotInitial, economieMensuelle, rendement, mois),
      versementMinimum: valeurContrat(depotInitial, versementMensuelMinimum, rendement, mois),
      versementSimule100: valeurContrat(depotInitial, versementSimule, rendement, mois),
    });
  }

  return {
    effortEpargne,
    versementMensuelMinimum,
    depotInitial,
    rendementAnnuel: rendement,
    lignes,
  };
}
