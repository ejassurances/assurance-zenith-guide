import * as React from "react";
import type { ComponentType } from "react";

export interface TemplateEntry {
  component: ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  displayName?: string;
  previewData?: Record<string, any>;
  to?: string;
}

function DerEnvoiEmail(props: { clientName?: string; cabinetName?: string; link?: string }) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const html =
    "<p>Bonjour " +
    (props.clientName || "") +
    ",</p>" +
    "<p>Conformement a la reglementation, veuillez trouver ci-dessous le Document d'Entree en Relation (DER) du cabinet " +
    nom +
    ".</p>" +
    "<p><a href='" +
    (props.link || "") +
    "'>Consulter et signer le DER</a></p>" +
    "<p>Ce document precise le statut de votre courtier, les compagnies partenaires et les modalites de remuneration.</p>" +
    "<p>Cordialement,<br/>L'equipe " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}

function LettreMissionEnvoiEmail(props: {
  clientName?: string;
  cabinetName?: string;
  reference?: string;
  link?: string;
}) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const html =
    "<p>Bonjour " +
    (props.clientName || "") +
    ",</p>" +
    "<p>Votre lettre de mission concernant votre dossier " +
    (props.reference || "") +
    " est disponible dans votre espace client. Elle recapitule les informations recueillies et la mission confiee au cabinet " +
    nom +
    ".</p>" +
    "<p><a href='" +
    (props.link || "") +
    "'>Consulter et signer la lettre de mission</a></p>" +
    "<p>Une fois signee, nous pourrons engager la recherche des solutions les plus adaptees a votre situation.</p>" +
    "<p>Cordialement,<br/>L'equipe " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}

function DevoirConseilEnvoiEmail(props: {
  clientName?: string;
  cabinetName?: string;
  reference?: string;
  link?: string;
}) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const html =
    "<p>Bonjour " +
    (props.clientName || "") +
    ",</p>" +
    "<p>Votre devoir de conseil relatif au dossier " +
    (props.reference || "") +
    " est disponible dans votre espace client. Il presente la solution recommandee et les motifs de ce conseil.</p>" +
    "<p><a href='" +
    (props.link || "") +
    "'>Consulter, accepter ou refuser la recommandation</a></p>" +
    "<p>Votre reponse est necessaire avant toute souscription.</p>" +
    "<p>Cordialement,<br/>L'equipe " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}


function CompteClientCreeEmail(props: {
  clientName?: string;
  email?: string;
  motDePasseProvisoire?: string;
  cabinetName?: string;
  link?: string;
}) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const html =
    "<p>Bonjour " +
    (props.clientName || "") +
    ",</p>" +
    "<p>Votre espace client " +
    nom +
    " a ete cree. Vous y retrouverez votre projet, vos pieces justificatives et vos documents a signer.</p>" +
    "<p><strong>Identifiant :</strong> " +
    (props.email || "") +
    "<br/><strong>Mot de passe provisoire :</strong> " +
    (props.motDePasseProvisoire || "") +
    "</p>" +
    "<p><a href='" +
    (props.link || "") +
    "'>Acceder a mon espace client</a></p>" +
    "<p>Pour votre securite, le changement de ce mot de passe provisoire est obligatoire lors de votre premiere connexion.</p>" +
    "<p>Cordialement,<br/>L'equipe " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}

function PiecesManquantesEmail(props: {
  clientName?: string;
  cabinetName?: string;
  reference?: string;
  pieces?: string[];
  link?: string;
}) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const liste = (props.pieces || []).map((p) => "<li>" + p + "</li>").join("");
  const html =
    "<p>Bonjour " +
    (props.clientName || "") +
    ",</p>" +
    "<p>Afin de poursuivre l'etude de votre dossier " +
    (props.reference || "") +
    ", il nous manque les pieces suivantes :</p>" +
    "<ul>" +
    liste +
    "</ul>" +
    "<p><a href='" +
    (props.link || "") +
    "'>Deposer mes pieces dans mon espace client</a></p>" +
    "<p>Cordialement,<br/>L'equipe " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}

function DocumentsExpirationEmail(props: {
  clientName?: string;
  cabinetName?: string;
  documents?: string[];
  link?: string;
}) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const liste = (props.documents || []).map((d) => "<li>" + d + "</li>").join("");
  const html =
    "<p>Bonjour " +
    (props.clientName || "") +
    ",</p>" +
    "<p>Certains documents de votre dossier arrivent a expiration :</p>" +
    "<ul>" +
    liste +
    "</ul>" +
    "<p>Afin de maintenir votre dossier a jour, merci de nous transmettre les pieces renouvelees.</p>" +
    "<p><a href='" +
    (props.link || "") +
    "'>Deposer mes pieces dans mon espace client</a></p>" +
    "<p>Cordialement,<br/>L'equipe " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}

function MotDePasseReinitialisationEmail(props: { prenom?: string; cabinetName?: string; link?: string }) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const html =
    "<p>Bonjour " +
    (props.prenom || "") +
    ",</p>" +
    "<p>Vous avez demande la definition d'un nouveau mot de passe pour votre espace " +
    nom +
    ".</p>" +
    "<p><a href='" +
    (props.link || "") +
    "'>Definir mon nouveau mot de passe</a></p>" +
    "<p>Ce lien est valable une seule fois et pour une duree limitee. Vous serez connecte automatiquement a votre espace une fois le nouveau mot de passe enregistre.</p>" +
    "<p>Si vous n'etes pas a l'origine de cette demande, ignorez simplement ce message : votre mot de passe actuel reste inchange.</p>" +
    "<p>Cordialement,<br/>L'equipe " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}

/**
 * E-mail court de renvoi du lien de connexion : aucun rappel du DER ni
 * presentation du cabinet, uniquement l'acces a l'espace client.
 */
function LienConnexionEmail(props: {
  clientName?: string;
  email?: string;
  cabinetName?: string;
  link?: string;
  motDePasseProvisoire?: string;
}) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const bloc = props.motDePasseProvisoire
    ? "<p><strong>Identifiant :</strong> " +
      (props.email || "") +
      "<br/><strong>Nouveau mot de passe provisoire :</strong> " +
      props.motDePasseProvisoire +
      "</p>"
    : "<p><strong>Identifiant :</strong> " + (props.email || "") + "</p>";
  const html =
    "<p>Bonjour " +
    (props.clientName || "") +
    ",</p>" +
    "<p>Voici le lien de connexion a votre espace client " +
    nom +
    " :</p>" +
    bloc +
    "<p><a href='" +
    (props.link || "") +
    "'>Acceder a mon espace client</a></p>" +
    "<p>Cordialement,<br/>L'equipe " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}

/** Envoi du dossier de souscription à la compagnie (destinataire : service souscription). */
function SouscriptionCompagnieEmail(props: {
  compagnieName?: string;
  cabinetName?: string;
  reference?: string;
  clientName?: string;
  produit?: string;
  branche?: string;
  commentaire?: string;
  link?: string;
}) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const html =
    "<p>Bonjour,</p>" +
    "<p>Veuillez trouver ci-dessous une demande de souscription transmise par le cabinet " +
    nom +
    " :</p>" +
    "<ul>" +
    "<li><strong>Reference dossier :</strong> " +
    (props.reference || "") +
    "</li>" +
    "<li><strong>Client :</strong> " +
    (props.clientName || "") +
    "</li>" +
    "<li><strong>Branche :</strong> " +
    (props.branche || "") +
    "</li>" +
    "<li><strong>Produit :</strong> " +
    (props.produit || "") +
    "</li>" +
    "</ul>" +
    (props.commentaire ? "<p>" + props.commentaire + "</p>" : "") +
    "<p>Le devoir de conseil a ete signe par le client et les pieces justificatives sont disponibles sur demande.</p>" +
    "<p>Merci de nous confirmer la prise en charge ainsi que le numero de contrat attribue.</p>" +
    "<p>Cordialement,<br/>Le service souscription " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}

/** Relance automatique de la compagnie sans retour sur une souscription. */
function SouscriptionRelanceEmail(props: {
  cabinetName?: string;
  reference?: string;
  clientName?: string;
  produit?: string;
  jours?: number;
}) {
  const nom = props.cabinetName || "EJ Partners Assurances";
  const html =
    "<p>Bonjour,</p>" +
    "<p>Sauf erreur de notre part, la demande de souscription suivante reste sans retour depuis " +
    String(props.jours || 3) +
    " jours :</p>" +
    "<ul>" +
    "<li><strong>Reference dossier :</strong> " +
    (props.reference || "") +
    "</li>" +
    "<li><strong>Client :</strong> " +
    (props.clientName || "") +
    "</li>" +
    "<li><strong>Produit :</strong> " +
    (props.produit || "") +
    "</li>" +
    "</ul>" +
    "<p>Pourriez-vous nous indiquer l'etat d'avancement du dossier et, le cas echeant, les pieces complementaires attendues ?</p>" +
    "<p>Cordialement,<br/>Le service souscription " +
    nom +
    "</p>";
  const style = { fontFamily: "Arial, sans-serif", color: "#1a1a1a", fontSize: "15px", lineHeight: "1.6" };
  return React.createElement("div", { style: style, dangerouslySetInnerHTML: { __html: html } });
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  "lien-connexion": {
    component: LienConnexionEmail,
    subject: (data: Record<string, any>) =>
      (data && data.cabinetName ? data.cabinetName : "EJ Partners Assurances") +
      " - Votre lien de connexion a votre espace client",
    displayName: "Espace client - Lien de connexion (renvoi)",
    previewData: {
      clientName: "Jean Dupont",
      email: "jean.dupont@example.com",
      cabinetName: "EJ Partners Assurances",
      link: "https://ejpartners.fr/auth",
    },
  },
  "mot-de-passe-reinitialisation": {
    component: MotDePasseReinitialisationEmail,
    subject: (data: Record<string, any>) =>
      (data && data.cabinetName ? data.cabinetName : "EJ Partners Assurances") +
      " - Definition de votre nouveau mot de passe",
    displayName: "Mot de passe - Reinitialisation",
    previewData: {
      prenom: "Jean",
      cabinetName: "EJ Partners",
      link: "https://ejpartners.fr/reset-password",
    },
  },
  "documents-expiration": {
    component: DocumentsExpirationEmail,
    subject: "Vos documents arrivent a expiration",
    displayName: "Relance - Documents expirant",
    previewData: {
      clientName: "Jean Dupont",
      documents: ["Carte d'identite (valide jusqu'au 01/09/2026)"],
      link: "https://example.com/espace/mon-espace",
    },
  },

  "compte-client-cree": {
    component: CompteClientCreeEmail,
    subject: (data: Record<string, any>) =>
      (data && data.cabinetName ? data.cabinetName : "EJ Partners Assurances") + " - Vos acces a votre espace client",
    displayName: "Espace client - Acces provisoires",
    previewData: {
      clientName: "Jean Dupont",
      email: "jean.dupont@example.com",
      motDePasseProvisoire: "Xk4mQr9pTz2v!7",
      link: "https://example.com/auth",
    },
  },
  "pieces-manquantes": {
    component: PiecesManquantesEmail,
    subject: (data: Record<string, any>) =>
      "Votre dossier " + (data && data.reference ? data.reference : "") + " - pieces manquantes",
    displayName: "Relance - Pieces manquantes",
    previewData: {
      clientName: "Jean Dupont",
      reference: "DOSS-2025-001",
      pieces: ["Piece d'identite", "RIB"],
      link: "https://example.com/espace/mon-espace",
    },
  },
  "der-envoi": {
    component: DerEnvoiEmail,
    subject: (data: Record<string, any>) =>
      (data && data.cabinetName ? data.cabinetName : "EJ Partners Assurances") +
      " - Document d'Entree en Relation (DER)",
    displayName: "DER - Envoi client",
    previewData: {
      clientName: "Jean Dupont",
      cabinetName: "EJ Partners Assurances",
      link: "https://example.com/der.pdf",
    },
  },
  "lettre-mission-envoi": {
    component: LettreMissionEnvoiEmail,
    subject: (data: Record<string, any>) =>
      (data && data.cabinetName ? data.cabinetName : "EJ Partners Assurances") +
      " - Votre lettre de mission",
    displayName: "Lettre de mission - Envoi client",
    previewData: {
      clientName: "Jean Dupont",
      cabinetName: "EJ Partners Assurances",
      reference: "DOSS-2025-001",
      link: "https://example.com/signer",
    },
  },
  "devoir-conseil-envoi": {
    component: DevoirConseilEnvoiEmail,
    subject: (data: Record<string, any>) =>
      (data && data.cabinetName ? data.cabinetName : "EJ Partners Assurances") +
      " - Votre devoir de conseil",
    displayName: "Devoir de conseil - Envoi client",
    previewData: {
      clientName: "Jean Dupont",
      cabinetName: "EJ Partners Assurances",
      reference: "DOSS-2025-001",
      link: "https://example.com/signer-devoir-conseil",
    },
  },
  "souscription-compagnie": {
    component: SouscriptionCompagnieEmail,
    subject: (data: Record<string, any>) =>
      "Demande de souscription - dossier " + (data && data.reference ? data.reference : ""),
    displayName: "Souscription - Envoi compagnie",
    previewData: {
      compagnieName: "April",
      cabinetName: "EJ Partners Assurances",
      reference: "DOSS-2025-001",
      clientName: "Jean Dupont",
      produit: "Emprunteur Solution",
      branche: "Assurance emprunteur",
    },
  },
  "souscription-relance-compagnie": {
    component: SouscriptionRelanceEmail,
    subject: (data: Record<string, any>) =>
      "Relance - demande de souscription dossier " + (data && data.reference ? data.reference : ""),
    displayName: "Souscription - Relance compagnie",
    previewData: {
      cabinetName: "EJ Partners Assurances",
      reference: "DOSS-2025-001",
      clientName: "Jean Dupont",
      produit: "Emprunteur Solution",
      jours: 3,
    },
  },
};

