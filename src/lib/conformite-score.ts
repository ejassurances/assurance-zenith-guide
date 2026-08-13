/**
 * Barème de conformité KYC / LCB-FT (0 à 100 %).
 * Miroir front du calcul serveur `calculer_score_conformite_client` :
 *  - identité (CNI/passeport) valide et non expirée .......... 30 pts
 *  - RIB + justificatif de domicile de moins de 3 mois ....... 30 pts
 *  - KBIS / avis Sirene à jour (client professionnel) ........ 20 pts
 *  - questionnaire LCB-FT exploitable de moins de 12 mois .... 20 pts
 * Base atteignable : 80 pts (particulier) ou 100 pts (professionnel),
 * ramenée sur 100. Sous 50 %, la création de contrat est bloquée.
 */

export type ConformiteCritere = {
  code: "identite" | "domicile_rib" | "kbis" | "lcb_ft";
  libelle: string;
  points: number;
  acquis: boolean;
  applicable: boolean;
  detail: string;
};

export type NiveauConformite = "vert" | "orange" | "rouge";

export const SEUIL_BLOCAGE_CONTRAT = 50;

export const NIVEAU_BADGE: Record<NiveauConformite, string> = {
  vert: "bg-emerald-100 text-emerald-900 border-emerald-300",
  orange: "bg-amber-100 text-amber-900 border-amber-300",
  rouge: "bg-red-100 text-red-900 border-red-300",
};

export const NIVEAU_BAR: Record<NiveauConformite, string> = {
  vert: "bg-emerald-500",
  orange: "bg-amber-500",
  rouge: "bg-red-500",
};

export function niveauFromScore(score: number): NiveauConformite {
  if (score >= 90) return "vert";
  if (score >= SEUIL_BLOCAGE_CONTRAT) return "orange";
  return "rouge";
}

type DocLike = {
  type: string;
  statut: string;
  date_emission?: string | null;
  date_expiration?: string | null;
};

type VerifLike = { statut: string; verifie_le: string };

const isValide = (d: DocLike) => d.statut === "valide";
const nonExpire = (d: DocLike) => !d.date_expiration || new Date(d.date_expiration) >= startOfToday();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function moinsDeMois(date: string | null | undefined, mois: number) {
  if (!date) return false;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - mois);
  return new Date(date) >= limite;
}

export function detailConformite(
  docs: DocLike[],
  verifs: VerifLike[],
  estProfessionnel: boolean,
): { criteres: ConformiteCritere[]; score: number; niveau: NiveauConformite; base: number } {
  const cni = docs.some((d) => d.type === "cni" && isValide(d) && nonExpire(d));
  const rib = docs.some((d) => d.type === "rib" && isValide(d));
  const domicile = docs.some(
    (d) => d.type === "justificatif_domicile" && isValide(d) && moinsDeMois(d.date_emission, 3),
  );
  const kbis = docs.some(
    (d) =>
      d.type === "kbis" &&
      isValide(d) &&
      nonExpire(d) &&
      (!d.date_emission || moinsDeMois(d.date_emission, 12)),
  );
  const derniere = verifs[0];
  const lcb =
    !!derniere && ["clair", "faux_positif"].includes(derniere.statut) && moinsDeMois(derniere.verifie_le, 12);

  const criteres: ConformiteCritere[] = [
    {
      code: "identite",
      libelle: "Pièce d'identité validée et non expirée",
      points: 30,
      acquis: cni,
      applicable: true,
      detail: cni ? "Pièce d'identité conforme" : "CNI ou passeport à téléverser puis valider",
    },
    {
      code: "domicile_rib",
      libelle: "RIB + justificatif de domicile (< 3 mois)",
      points: 30,
      acquis: rib && domicile,
      applicable: true,
      detail:
        rib && domicile
          ? "Coordonnées bancaires et domicile justifiés"
          : [!rib ? "RIB manquant" : null, !domicile ? "justificatif de domicile manquant ou trop ancien" : null]
              .filter(Boolean)
              .join(" · "),
    },
    {
      code: "kbis",
      libelle: "KBIS / avis Sirene à jour",
      points: 20,
      acquis: kbis,
      applicable: estProfessionnel,
      detail: estProfessionnel
        ? kbis
          ? "Extrait de moins de 12 mois"
          : "Extrait KBIS ou avis Sirene de moins de 12 mois requis"
        : "Non applicable (client particulier)",
    },
    {
      code: "lcb_ft",
      libelle: "Vérification LCB-FT / PPE (< 12 mois)",
      points: 20,
      acquis: lcb,
      applicable: true,
      detail: lcb
        ? "Filtrage sanctions et PPE exploitable"
        : derniere
          ? "Dernière vérification à statuer ou périmée"
          : "Aucune vérification effectuée",
    },
  ];

  const base = estProfessionnel ? 100 : 80;
  const pts = criteres
    .filter((c) => c.applicable && c.acquis)
    .reduce((sum, c) => sum + c.points, 0);
  const score = Math.min(100, Math.max(0, Math.round((pts * 100) / base)));

  return { criteres, score, niveau: niveauFromScore(score), base };
}
