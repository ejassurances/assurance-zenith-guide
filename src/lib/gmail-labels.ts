/**
 * Étiquettes Gmail réellement utilisées par le cabinet (arborescence historique,
 * gérée manuellement). Les agents du CRM se posent EXCLUSIVEMENT sur ces
 * étiquettes : aucune branche parallèle « Agent X/… » n'est créée.
 *
 * Module client-safe : réutilisé côté serveur (gmail.server) et côté UI.
 */
export const LABELS_CABINET = {
  prospect_formulaire: "Prospects/Formulaire_Site",
  prospect_direct: "Prospects/Contact_Direct",
  prospect_traite_ia: "01_PROSPECTS_B2C/02_Traites_IA",
  prospect_a_relancer: "01_PROSPECTS_B2C/03_A_Relancer",
  a_ignorer: "A_Ignorer/Accuses_Reception",
  facture_fournisseur: "COMPTABILITE/01_Factures_Fournisseurs",
  bordereau_commissions: "COMPTABILITE/02_Bordereaux_Commissions",
  sinistre_reclamation: "Reclamations_Sinistres",
  compagnie_dossier: "Compagnies/Suivi_Dossier",
  compagnie_actualite: "ASSURANCES/02_Compagnies_Actualites",
  veille_reglementaire: "ASSURANCES/01_Veille_Reglementaire",
  veille_non_impactee: "A_Ignorer/Veille_Non_Impactee",
  relation_client_a_valider: "ASSURANCES/03_Relation_Client_A_Valider",
} as const;

export type LabelCabinet = keyof typeof LABELS_CABINET;

/**
 * Seules étiquettes que le code est autorisé à créer : sous-libellés validés
 * par le cabinet, rattachés à des parents déjà existants. Toutes les autres
 * doivent exister dans Gmail, sinon l'erreur remonte (jamais de doublon).
 */
export const LABELS_CREABLES: readonly string[] = [
  LABELS_CABINET.veille_reglementaire,
  LABELS_CABINET.veille_non_impactee,
  LABELS_CABINET.relation_client_a_valider,
];
