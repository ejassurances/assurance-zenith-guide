/**
 * NOTATION DES PRODUITS EMPRUNTEUR DU CATALOGUE (fonction pure).
 *
 * La note d'adéquation d'un produit est calculée à partir de sa GRILLE DE
 * GARANTIES VALIDÉE dans le CRM (`produit_garanties.valeurs`) et de la situation
 * lue dans le recueil des besoins (statut professionnel, âge, rachat
 * d'exclusions, garanties demandées).
 *
 * Règles :
 *  - aucune valeur n'est déduite : sans grille validée, le produit est
 *    « non notable » (jamais de note inventée) ;
 *  - aucune donnée de santé n'est utilisée (loi Lemoine) ;
 *  - la note est une aide à la décision : la recommandation reste humaine.
 */

import type { ValeursGrille } from "./garanties-grille";
import { detecterProfilsEmprunteur, type ProfilEmprunteur } from "./emprunteur-notebook";

export interface CritereNote {
  code: string;
  libelle: string;
  poids: number;
  /** true = critère satisfait, false = non satisfait, null = information absente de la grille. */
  satisfait: boolean | null;
  detail: string;
}

export interface NoteProduit {
  /** null = aucune grille validée : produit non notable. */
  score: number | null;
  criteres: CritereNote[];
  points_forts: string[];
  points_faibles: string[];
  /** Profils du prospect pris en compte dans la pondération. */
  profils: ProfilEmprunteur[];
}

const txt = (v: unknown): string => (typeof v === "string" ? v.toLowerCase() : "");

/** Première valeur numérique d'un texte (« 33 % », « 90 jours »). */
function premierNombre(v: unknown): number | null {
  const m = txt(v).replace(",", ".").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Plus grand nombre d'un texte (« adhésion 18-65, cessation 85 ans » → 85). */
function plusGrandNombre(v: unknown): number | null {
  const l = txt(v).match(/\d+/g);
  if (!l || l.length === 0) return null;
  return Math.max(...l.map(Number));
}

type Ligne = { couverture?: string; plafond?: string | null; franchise?: string | null; conditions?: string | null };

function ligne(valeurs: ValeursGrille, code: string): Ligne | null {
  const v = (valeurs as Record<string, Ligne | undefined>)[code];
  return v ?? null;
}

const acquise = (l: Ligne | null): boolean | null => {
  if (!l || !l.couverture || l.couverture === "inconnu") return null;
  return l.couverture === "oui" || l.couverture === "option";
};

/**
 * Note un produit emprunteur. `valeurs` = grille validée du produit (ou null).
 */
export function noterProduitEmprunteur(
  valeurs: ValeursGrille | null | undefined,
  recueil: unknown,
): NoteProduit {
  const profils = detecterProfilsEmprunteur(recueil);
  if (!valeurs || Object.keys(valeurs).length === 0) {
    return { score: null, criteres: [], points_forts: [], points_faibles: [], profils };
  }

  const criteres: CritereNote[] = [];
  const add = (
    code: string,
    libelle: string,
    poids: number,
    satisfait: boolean | null,
    detail: string,
  ) => criteres.push({ code, libelle, poids, satisfait, detail });

  // — Socle commun à tous les dossiers emprunteur —
  const deces = ligne(valeurs, "deces");
  add("deces", "Décès", 12, acquise(deces), deces?.conditions ?? "");
  const ptia = ligne(valeurs, "ptia");
  add("ptia", "PTIA", 8, acquise(ptia), ptia?.conditions ?? "");
  const itt = ligne(valeurs, "itt");
  add("itt", "Arrêt de travail (ITT)", 12, acquise(itt), itt?.conditions ?? "");
  const ipt = ligne(valeurs, "ipt");
  add("ipt", "Invalidité permanente totale (IPT)", 10, acquise(ipt), ipt?.conditions ?? "");

  const ccsf = ligne(valeurs, "equivalence_ccsf");
  const ccsfOk = ccsf ? /oui|conforme|équivalen|equivalen|11|15/.test(txt(ccsf.couverture) + txt(ccsf.plafond) + txt(ccsf.conditions)) : null;
  add(
    "equivalence_ccsf",
    "Équivalence de garanties CCSF (acceptation par la banque)",
    15,
    ccsf ? ccsfOk : null,
    ccsf?.conditions ?? "",
  );

  const indem = ligne(valeurs, "type_indemnisation");
  const forfaitaire = indem ? /forfait/.test(txt(indem.plafond) + txt(indem.conditions)) : null;
  add(
    "type_indemnisation",
    "Indemnisation forfaitaire (échéance prise en charge sans contrôle des revenus)",
    profils.includes("tns") ? 18 : 10,
    forfaitaire,
    indem?.plafond ?? indem?.conditions ?? "",
  );

  const fr = ligne(valeurs, "franchise_itt");
  const jours = premierNombre(fr?.franchise ?? fr?.plafond ?? fr?.conditions);
  add(
    "franchise_itt",
    "Franchise ITT courte (90 jours ou moins)",
    profils.includes("tns") ? 12 : 8,
    jours === null ? null : jours <= 90,
    jours === null ? "" : `${jours} jours`,
  );

  const mno = ligne(valeurs, "mno");
  const mnoSansCondition = mno
    ? acquise(mno) === true && !/hospitalis|chirurg|intervention/.test(txt(mno.conditions))
    : null;
  add(
    "mno",
    "Affections dorsales et psychiques couvertes sans condition",
    profils.includes("risques_specifiques") ? 20 : 8,
    mnoSansCondition,
    mno?.conditions ?? "",
  );

  const seuil = ligne(valeurs, "seuil_ipp");
  const tauxSeuil = premierNombre(seuil?.plafond ?? seuil?.conditions);
  add(
    "seuil_ipp",
    "Seuil d'invalidité favorable (33 % ou moins)",
    profils.includes("tns") ? 10 : 5,
    tauxSeuil === null ? null : tauxSeuil <= 33,
    tauxSeuil === null ? "" : `${tauxSeuil} %`,
  );

  const ages = ligne(valeurs, "ages_limites");
  const ageMax = plusGrandNombre(ages?.plafond ?? ages?.conditions);
  add(
    "ages_limites",
    "Âges limites élevés (garanties maintenues au moins jusqu'à 80 ans)",
    profils.includes("senior") ? 18 : 5,
    ageMax === null ? null : ageMax >= 80,
    ageMax === null ? "" : `jusqu'à ${ageMax} ans`,
  );

  const tpt = ligne(valeurs, "temps_partiel_therapeutique");
  add("temps_partiel_therapeutique", "Reprise à temps partiel thérapeutique prise en charge", 5, acquise(tpt), tpt?.conditions ?? "");

  const resil = ligne(valeurs, "delai_renonciation_resiliation");
  add("delai_renonciation_resiliation", "Résiliation / substitution facilitée (loi Lemoine)", 4, acquise(resil), resil?.conditions ?? "");

  // Garanties explicitement demandées dans le recueil (texte libre).
  const demandes = txt((recueil as Record<string, unknown> | null)?.["garanties_souhaitees"]);
  if (/perte d'emploi|chomage|chômage/.test(demandes)) {
    const pe = ligne(valeurs, "perte_emploi");
    add("perte_emploi", "Perte d'emploi demandée par le client", 10, acquise(pe), pe?.conditions ?? "");
  }

  const notables = criteres.filter((c) => c.satisfait !== null);
  const poidsTotal = notables.reduce((s, c) => s + c.poids, 0);
  const poidsObtenu = notables.filter((c) => c.satisfait).reduce((s, c) => s + c.poids, 0);
  const score = poidsTotal === 0 ? null : Math.round((poidsObtenu / poidsTotal) * 100);

  const parPoids = [...criteres].sort((a, b) => b.poids - a.poids);
  return {
    score,
    criteres,
    points_forts: parPoids.filter((c) => c.satisfait === true).slice(0, 3).map((c) => c.libelle),
    points_faibles: parPoids
      .filter((c) => c.satisfait === false)
      .slice(0, 3)
      .map((c) => c.libelle),
    profils,
  };
}
