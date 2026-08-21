/**
 * Notebook Emprunteur — grille de scoring technique du cabinet.
 *
 * Le moteur de recommandation emprunteur fonctionne à double route :
 *  - Route A : aucune spécificité déclarée dans le recueil → classement des
 *    devis par prix croissant.
 *  - Route B : une spécificité est détectée (TNS, Senior, rachat d'exclusions)
 *    → classement par score d'adéquation technique issu de cette grille, et
 *    justification DDA positive listant les 3 critères techniques déterminants.
 *
 * Score_Total = (somme des pondérations des critères validés / somme des
 * pondérations du profil) × 100.
 */

export type ProfilEmprunteur = "tns" | "senior" | "risques_specifiques";

export type CritereNotebook = {
  code: string;
  libelle: string;
  /** Pondération sur 100 au sein du profil. */
  poids: number;
  /** Définition technique servant à valider (ou non) le critère sur un devis. */
  definition: string;
};

export type ProfilNotebook = {
  code: ProfilEmprunteur;
  libelle: string;
  declencheur: string;
  criteres: CritereNotebook[];
};

export const PROFILS_NOTEBOOK: ProfilNotebook[] = [
  {
    code: "tns",
    libelle: "TNS / professions indépendantes et médicales",
    declencheur: "Statut professionnel TNS, artisan, profession libérale ou médicale",
    criteres: [
      {
        code: "forfaitaire",
        libelle: "Couverture forfaitaire de maintien de revenu",
        poids: 30,
        definition:
          "Indemnisation en mode forfaitaire, sans contrôle de la perte de revenu effective au moment du sinistre.",
      },
      {
        code: "ipp_33",
        libelle: "Invalidité professionnelle / IPP dès 33 %",
        poids: 30,
        definition:
          "Invalidité évaluée uniquement au regard de la profession exercée (barème médical spécifique) et déclenchement dès 33 %.",
      },
      {
        code: "franchises_courtes",
        libelle: "Flexibilité des franchises",
        poids: 20,
        definition: "Options de franchise courtes disponibles (15 ou 30 jours en accident / hospitalisation).",
      },
      {
        code: "exoneration_cotisations",
        libelle: "Exonération des cotisations",
        poids: 20,
        definition: "Prise en charge automatique des primes pendant l'arrêt de travail.",
      },
    ],
  },
  {
    code: "senior",
    libelle: "Senior / emprunteurs âgés",
    declencheur: "Assuré de plus de 60 ans, ou fin de prêt au-delà de 75 ans",
    criteres: [
      {
        code: "age_limite_deces",
        libelle: "Limite d'âge en couverture décès",
        poids: 40,
        definition: "Garantie décès maintenue jusqu'à 85 ou 90 ans.",
      },
      {
        code: "itt_ipt_post_retraite",
        libelle: "Maintien ITT / IPT post-retraite",
        poids: 30,
        definition: "Garanties d'arrêt de travail maintenues au-delà de 65 ans.",
      },
      {
        code: "formalites_allegees",
        libelle: "Simplicité de souscription médicale",
        poids: 30,
        definition: "Formalités médicales allégées sur les tranches d'âge élevées.",
      },
    ],
  },
  {
    code: "risques_specifiques",
    libelle: "Risques spécifiques / rachat d'exclusions",
    declencheur: "Rachat d'exclusions demandé (dos / psy) ou exigences particulières de la banque",
    criteres: [
      {
        code: "rachat_dos_psy",
        libelle: "Rachat dos / psy sans condition d'hospitalisation",
        poids: 50,
        definition:
          "Affections disco-vertébrales et psychiatriques couvertes sans exigence d'intervention chirurgicale ni d'hospitalisation minimale.",
      },
      {
        code: "equivalence_bancaire",
        libelle: "Équivalence de garanties bancaires / grille AERAS",
        poids: 30,
        definition: "Conformité aux exigences de la banque prêteuse sans restriction de garanties.",
      },
      {
        code: "temps_partiel_therapeutique",
        libelle: "Prise en charge du temps partiel thérapeutique",
        poids: 20,
        definition: "Maintien de 50 % des prestations lors d'une reprise progressive d'activité.",
      },
    ],
  },
];

export function profilNotebook(code: ProfilEmprunteur): ProfilNotebook {
  const p = PROFILS_NOTEBOOK.find((x) => x.code === code);
  if (!p) throw new Error(`Profil Notebook inconnu : ${code}`);
  return p;
}

export const LIBELLES_PROFILS: Record<ProfilEmprunteur, string> = {
  tns: "TNS / indépendant",
  senior: "Senior",
  risques_specifiques: "Risques spécifiques (rachat d'exclusions)",
};

/** CSP considérées comme travailleurs non salariés / professions libérales et médicales. */
const CSP_TNS = ["tns", "profession_liberale", "artisan"];

function age(dateNaissance: unknown): number | null {
  if (typeof dateNaissance !== "string" || !dateNaissance) return null;
  const d = new Date(dateNaissance);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

/**
 * Détection automatique des spécificités depuis le recueil des besoins
 * emprunteur (aucune donnée de santé n'est lue : uniquement statut
 * professionnel, âges et garanties demandées).
 */
export function detecterProfilsEmprunteur(recueil: unknown): ProfilEmprunteur[] {
  const r = (recueil ?? {}) as Record<string, unknown>;
  const profils = new Set<ProfilEmprunteur>();

  const assures = Array.isArray(r["assures"]) ? (r["assures"] as Record<string, unknown>[]) : [];
  const dureeMois = Number(r["duree_mois"] ?? r["mois_restants"] ?? 0) || 0;
  const dureeAns = dureeMois / 12;

  for (const a of assures) {
    const csp = String(a["csp"] ?? "").toLowerCase();
    if (CSP_TNS.includes(csp)) profils.add("tns");
    const ageActuel = age(a["date_naissance"]);
    if (ageActuel != null) {
      if (ageActuel > 60) profils.add("senior");
      if (dureeAns > 0 && ageActuel + dureeAns > 75) profils.add("senior");
    }
  }

  if (r["rachat_exclusions"] === true) profils.add("risques_specifiques");
  const garanties = String(r["garanties_souhaitees"] ?? "").toLowerCase();
  if (/(rachat|dos|dorso|disco|psy|aeras)/.test(garanties)) profils.add("risques_specifiques");

  return [...profils];
}

/** Route retenue pour un dossier, en tenant compte du débrayage manuel. */
export function routeRecommandation(
  recueil: unknown,
  mode: string | null | undefined,
): { route: "A" | "B"; profils: ProfilEmprunteur[]; forcee: boolean } {
  const profils = detecterProfilsEmprunteur(recueil);
  if (mode === "A") return { route: "A", profils, forcee: true };
  if (mode === "B") {
    // Forçage technique sans spécificité détectée : la grille « risques
    // spécifiques » sert de référence par défaut.
    return { route: "B", profils: profils.length > 0 ? profils : ["risques_specifiques"], forcee: true };
  }
  return { route: profils.length > 0 ? "B" : "A", profils, forcee: false };
}

/** Score sur 100 à partir des codes de critères validés. */
export function scoreAdequation(profils: ProfilEmprunteur[], criteresValides: string[]) {
  const criteres = profils.flatMap((p) => profilNotebook(p).criteres);
  const total = criteres.reduce((s, c) => s + c.poids, 0);
  if (total === 0) return { score: 0, poids_valides: 0, poids_total: 0 };
  const valides = criteres.filter((c) => criteresValides.includes(c.code));
  const poids = valides.reduce((s, c) => s + c.poids, 0);
  return { score: Math.round((poids / total) * 100), poids_valides: poids, poids_total: total };
}
