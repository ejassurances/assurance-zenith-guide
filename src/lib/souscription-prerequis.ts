/**
 * D4 — Contrôle unique de complétude avant transmission compagnie.
 *
 * Un dossier ne peut partir à la compagnie (API ou intranet) que si les quatre
 * jalons sont réunis : recueil des besoins, devis, devoir de conseil signé et
 * pièces obligatoires validées. Logique pure, sans accès base, pour être testée.
 */

export type EtatJalon = "OK" | "MANQUANT";

export interface Jalon {
  code: "recueil" | "devis" | "devoir_conseil" | "pieces";
  libelle: string;
  etat: EtatJalon;
  detail: string;
}

export interface EntreePrerequis {
  /** Recueil des besoins renseigné (objet non vide). */
  recueil_besoins: unknown;
  /** Nombre de devis actifs (non archivés) rattachés au dossier. */
  devis_actifs: number;
  /** Devoir de conseil : date de signature du dernier document non archivé. */
  devoir_conseil_signe_le: string | null;
  /** Devoir de conseil refusé (bloque également la transmission). */
  devoir_conseil_refuse: boolean;
  /**
   * Preuve alternative : le client a signé le devoir de conseil de la
   * compagnie elle-même (parcours géré directement par l'assureur), pas le
   * nôtre. Satisfait le jalon au même titre, à condition qu'un document en
   * fasse la preuve — jamais une dérogation sans justificatif.
   */
  devoir_conseil_compagnie_recu: boolean;
  /** Complétude documentaire. */
  pieces_manquantes: string[];
  pieces_a_qualifier: string[];
}

export interface ResultatPrerequis {
  autorise: boolean;
  jalons: Jalon[];
  bloquants: string[];
}

function recueilRenseigne(valeur: unknown): boolean {
  if (!valeur || typeof valeur !== "object") return false;
  return Object.keys(valeur as Record<string, unknown>).length > 0;
}

/** Évalue les prérequis de transmission. Aucun contournement possible. */
export function evaluerPrerequisSouscription(e: EntreePrerequis): ResultatPrerequis {
  const jalons: Jalon[] = [];

  const recueilOk = recueilRenseigne(e.recueil_besoins);
  jalons.push({
    code: "recueil",
    libelle: "Recueil des besoins / étude",
    etat: recueilOk ? "OK" : "MANQUANT",
    detail: recueilOk ? "Recueil renseigné" : "Le recueil des besoins n'est pas renseigné",
  });

  const devisOk = e.devis_actifs > 0;
  jalons.push({
    code: "devis",
    libelle: "Devis / tarification",
    etat: devisOk ? "OK" : "MANQUANT",
    detail: devisOk
      ? `${e.devis_actifs} devis enregistré${e.devis_actifs > 1 ? "s" : ""}`
      : "Aucun devis enregistré sur le dossier",
  });

  const dcOk = (Boolean(e.devoir_conseil_signe_le) && !e.devoir_conseil_refuse) || e.devoir_conseil_compagnie_recu;
  jalons.push({
    code: "devoir_conseil",
    libelle: "Devoir de conseil signé",
    etat: dcOk ? "OK" : "MANQUANT",
    detail: e.devoir_conseil_compagnie_recu
      ? "Devoir de conseil de la compagnie reçu (document au dossier)"
      : e.devoir_conseil_refuse
        ? "Devoir de conseil refusé par le client"
        : e.devoir_conseil_signe_le
          ? `Signé le ${e.devoir_conseil_signe_le.slice(0, 10)}`
          : "Devoir de conseil non signé (le nôtre, ou celui de la compagnie déposé au dossier)",
  });

  const piecesOk = e.pieces_manquantes.length === 0 && e.pieces_a_qualifier.length === 0;
  const listePieces = [...e.pieces_manquantes, ...e.pieces_a_qualifier];
  jalons.push({
    code: "pieces",
    libelle: "Pièces obligatoires",
    etat: piecesOk ? "OK" : "MANQUANT",
    detail: piecesOk
      ? "Toutes les pièces obligatoires sont validées"
      : `À obtenir ou valider : ${listePieces.join(", ")}`,
  });

  const bloquants = jalons.filter((j) => j.etat === "MANQUANT").map((j) => j.detail);
  return { autorise: bloquants.length === 0, jalons, bloquants };
}

/** Message d'erreur normalisé du garde-fou serveur. */
export function messageBlocageSouscription(r: ResultatPrerequis): string {
  return `Transmission compagnie bloquée : ${r.bloquants.join(" ; ")}.`;
}
