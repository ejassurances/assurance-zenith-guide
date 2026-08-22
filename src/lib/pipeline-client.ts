/**
 * Vue client simplifiée du pipeline : les statuts internes détaillés du CRM
 * sont regroupés en 4 grandes étapes affichées au client. Le back-office
 * continue d'afficher le détail complet (voir src/lib/pipeline-dossier.ts).
 */

import { etapeDef } from "./pipeline-dossier";

export type PhaseClientKey = "entree_relation" | "etude" | "souscription" | "contrat_actif";

export type PhaseClient = {
  key: PhaseClientKey;
  label: string;
  description: string;
  /** Statuts internes couverts par cette phase. */
  statuts: string[];
};

export const PHASES_CLIENT: PhaseClient[] = [
  {
    key: "entree_relation",
    label: "Entrée en relation",
    description:
      "De votre première prise de contact jusqu'à la signature de la lettre de mission.",
    statuts: ["nouveau", "en_cours", "lettre_mission_envoyee"],
  },
  {
    key: "etude",
    label: "Étude d'assurance",
    description:
      "Analyse de votre besoin, comparaison des offres et envoi de notre recommandation (devoir de conseil).",
    statuts: ["dda_validee", "devis_en_cours", "devoir_conseil_envoye"],
  },
  {
    key: "souscription",
    label: "Souscription",
    description:
      "Recommandation acceptée : votre dossier est transmis à la compagnie pour instruction.",
    statuts: ["devoir_conseil_signe", "souscription_envoyee"],
  },
  {
    key: "contrat_actif",
    label: "Contrat actif",
    description: "Votre contrat est validé par la compagnie et suivi par le cabinet.",
    statuts: ["contrat_valide", "contrat_actif"],
  },
];

/** Phase client correspondant à un statut interne (null si hors parcours). */
export function phaseClient(statut: string): PhaseClient | null {
  return PHASES_CLIENT.find((p) => p.statuts.includes(statut)) ?? null;
}

/** Index de la phase client (-1 si hors parcours). */
export function phaseClientIndex(statut: string): number {
  return PHASES_CLIENT.findIndex((p) => p.statuts.includes(statut));
}

/** Libellé affiché au client pour un statut interne (phase, ou statut particulier). */
export function libelleClientStatut(statut: string): string {
  return phaseClient(statut)?.label ?? etapeDef(statut)?.label ?? statut;
}
