/**
 * NORMALISATION DU RECUEIL EMPRUNTEUR (fonction PURE).
 *
 * Un dossier emprunteur = UN PRÊT, avec le détail de chaque personne assurée
 * sur ce prêt (assuré principal + co-emprunteurs, chacun avec sa quotité).
 *
 * Les dossiers déjà en cours ont été saisis avant cette structure : leur
 * recueil est vide ou porte des clés anciennes (`capital_emprunte`, `quotite`,
 * `cotisation_mensuelle`…) et aucune liste d'assurés. Cette fonction reconstitue
 * le recueil au format actuel à partir de ce qui est DÉJÀ CONNU (dossier, fiche
 * client, conjoint), sans rien déduire ni écraser :
 *  - une valeur déjà présente n'est jamais remplacée ;
 *  - aucune donnée personnelle n'est inventée : un assuré sans date de
 *    naissance connue reste signalé comme incomplet ;
 *  - la reconstitution ne vaut pas validation du recueil (DDA humaine).
 */

export interface DossierEmprunteurSource {
  capital?: number | null;
  duree_mois?: number | null;
  taux_pret?: number | null;
}

export interface PersonneSourceEmprunteur {
  lien: "principal" | "co_emprunteur";
  nom?: string | null;
  date_naissance?: string | null;
  csp?: string | null;
  fumeur?: boolean | null;
  quotite_pct?: number | null;
}

export interface NormalisationRecueilResultat {
  recueil: Record<string, unknown>;
  /** Clés réellement ajoutées/reconstituées. */
  ajouts: string[];
  /** Champs du prêt encore manquants après reconstitution. */
  manquants: string[];
}

/** Anciennes clés → clés du schéma actuel. */
const ALIAS: { ancienne: string; cle: string }[] = [
  { ancienne: "capital_emprunte", cle: "capital" },
  { ancienne: "capital_restant", cle: "capital_restant_du" },
  { ancienne: "cotisation_mensuelle", cle: "tarif_cotisation_mensuelle" },
  { ancienne: "montant_total", cle: "tarif_montant_total" },
  { ancienne: "taux_nominal", cle: "taux_pret" },
  { ancienne: "banque_preteuse", cle: "banque" },
];

function vide(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function nombre(v: unknown): number | null {
  if (vide(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normaliserRecueilEmprunteur(
  recueilExistant: Record<string, unknown> | null | undefined,
  dossier: DossierEmprunteurSource,
  personnes: PersonneSourceEmprunteur[],
): NormalisationRecueilResultat {
  const recueil: Record<string, unknown> = { ...(recueilExistant ?? {}) };
  const ajouts: string[] = [];

  const poser = (cle: string, valeur: unknown) => {
    if (vide(valeur) || !vide(recueil[cle])) return;
    recueil[cle] = valeur;
    ajouts.push(cle);
  };

  // 1. Reprise des anciennes clés.
  for (const a of ALIAS) poser(a.cle, recueil[a.ancienne]);

  // 2. Données du prêt portées par le dossier.
  poser("capital", nombre(dossier.capital));
  poser("duree_mois", nombre(dossier.duree_mois));
  poser("taux_pret", nombre(dossier.taux_pret));
  if (vide(recueil["mois_restants"]) && !vide(recueil["duree_mois"])) {
    recueil["mois_restants"] = recueil["duree_mois"];
    ajouts.push("mois_restants");
  }

  // 3. Détail des assurés du prêt.
  if (vide(recueil["assures"]) && personnes.length > 0) {
    const quotiteLegacy = nombre(recueil["quotite"]);
    const assures = personnes.map((p) => {
      const q =
        nombre(p.quotite_pct) ??
        (personnes.length === 1 ? (quotiteLegacy ?? 100) : null);
      return {
        lien: p.lien,
        nom: p.nom ?? "",
        date_naissance: p.date_naissance ?? "",
        quotite_pct: q,
        csp: p.csp ?? "",
        fumeur: p.fumeur === true,
      };
    });
    recueil["assures"] = assures;
    ajouts.push("assures");
  }

  const manquants = ["capital", "duree_mois"].filter((k) => vide(recueil[k]));
  const assures = Array.isArray(recueil["assures"]) ? (recueil["assures"] as Record<string, unknown>[]) : [];
  if (assures.length === 0) manquants.push("assures");
  else {
    if (assures.some((a) => vide(a["date_naissance"]))) manquants.push("assures.date_naissance");
    if (assures.some((a) => nombre(a["quotite_pct"]) === null)) manquants.push("assures.quotite_pct");
  }

  return { recueil, ajouts, manquants };
}
