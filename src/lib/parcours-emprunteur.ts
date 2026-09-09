/**
 * PARCOURS EMPRUNTEUR — CARTE DE PRÉSENTATION EN 12 ÉTAPES.
 *
 * Cette carte ne crée aucun statut métier : elle relie chaque étape visible du
 * parcours (0 → 11) à un statut existant de `pipeline-dossier.ts`. La
 * granularité interne et la traçabilité ACPR restent inchangées.
 */
import type { EtapeKey } from "./pipeline-dossier";

export type ParcoursKey =
  | "import"
  | "coordonnees"
  | "informations"
  | "prets"
  | "preteur"
  | "lettre_mission"
  | "simulations"
  | "devoir_conseil"
  | "adhesion"
  | "substitution"
  | "souscription"
  | "analyse";

export type ParcoursEtape = {
  key: ParcoursKey;
  /** Numéro affiché (0 pour l'import initial). */
  numero: number;
  label: string;
  description: string;
  /** Statut métier atteint par cette étape. */
  statut: EtapeKey;
};

export const PARCOURS_EMPRUNTEUR: ParcoursEtape[] = [
  {
    key: "import",
    numero: 0,
    label: "Import documents",
    description:
      "Dépôt de l'offre de prêt et du tableau d'amortissement : les champs lus alimentent le recueil. Le document importé fait foi.",
    statut: "nouveau",
  },
  {
    key: "coordonnees",
    numero: 1,
    label: "Coordonnées",
    description: "Identité et coordonnées de chaque emprunteur, rapprochées de la fiche client.",
    statut: "en_cours",
  },
  {
    key: "informations",
    numero: 2,
    label: "Informations personnelles",
    description: "Situation de chaque assuré : naissance, profession, quotité assurée.",
    statut: "en_cours",
  },
  {
    key: "prets",
    numero: 3,
    label: "Prêts",
    description: "Capital, capital restant dû, taux, durée et date d'effet de la substitution.",
    statut: "en_cours",
  },
  {
    key: "preteur",
    numero: 4,
    label: "Prêteur",
    description: "Organisme prêteur et coordonnées utiles à la substitution.",
    statut: "en_cours",
  },
  {
    key: "lettre_mission",
    numero: 5,
    label: "Lettre de mission",
    description:
      "Générée à partir des informations client et prêt. Objectif : faire des économies en conservant l'équivalence des garanties.",
    statut: "lettre_mission_envoyee",
  },
  {
    key: "simulations",
    numero: 6,
    label: "Simulations",
    description:
      "Produits du catalogue notés selon le recueil, prix saisis ou devis importés, classement du moins cher au plus cher.",
    statut: "devis_en_cours",
  },
  {
    key: "devoir_conseil",
    numero: 7,
    label: "Devoir de conseil",
    description:
      "Mise en concurrence, génération par l'agent, validation humaine obligatoire puis signature du client.",
    statut: "devoir_conseil_envoye",
  },
  {
    key: "adhesion",
    numero: 8,
    label: "Informations adhésion",
    description: "Pièces et informations d'adhésion par assuré. Accessible après signature.",
    statut: "devoir_conseil_signe",
  },
  {
    key: "substitution",
    numero: 9,
    label: "Substitution",
    description: "Demande de substitution auprès de la banque et du contrat à résilier.",
    statut: "devoir_conseil_signe",
  },
  {
    key: "souscription",
    numero: 10,
    label: "Souscription",
    description: "Transmission du dossier à la compagnie et suivi des relances.",
    statut: "souscription_envoyee",
  },
  {
    key: "analyse",
    numero: 11,
    label: "Analyse et décision",
    description:
      "Décision de la compagnie et dépôt des documents reçus : devis final, lettre de mission signée, devoir de conseil signé.",
    statut: "contrat_valide",
  },
];

/** Rang du statut courant dans l'ordre du parcours (-1 si hors parcours). */
function rangStatut(statut: string): number {
  const ordre: EtapeKey[] = [
    "nouveau",
    "en_cours",
    "lettre_mission_envoyee",
    "dda_validee",
    "devis_en_cours",
    "devoir_conseil_envoye",
    "devoir_conseil_signe",
    "souscription_envoyee",
    "contrat_valide",
    "contrat_actif",
  ];
  return ordre.indexOf(statut as EtapeKey);
}

export function parcoursEtape(key: string): ParcoursEtape | undefined {
  return PARCOURS_EMPRUNTEUR.find((e) => e.key === key);
}

/** Étape du parcours correspondant au statut courant du dossier. */
export function etapeCouranteParcours(statut: string): ParcoursKey {
  const rang = rangStatut(statut);
  if (rang < 0) return "import";
  const trouvee = [...PARCOURS_EMPRUNTEUR]
    .reverse()
    .find((e) => rangStatut(e.statut) <= rang);
  return trouvee?.key ?? "import";
}

/**
 * L'étape est-elle accessible ? Une étape franchie ou l'étape courante l'est
 * toujours ; les étapes suivantes restent consultables mais signalées comme
 * non atteintes (les blocages réglementaires restent portés par le serveur).
 */
export function etapeAtteinte(key: ParcoursKey, statut: string): boolean {
  const e = parcoursEtape(key);
  if (!e) return false;
  return rangStatut(e.statut) <= rangStatut(statut);
}
