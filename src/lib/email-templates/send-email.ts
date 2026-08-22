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
  /** Pièces jointes (contenu encodé en base64). */
  attachments?: { name: string; base64: string }[]
  /**
   * Rattachement de la copie Gmail à la fiche client / au dossier, afin que le
   * message apparaisse dans « Historique des échanges ».
   */
  liens?: {
    client_id?: string | null
    dossier_id?: string | null
    contrat_id?: string | null
    compagnie_id?: string | null
  }
}

/**
 * Rend un template enregistré et l'envoie via le connecteur Brevo — y compris
 * les quatre courriers d'accompagnement DDA (DER, lettre de mission, devoir de
 * conseil, signature de souscription), dont la traçabilité ACPR est assurée par
 * la copie automatique déposée dans la boîte Gmail du cabinet. La génération des
 * PDF reste inchangée : seul le texte du mail passe par Brevo. Toute erreur
 * d'envoi lève une exception.
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

  if (TEMPLATES_DDA.has(templateName)) {
    const { envoyerMessage } = await import('@/lib/gmail.server')
    const envoi = await envoyerMessage({
      to: recipient,
      sujet: subject,
      html: withHtmlSignature(html),
      from: `${SITE_NAME} <${FROM_EMAIL}>`,
      replyTo: options.replyTo ?? null,
      attachments: options.attachments,
    })
    console.log(
      `[email] OK (Gmail entreprise) template=${templateName} destinataire=${recipient} messageId=${envoi.id}`
    )
    return { sent: true }
  }

  const brevoKey = process.env['BREVO_API_KEY']
  if (!brevoKey) {
    throw new Error('BREVO_API_KEY is not configured')
  }


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
      htmlContent: withHtmlSignature(html),
      textContent: withTextSignature(text),
      ...(options.brevoParams ? { params: options.brevoParams } : {}),
      ...(options.replyTo ? { replyTo: { email: options.replyTo } } : {}),
      ...(options.attachments && options.attachments.length
        ? { attachment: options.attachments.map((a) => ({ name: a.name, content: a.base64 })) }
        : {}),
      tags: [templateName],

    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(
      `[email] ECHEC template=${templateName} destinataire=${recipient} status=${response.status} reponse=${body}`
    )
    throw new Error(`Brevo send failed [${response.status}]: ${body}`)
  }

  let messageId: string | null = null
  try {
    const payload = (await response.json()) as { messageId?: string }
    messageId = payload.messageId ?? null
  } catch {
    messageId = null
  }
  console.log(
    `[email] OK template=${templateName} destinataire=${recipient} messageId=${messageId ?? 'n/a'}`
  )

  // Trace de l'envoi dans la boîte Gmail du cabinet (copie dans « Envoyés »,
  // libellée « Envoyé via Brevo »). N'impacte jamais l'envoi réel.
  try {
    const { deposerCopieEnvoyee } = await import('@/lib/gmail.server')
    await deposerCopieEnvoyee({
      to: recipient,
      sujet: subject,
      html: withHtmlSignature(html),
      from: `${SITE_NAME} <${FROM_EMAIL}>`,
      replyTo: options.replyTo ?? null,
      attachments: options.attachments,
    })
  } catch (e) {
    console.error('[email] copie Gmail de l’envoi Brevo impossible:', e)
  }

  return { sent: true }
}

/**
 * Signature réglementaire obligatoire, ajoutée automatiquement en pied de
 * TOUS les e-mails sortants du cabinet (mentions ORIAS / ACPR).
 */
const SIGNATURE_LINES = [
  `${SITE_NAME} — Courtier en assurances`,
  `71 Rue du Docteur Roux, 95600 Eaubonne — 01 89 31 40 29 — ${FROM_EMAIL}`,
  'SIRET 500 256 904 — ORIAS n° 25005811 (registre consultable sur www.orias.fr)',
  "Activité soumise au contrôle de l'ACPR — 4 Place de Budapest, CS 92459, 75436 Paris Cedex 09 (acpr.banque-france.fr)",
  'Ce message et ses pièces jointes sont confidentiels et destinés au seul destinataire.',
]

function signatureHtml(): string {
  const lignes = SIGNATURE_LINES.map(
    (l, i) =>
      `<p style="margin:0 0 4px;font-size:11px;line-height:1.5;color:#6b7280;${i === 0 ? 'font-weight:600;color:#374151;' : ''}">${l}</p>`
  ).join('')
  return `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;">${lignes}</div>`
}

export function withHtmlSignature(html: string): string {
  const signature = signatureHtml()
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${signature}</body>`)
  return `${html}${signature}`
}

export function withTextSignature(text: string): string {
  return `${text}\n\n---------------------------------------------\n${SIGNATURE_LINES.join('\n')}\n`
}

