/**
 * Économie RÉELLEMENT réalisée sur un contrat d'assurance emprunteur.
 * Comparaison : coût du contrat groupe bancaire (capital initial, non dégressif)
 * vs coût du contrat délégué courtier (capital restant dû, dégressif).
 *
 * Le résultat est figé en base à la signature du contrat (photo du calcul).
 */
import {
  SURPRIME_FUMEUR,
  coutTotalCourtier,
  coutTotalGroupe,
  getRatesForAge,
} from "./insurance-rates";

export type EconomieInput = {
  capitalInitial: number | null;
  dureeMois: number | null;
  quotite: number | null;
  /** Taux assurance réellement négocié sur le contrat (décimal, ex. 0.0032) */
  tauxAssuranceAnnuel: number | null;
  dateNaissance: string | null;
  fumeur: boolean | null;
  dateEffet: string | null;
};

export type EconomieResult = {
  coutGroupe: number;
  coutDelegue: number;
  economie: number;
  tauxGroupe: number; // en % / an
  tauxDelegue: number; // en % / an
  base: {
    age: number;
    fumeur: boolean;
    capital_initial: number;
    duree_mois: number;
    quotite: number;
    taux_source: "contrat" | "table";
  };
};
function round2(n: number) {
  return Math.round(n * 100) / 100;
}


export function ageALaDate(dateNaissance: string | null, reference: string | null): number | null {
  if (!dateNaissance) return null;
  const naissance = new Date(dateNaissance);
  const ref = reference ? new Date(reference) : new Date();
  if (Number.isNaN(naissance.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - naissance.getFullYear();
  const m = ref.getMonth() - naissance.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < naissance.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

/**
 * Retourne null si les données du contrat ne permettent pas un calcul fiable.
 */
export function calculerEconomieEmprunteur(input: EconomieInput): EconomieResult | null {
  const capital = Number(input.capitalInitial ?? 0);
  const dureeMois = Number(input.dureeMois ?? 0);
  const age = ageALaDate(input.dateNaissance, input.dateEffet);
  if (capital <= 0 || dureeMois <= 0 || age === null) return null;

  const dureeAnnees = dureeMois / 12;
  const quotite = Number(input.quotite ?? 100) / 100;
  const fumeur = Boolean(input.fumeur);
  const surprime = fumeur ? SURPRIME_FUMEUR : 0;
  const rates = getRatesForAge(age);

  const tauxGroupe = rates.taux_groupe + surprime;
  const tauxContratPct =
    input.tauxAssuranceAnnuel && input.tauxAssuranceAnnuel > 0 ? input.tauxAssuranceAnnuel * 100 : null;
  const tauxDelegue = tauxContratPct ?? rates.taux_courtier + surprime;

  const coutGroupe = coutTotalGroupe(capital, dureeAnnees, tauxGroupe) * quotite;
  const coutDelegue = coutTotalCourtier(capital, dureeAnnees, tauxDelegue) * quotite;
  const economie = Math.max(0, coutGroupe - coutDelegue);

  return {
    coutGroupe: round2(coutGroupe),
    coutDelegue: round2(coutDelegue),
    economie: round2(economie),
    tauxGroupe,
    tauxDelegue,
    base: {
      age,
      fumeur,
      capital_initial: capital,
      duree_mois: dureeMois,
      quotite: Number(input.quotite ?? 100),
      taux_source: tauxContratPct ? "contrat" : "table",
    },
  };
}

/** Colonnes `contrats` à écrire pour figer (ou effacer) l'économie. */
export function economieColumns(res: EconomieResult | null) {
  if (!res) {
    return {
      economie_cout_groupe: null,
      economie_cout_delegue: null,
      economie_realisee: null,
      economie_taux_groupe: null,
      economie_taux_delegue: null,
      economie_base: null,
      economie_calculee_le: null,
    };
  }
  return {
    economie_cout_groupe: res.coutGroupe,
    economie_cout_delegue: res.coutDelegue,
    economie_realisee: res.economie,
    economie_taux_groupe: res.tauxGroupe,
    economie_taux_delegue: res.tauxDelegue,
    economie_base: res.base,
    economie_calculee_le: new Date().toISOString(),
  };
}

export function formatEuro(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(n));
}
