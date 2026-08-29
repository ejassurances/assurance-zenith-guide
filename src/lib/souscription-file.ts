/**
 * D4 — Classification de la file de souscription (pur, sans accès base).
 *
 * Chaque dossier non finalisé est classé en trois états :
 *  - « pret »     : les quatre jalons sont réunis, il ne reste qu'à transmettre ;
 *  - « bloque »   : au moins un jalon manque, avec l'étape de reprise à viser ;
 *  - « transmis » : dossier transmis à la compagnie, en attente de retour.
 */
import type { ResultatPrerequis } from "@/lib/souscription-prerequis";
import type { EtapeKey } from "@/lib/pipeline-dossier";
import type { Jalon } from "@/lib/souscription-prerequis";

export type EtatFile = "pret" | "bloque" | "transmis";

export interface LigneFileSouscription {
  dossier_id: string;
  reference: string;
  client_nom: string;
  client_id: string | null;
  branche: string;
  produit_nom: string | null;
  compagnie_nom: string | null;
  statut: string;
  etat: EtatFile;
  jalons: Jalon[];
  bloquants: string[];
  /** Étape de la fiche dossier où reprendre le travail (null si rien à reprendre). */
  etape_reprise: EtapeKey | null;
  envoye_le: string | null;
  relances_nb: number | null;
}

/** Étape de reprise associée à chaque jalon manquant. */
const ETAPE_PAR_JALON: Record<Jalon["code"], EtapeKey> = {
  recueil: "en_cours",
  devis: "devis_en_cours",
  devoir_conseil: "devoir_conseil_envoye",
  pieces: "devoir_conseil_signe",
};

/** Première étape à reprendre pour débloquer un dossier. */
export function etapeReprise(prerequis: ResultatPrerequis): EtapeKey {
  const manquant = prerequis.jalons.find((j) => j.etat === "MANQUANT");
  return manquant ? ETAPE_PAR_JALON[manquant.code] : "devoir_conseil_signe";
}

/** Statuts qui restent dans la file (contrat validé et au-delà = sortis). */
export const STATUTS_FILE: string[] = [
  "nouveau",
  "en_cours",
  "lettre_mission_envoyee",
  "dda_validee",
  "devis_en_cours",
  "devoir_conseil_envoye",
  "devoir_conseil_signe",
  "devoir_conseil_refuse",
  "souscription_envoyee",
];

/**
 * Classe un dossier dans la file. Aucun effet de bord : la décision de
 * transmission reste verrouillée par le garde-fou serveur existant.
 */
export function classifierDossier(input: {
  statut: string;
  envoye_le: string | null;
  retour_le: string | null;
  prerequis: ResultatPrerequis | null;
}): { etat: EtatFile; etape_reprise: EtapeKey | null } {
  const transmis =
    input.statut === "souscription_envoyee" || (Boolean(input.envoye_le) && !input.retour_le);
  if (transmis) return { etat: "transmis", etape_reprise: null };

  if (input.retour_le) return { etat: "pret", etape_reprise: null };

  const prerequis = input.prerequis;
  if (!prerequis) return { etat: "bloque", etape_reprise: "en_cours" };
  if (!prerequis.autorise) return { etat: "bloque", etape_reprise: etapeReprise(prerequis) };
  return { etat: "pret", etape_reprise: null };
}
