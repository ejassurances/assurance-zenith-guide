/**
 * Référentiel unique des valeurs métier (Domaine 1 et transverse).
 * Toute liste de statuts/priorités utilisée dans le code doit venir d'ici
 * ou de src/lib/pipeline-dossier.ts (étapes dossier, ré-exportées ici).
 * Les valeurs reflètent les enums PostgreSQL — ne pas ajouter de valeur
 * sans migration de l'enum correspondant.
 */

import { ETAPES, type EtapeKey } from "./pipeline-dossier";

/* ─── Clients (enum client_statut) ─── */
export const STATUTS_CLIENT = ["prospect", "actif", "inactif", "perdu", "ancien"] as const;
export type StatutClient = (typeof STATUTS_CLIENT)[number];

export const STATUT_CLIENT_LABEL: Record<StatutClient, string> = {
  prospect: "Prospect",
  actif: "Actif",
  inactif: "Inactif",
  perdu: "Perdu",
  ancien: "Ancien",
};

/* ─── Dossiers (enum dossier_statut, source : pipeline-dossier) ─── */
export const STATUTS_DOSSIER = ETAPES.map((e) => e.key) as [EtapeKey, ...EtapeKey[]];
export type { EtapeKey as StatutDossier } from "./pipeline-dossier";

/** Dossiers encore dans le parcours (ni signé final, perdu, ni clôturé). */
export const STATUTS_DOSSIER_ACTIFS: readonly EtapeKey[] = [
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

export const STATUTS_DOSSIER_ACTIFS_SET: ReadonlySet<string> = new Set(STATUTS_DOSSIER_ACTIFS);

/** Dossiers en amont de la lettre de mission (relances, envoi LM). */
export const STATUTS_DOSSIER_AVANT_LM: readonly EtapeKey[] = ["nouveau", "en_cours"];

/** Étapes depuis lesquelles l'analyse IA peut faire avancer le dossier. */
export const STATUTS_DOSSIER_AMONT_ANALYSE: readonly EtapeKey[] = [
  "nouveau",
  "en_cours",
  "lettre_mission_envoyee",
  "dda_validee",
];

/* ─── Tâches (enums tache_priorite / tache_statut) ─── */
export const PRIORITES_TACHE = ["basse", "normale", "haute", "urgente"] as const;
export type PrioriteTache = (typeof PRIORITES_TACHE)[number];

export const STATUTS_TACHE = ["a_faire", "en_cours", "terminee", "annulee"] as const;
export type StatutTache = (typeof STATUTS_TACHE)[number];

export const STATUT_TACHE_LABEL: Record<StatutTache, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

export const PRIORITE_TACHE_LABEL: Record<PrioriteTache, string> = {
  basse: "Basse",
  normale: "Normale",
  haute: "Haute",
  urgente: "Urgente",
};

/* ─── Réclamations (colonne texte, cycle Médiation DDA) ─── */
export const STATUTS_RECLAMATION = [
  "ouverte",
  "accuse_envoye",
  "transmise_compagnie",
  "solution_proposee",
  "cloturee",
] as const;
export type StatutReclamation = (typeof STATUTS_RECLAMATION)[number];

export const STATUT_RECLAMATION_LABEL: Record<StatutReclamation, string> = {
  ouverte: "Ouverte",
  accuse_envoye: "Accusé envoyé",
  transmise_compagnie: "Transmise à la compagnie",
  solution_proposee: "Solution proposée",
  cloturee: "Clôturée",
};

/* ─── Recommandations prescripteurs ─── */
export const STATUTS_RECO = ["nouveau", "en_cours", "dossier_valide", "sans_suite"] as const;
export type StatutReco = (typeof STATUTS_RECO)[number];

export const STATUT_RECO_LABEL: Record<StatutReco, string> = {
  nouveau: "Nouvelle",
  en_cours: "En cours",
  dossier_valide: "Dossier validé",
  sans_suite: "Sans suite",
};
