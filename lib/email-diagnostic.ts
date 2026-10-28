// Pure helpers for the admin "send confirmation code" feedback. No imports, safe for both server and browser.
// Nothing here ever sees the confirmation code.

export type SendProvider = 'smtp' | 'resend'
export type SendDelivery = 'accepted' | 'failed' | 'not_configured'

const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/

export function isPlausibleEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v.trim())
}

// john.doe@gmail.com -> jo******@gmail.com. Keeps the domain so the admin can spot a typo'd provider.
// Returns null when the value is not an email address, so the full text is never echoed back.
export function maskEmail(v: unknown): string | null {
  if (!isPlausibleEmail(v)) return null
  const e = v.trim()
  const at = e.lastIndexOf('@')
  const local = e.slice(0, at)
  const domain = e.slice(at + 1)
  const keep = local.length <= 1 ? 0 : local.length === 2 ? 1 : 2
  return `${local.slice(0, keep)}${'*'.repeat(Math.max(local.length - keep, 1))}@${domain}`
}

// Removes any copy of the full recipient address from provider text before it is shown or logged.
export function redactRecipient(text: string, to: string): string {
  const masked = maskEmail(to) ?? '[address hidden]'
  return to ? text.split(to).join(masked).split(to.toLowerCase()).join(masked) : text
}

export const providerLabel = (p?: string | null) => (p === 'smtp' ? 'SMTP (mail server)' : p === 'resend' ? 'Resend' : 'the email provider')

export type SendResultBody = {
  ok?: boolean
  error?: string
  delivery?: SendDelivery | string
  provider?: string | null
  message_id?: string | null
  to_masked?: string | null
}

export type SendSummary = { ok: boolean; text: string; messageId: string | null }

// What the admin sees. "Accepted" is never worded as "delivered".
export function describeSendResult(httpOk: boolean, j: SendResultBody | null | undefined): SendSummary {
  const to = j?.to_masked ? ` for ${j.to_masked}` : ''
  const messageId = j?.message_id ?? null
  if (httpOk && j?.ok && j.delivery === 'accepted') {
    return {
      ok: true,
      messageId,
      text: `${providerLabel(j.provider)} accepted the confirmation email${to}. This does not prove it reached the tenant's mailbox. If it does not arrive, ask the tenant to check spam, then look up this message in the provider's log.`,
    }
  }
  return { ok: false, messageId, text: j?.error ?? 'The code could not be sent.' }
}