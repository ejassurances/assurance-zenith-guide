import {
  LIBELLES_PROFILS,
  profilNotebook,
  scoreAdequation,
  type ProfilEmprunteur,
} from "@/lib/emprunteur-notebook";

export type DevisPayload = {
  id: string;
  compagnie: string | null;
  produit: string | null;
  formule: string | null;
  cotisation_mensuelle: number | null;
  garanties_resume: string | null;
};

export type LigneClassementRoute = {
  dossier_devis_id: string;
  rang: number;
  justification: string;
};

export type ScoreDevis = {
  dossier_devis_id: string;
  score: number;
  criteres_valides: string[];
  criteres_absents: string[];
};

function euros(v: number | null) {
  return v == null ? "tarif non renseigné" : `${Number(v).toFixed(2).replace(".", ",")} € / mois`;
}

/**
 * ROUTE A — aucune spécificité déclarée dans le recueil : les devis sont classés
 * par prix croissant. Aucune interprétation technique n'est faite, la
 * justification DDA est factuelle.
 */
export function classerRouteA(devis: DevisPayload[]): LigneClassementRoute[] {
  const tri = [...devis].sort((a, b) => {
    const pa = a.cotisation_mensuelle == null ? Infinity : Number(a.cotisation_mensuelle);
    const pb = b.cotisation_mensuelle == null ? Infinity : Number(b.cotisation_mensuelle);
    return pa - pb;
  });
  const moinsCher = tri[0]?.cotisation_mensuelle ?? null;

  return tri.map((d, i) => {
    const ecart =
      moinsCher != null && d.cotisation_mensuelle != null && i > 0
        ? ` Écart de ${(Number(d.cotisation_mensuelle) - Number(moinsCher)).toFixed(2).replace(".", ",")} € / mois avec l'offre la mieux placée.`
        : "";
    return {
      dossier_devis_id: d.id,
      rang: i + 1,
      justification:
        i === 0
          ? `Aucune spécificité technique n'est déclarée dans le recueil des besoins : le classement retient le critère du coût. Offre la moins chère à garanties équivalentes (${euros(d.cotisation_mensuelle)}).`
          : `Classement par coût croissant (${euros(d.cotisation_mensuelle)}).${ecart}`,
    };
  });
}

/** Consigne IA de la Route B : lecture technique des devis face à la grille du Notebook. */
export function consigneRouteB(ctx: { profils: ProfilEmprunteur[]; devis: DevisPayload[]; recueil: unknown }) {
  const criteres = ctx.profils.flatMap((p) =>
    profilNotebook(p).criteres.map((c) => `- ${c.code} (${c.poids} pts) — ${c.libelle} : ${c.definition}`),
  );
  return [
    "Tu es analyste technique en assurance emprunteur dans un cabinet de courtage français (ACPR / DDA).",
    "Le client présente une ou plusieurs spécificités : " +
      ctx.profils.map((p) => LIBELLES_PROFILS[p]).join(", ") +
      ".",
    "Ta mission : pour CHAQUE devis, dire quels critères techniques de la grille ci-dessous sont RÉELLEMENT",
    "couverts par le contrat, à partir des seules informations fournies. N'invente aucune garantie :",
    "si l'information n'est pas explicitement présente, le critère n'est pas validé.",
    "",
    "Grille du Notebook Emprunteur :",
    ...criteres,
    "",
    "Recueil des besoins (JSON, sans aucune donnée de santé) :",
    JSON.stringify(ctx.recueil ?? {}).slice(0, 5000),
    "Devis comparés (JSON) :",
    JSON.stringify(ctx.devis).slice(0, 6000),
    "",
    "Pour chaque devis, fournis aussi un commentaire technique d'une phrase (argument positif ou réserve).",
    "",
    'Réponds STRICTEMENT en JSON : {"analyses":[{"dossier_devis_id":"...","criteres_valides":["code",...],"commentaire":"..."}]}',
  ].join("\n");
}

/**
 * ROUTE B — classement par score d'adéquation technique et justification DDA
 * positive listant les 3 critères déterminants face au tarif.
 */
export function classerRouteB(
  profils: ProfilEmprunteur[],
  devis: DevisPayload[],
  analyses: { dossier_devis_id: string; criteres_valides: string[]; commentaire: string }[],
): { classement: LigneClassementRoute[]; scores: ScoreDevis[] } {
  const tousCriteres = profils.flatMap((p) => profilNotebook(p).criteres);
  const parId = new Map(analyses.map((a) => [a.dossier_devis_id, a]));

  const evalues = devis.map((d) => {
    const a = parId.get(d.id);
    const valides = (a?.criteres_valides ?? []).filter((c) => tousCriteres.some((x) => x.code === c));
    const { score } = scoreAdequation(profils, valides);
    return {
      devis: d,
      score,
      valides,
      absents: tousCriteres.filter((c) => !valides.includes(c.code)).map((c) => c.code),
      commentaire: a?.commentaire ?? "",
    };
  });

  evalues.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    const px = x.devis.cotisation_mensuelle == null ? Infinity : Number(x.devis.cotisation_mensuelle);
    const py = y.devis.cotisation_mensuelle == null ? Infinity : Number(y.devis.cotisation_mensuelle);
    return px - py;
  });

  const classement = evalues.map((e, i) => {
    const majeurs = tousCriteres
      .filter((c) => e.valides.includes(c.code))
      .sort((a, b) => b.poids - a.poids)
      .slice(0, 3);
    const listeMajeurs = majeurs.map((c) => `${c.libelle} (${c.poids} pts)`).join(" ; ");
    const manques = tousCriteres
      .filter((c) => !e.valides.includes(c.code))
      .sort((a, b) => b.poids - a.poids)
      .slice(0, 2)
      .map((c) => c.libelle)
      .join(" ; ");

    const base =
      i === 0
        ? `Offre la plus adaptée au profil ${profils.map((p) => LIBELLES_PROFILS[p]).join(" + ")} : score d'adéquation technique ${e.score}/100. ` +
          `Critères déterminants retenus pour ce choix, au-delà du seul tarif (${euros(e.devis.cotisation_mensuelle)}) : ${listeMajeurs || "aucun critère validé sur pièces"}.`
        : `Score d'adéquation technique ${e.score}/100 (${euros(e.devis.cotisation_mensuelle)}). ` +
          (listeMajeurs ? `Points forts : ${listeMajeurs}. ` : "") +
          (manques ? `Écart avec le besoin : ${manques} non démontré sur pièces.` : "");

    return {
      dossier_devis_id: e.devis.id,
      rang: i + 1,
      justification: `${base}${e.commentaire ? ` ${e.commentaire}` : ""}`.slice(0, 1500),
    };
  });

  const scores: ScoreDevis[] = evalues.map((e) => ({
    dossier_devis_id: e.devis.id,
    score: e.score,
    criteres_valides: e.valides,
    criteres_absents: e.absents,
  }));

  return { classement, scores };
}
