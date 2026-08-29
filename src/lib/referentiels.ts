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

/* ─── Réclamations (colonne texte, cycle conformité cabinet) ─── */
export const STATUTS_RECLAMATION = [
  "ouvert",
  "analyse",
  "accuse_reception_envoye",
  "en_attente_reponse",
  "clos",
] as const;
export type StatutReclamation = (typeof STATUTS_RECLAMATION)[number];

export const STATUT_RECLAMATION_LABEL: Record<StatutReclamation, string> = {
  ouvert: "Ouvert",
  analyse: "En analyse",
  accuse_reception_envoye: "Accusé de réception envoyé",
  en_attente_reponse: "En attente de réponse",
  clos: "Clos",
};

export const STATUT_RECLAMATION_STYLE: Record<StatutReclamation, string> = {
  ouvert: "bg-amber-100 text-amber-900 border-amber-300",
  analyse: "bg-amber-100 text-amber-900 border-amber-300",
  accuse_reception_envoye: "bg-sky-100 text-sky-900 border-sky-300",
  en_attente_reponse: "bg-sky-100 text-sky-900 border-sky-300",
  clos: "bg-emerald-100 text-emerald-900 border-emerald-300",
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
