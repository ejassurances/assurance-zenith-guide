/* Configuration du webhook CRM (Google Apps Script) */

export const CRM_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbxvn8FyPlxsiI2VNbijdtRWS2WglbZcmNjo0_TuzFr9v9kePrjlXhBKoXgOCRHBUs2m/exec";

export type CrmWebhookClient = {
  id: string;
  reference: string;
  civilite: string | null;
  prenom: string | null;
  nom: string;
  email: string | null;
  mobile: string | null;
  ville: string | null;
  code_postal: string | null;
  statut: string;
  origine: string | null;
  marque: string;
  besoins: string[];
  dda_statut: string;
  conformite_score: number | null;
  conformite_niveau: string | null;
  created_at: string;
};

/** Métadonnées de classement Drive pour un document signé transmis au webhook. */
export type CrmWebhookDocument = {
  /** Dossier Drive cible côté Apps Script. */
  drive_folder: string;
  type: string;
  nom_fichier: string;
  mime_type: string;
  /** Contenu du PDF en base64 (sans préfixe data:). */
  contenu_base64: string;
  /** Lien signé de secours (valable 7 jours). */
  url_signee: string | null;
  signe_le: string | null;
  empreinte_sha256: string | null;
};

export type CrmWebhookDossier = {
  id: string;
  reference: string;
  type_assurance: string;
  statut: string;
};

export type CrmWebhookPayload = {
  source: "ej-partners-crm";
  event: string;
  sent_at: string;
  client: CrmWebhookClient;
  dossier?: CrmWebhookDossier;
  document?: CrmWebhookDocument;
};
