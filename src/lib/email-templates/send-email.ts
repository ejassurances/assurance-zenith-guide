import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from './registry'

// Server-only: reads LOVABLE_API_KEY / BREVO_API_KEY. Never import from client components.

const SITE_NAME = 'EJ Partners Assurances'
/** Adresse expéditrice (doit être un expéditeur/domaine vérifié dans Brevo). */
const FROM_EMAIL = 'contact@ej-assurances.fr'
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/brevo'

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /**
   * Variables transmises à Brevo (`params`) avec les noms canoniques en
   * majuscules : PRENOM, LIEN_ACTION, TYPE_ASSURANCE, NOM_COMPAGNIE,
   * NOM_COMPAGNIE_RECOMMANDEE, NOM_PRODUIT, PIECES_MANQUANTES.
   */
  brevoParams?: Record<string, any>
  /** Conservé pour compatibilité des appels existants (dédoublonnage applicatif). */
  idempotencyKey?: string
  replyTo?: string
}

/**
 * Rend un template enregistré et l'envoie via le connecteur Brevo
 * (passerelle Lovable). Toute erreur d'envoi lève une exception.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const lovableApiKey = process.env['LOVABLE_API_KEY']
  if (!lovableApiKey) {
    throw new Error('LOVABLE_API_KEY is not configured')
  }
  const brevoKey = process.env['BREVO_API_KEY']
  if (!brevoKey) {
    throw new Error('BREVO_API_KEY is not configured')
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const recipient = template.to || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  const response = await fetch(`${GATEWAY_URL}/smtp/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lovableApiKey}`,
      'X-Connection-Api-Key': brevoKey,
    },
    body: JSON.stringify({
      sender: { name: SITE_NAME, email: FROM_EMAIL },
      to: [{ email: recipient }],
      subject,
      htmlContent: html,
      textContent: text,
      ...(options.replyTo ? { replyTo: { email: options.replyTo } } : {}),
      tags: [templateName],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`Brevo send failed [${response.status}] (${templateName}): ${body}`)
    throw new Error(`Brevo send failed [${response.status}]: ${body}`)
  }

  return { sent: true }
}
