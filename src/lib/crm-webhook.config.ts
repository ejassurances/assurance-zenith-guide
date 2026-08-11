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

export type CrmWebhookPayload = {
  source: "ej-partners-crm";
  event: string;
  sent_at: string;
  client: CrmWebhookClient;
};
