/**
 * Étiquettes Gmail réellement utilisées par le cabinet (arborescence historique,
 * gérée manuellement). Les agents du CRM se posent EXCLUSIVEMENT sur ces
 * étiquettes : aucune branche parallèle « Agent X/… » n'est créée.
 *
 * Module client-safe : réutilisé côté serveur (gmail.server) et côté UI.
 *
 * Arborescence « Direction Commerciale » : trois services (Gestion Commerciale,
 * Service Client, Service Partenaire) avec trois étapes chacun (A_Traiter,
 * En_Attente_De_Validation, Archive). Le passage d'étape ne dépend jamais du
 * statut lu / non lu du message et ne le modifie jamais.
 */
export const LABELS_CABINET = {
  // Agent commercial (prospects).
  gc_a_traiter: "Direction Commerciale/Gestion Commerciale/A_Traiter",
  gc_attente_validation: "Direction Commerciale/Gestion Commerciale/En_Attente_De_Validation",
  gc_archive: "Direction Commerciale/Gestion Commerciale/Archive",
  // Agent relation client + sinistres.
  sc_a_traiter: "Direction Commerciale/Service Client/A_Traiter",
  sc_attente_validation: "Direction Commerciale/Service Client/En_Attente_De_Validation",
  sc_archive: "Direction Commerciale/Service Client/Archive",
  // Échanges et actualités compagnies / partenaires.
  sp_a_traiter: "Direction Commerciale/Service Partenaire/A_Traiter",
  sp_attente_validation: "Direction Commerciale/Service Partenaire/En_Attente_De_Validation",
  sp_archive: "Direction Commerciale/Service Partenaire/Archive",
  // Inchangé : publicité / accusés de réception.
  a_ignorer: "A_Ignorer/Accuses_Reception",
  // Agent finance : achats (factures fournisseurs) et commissions.
  achat_a_traiter: "Direction Financiere/Service Achat/A_Traiter",
  achat_archive: "Direction Financiere/Service Achat/Archive",
  commission_a_traiter: "Direction Financiere/Service Commission/A_Traiter",
  commission_archive: "Direction Financiere/Service Commission/Archive",
  // Module réclamations (circuit conformité, distinct des sinistres).
  rec_a_traiter: "Direction Juridique et Conformite/Service Reclamation/A_Traiter",
  rec_attente_validation:
    "Direction Juridique et Conformite/Service Reclamation/En_Attente_De_Validation",
  rec_archive: "Direction Juridique et Conformite/Service Reclamation/Archive",
  // Veille réglementaire (service conformité : à traiter puis archive).
  veille_a_traiter: "Direction Juridique et Conformite/Service Conformite/A_Traiter",
  veille_archive: "Direction Juridique et Conformite/Service Conformite/Archive",
  veille_non_impactee: "A_Ignorer/Veille_Non_Impactee",
} as const;

export type LabelCabinet = keyof typeof LABELS_CABINET;

/**
 * Seules étiquettes que le code est autorisé à créer : sous-libellés validés
 * par le cabinet, rattachés à des parents déjà existants. Toutes les autres
 * doivent exister dans Gmail, sinon l'erreur remonte (jamais de doublon).
 */
export const LABELS_CREABLES: readonly string[] = [LABELS_CABINET.veille_non_impactee];

