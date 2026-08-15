/**
 * Lecture client-safe du dossier emprunteur pour Simulassur : vérifie que les
 * données exigées par l'API sont présentes avant tout appel. Aucun secret,
 * aucun accès réseau — importable depuis l'UI comme depuis le serveur.
 */

import { assuresEmprunteur, type PersonneEmprunteur } from "@/lib/recueil-besoins-schemas";

export interface RecueilEmprunteurSimulassur {
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

/** Branche couverte par l'API Simulassur. */
export function brancheTarifableSimulassur(branche: string): boolean {
  return branche === "emprunteur";
}

/** Vérifie que le recueil contient les données requises par POST /api/pricing. */
export function lireRecueilSimulassur(recueil: unknown): {
  ok: boolean;
  manques: string[];
  valeurs?: RecueilEmprunteurSimulassur;
} {
  const v = (recueil ?? {}) as Record<string, unknown>;
  const capital = nombre(v["capital_restant_du"]) ?? nombre(v["capital"]);
  const dureeMois = nombre(v["mois_restants"]) ?? nombre(v["duree_mois"]);
  const taux = Number(v["taux_pret"]);
  // Simulassur accepte au maximum deux assurés par simulation.
  const assures = assuresEmprunteur(v["assures"])
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date_naissance))
    .slice(0, 2);

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
      assures,
    },
  };
}

/**
 * Champs d'identité et de contact exigés par l'API pour chaque assuré.
 * Simulassur refuse les valeurs fictives : le CRM doit bloquer avant l'appel.
 */
export function manquesIdentiteSimulassur(client: {
  nom?: string | null;
  prenom?: string | null;
  email?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  date_naissance?: string | null;
}): string[] {
  const manques: string[] = [];
  if (!client.nom?.trim()) manques.push("le nom");
  if (!client.prenom?.trim()) manques.push("le prénom");
  if (!client.email?.trim()) manques.push("l'e-mail (utilisé ensuite pour l'espace client)");
  if (!client.telephone?.trim()) manques.push("le téléphone mobile");
  if (!client.adresse?.trim()) manques.push("l'adresse");
  if (!/^\d{5}$/.test(String(client.code_postal ?? "").trim())) manques.push("le code postal");
  if (!client.ville?.trim()) manques.push("la ville");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(client.date_naissance ?? "")))
    manques.push("la date de naissance");
  return manques;
}

/** Nombre d'assurés transmissibles à Simulassur (0 = dossier non tarifiable). */
export function nbAssuresSimulassur(branche: string, recueil: unknown): number {
  if (!brancheTarifableSimulassur(branche)) return 0;
  const r = lireRecueilSimulassur(recueil);
  return r.ok ? (r.valeurs?.assures.length ?? 0) : 0;
}
