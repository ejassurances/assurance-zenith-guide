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
    "<p>Conformement a la reglementation, veuillez trouver ci-dessous (lien valable 7 jours) le Document d'Entree en Relation (DER) du cabinet " +
    nom +
    ".</p>" +
    "<p><a href='" +
    (props.link || "") +
    "'>Telecharger le DER</a></p>" +
    "<p>Ce document precise le statut de votre courtier, les compagnies partenaires et les modalites de remuneration.</p>" +
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
};
