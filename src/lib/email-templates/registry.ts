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

export const TEMPLATES: Record<string, TemplateEntry> = {
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
};
