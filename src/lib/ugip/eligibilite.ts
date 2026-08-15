/**
 * Lecture client-safe du recueil emprunteur pour la tarification UGIP.
 * Aucun secret, aucun accès réseau : importable depuis l'UI comme du serveur.
 */

import { assuresEmprunteur, type PersonneEmprunteur } from "@/lib/recueil-besoins-schemas";

export interface RecueilEmprunteurUgip {
  capital: number;
  dureeMois: number;
  taux: number;
  objetPret: string;
  /** Substitution d'un contrat groupe en cours (capital restant dû renseigné). */
  substitution: boolean;
  assures: PersonneEmprunteur[];
}

function nombre(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Vérifie que le recueil emprunteur contient les données exigées par UGIP. */
export function lireRecueilEmprunteur(recueil: unknown): {
  ok: boolean;
  manques: string[];
  valeurs?: RecueilEmprunteurUgip;
} {
  const v = (recueil ?? {}) as Record<string, unknown>;
  const capital = nombre(v["capital_restant_du"]) ?? nombre(v["capital"]);
  const dureeMois = nombre(v["mois_restants"]) ?? nombre(v["duree_mois"]);
  const taux = Number(v["taux_pret"]);
  const assures = assuresEmprunteur(v["assures"]).filter((p) =>
    /^\d{4}-\d{2}-\d{2}$/.test(p.date_naissance),
  );

  const manques: string[] = [];
  if (!capital) manques.push("le capital emprunté (ou le capital restant dû)");
  if (!dureeMois) manques.push("la durée restante du prêt en mois");
  if (assures.length === 0) manques.push("au moins un assuré avec sa date de naissance");
  if (manques.length > 0) return { ok: false, manques };

  return {
    ok: true,
    manques: [],
    valeurs: {
      capital: capital as number,
      dureeMois: dureeMois as number,
      taux: Number.isFinite(taux) && taux > 0 ? taux : 0,
      objetPret: String(v["objet_pret"] ?? ""),
      substitution: !!nombre(v["capital_restant_du"]),
      // UGIP accepte 1 à 4 assurés par projet.
      assures: assures.slice(0, 4),
    },
  };
}

/** Branche tarifiable par le WS UGIP. */
export function brancheTarifableUgip(branche: string): boolean {
  return branche === "emprunteur";
}

/** Nombre d'assurés transmis à UGIP pour ce dossier (0 = non tarifiable). */
export function nbAssuresUgip(branche: string, recueil: unknown): number {
  if (!brancheTarifableUgip(branche)) return 0;
  const r = lireRecueilEmprunteur(recueil);
  return r.ok ? (r.valeurs?.assures.length ?? 0) : 0;
}
