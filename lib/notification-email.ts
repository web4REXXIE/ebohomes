// SERVER ONLY. Sends one EboHomes notification as an email.
// Uses the same settings as the payment-code email: Gmail/SMTP when SMTP_USER and SMTP_PASS are set,
// otherwise Resend (RESEND_API_KEY + EMAIL_FROM). Nothing new to configure.
// It never logs the full recipient address.
import nodemailer from 'nodemailer'
import { isPlausibleEmail, maskEmail, redactRecipient, type SendProvider } from '@/lib/email-diagnostic'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ebohomes.vercel.app').replace(/\/+$/, '')

export type NotificationEmailInput = {
  id: string
  type: string | null
  title: string | null
  message: string | null
  link: string | null
}

export type NotificationEmailOutcome = {
  status: 'accepted' | 'not_configured' | 'failed'
  provider?: SendProvider
  detail?: string
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').slice(0, 200)

// Only paths inside EboHomes. Anything else (other sites, "//host", "javascript:") falls back to the notifications page.
function safeLink(link: string | null): string {
  const l = (link ?? '').trim()
  if (l.startsWith('/') && !l.startsWith('//') && !l.includes('\\') && l.length <= 500) return `${SITE}${l}`
  return `${SITE}/notifications`
}

// These types stay private in email, the same way they do in push alerts: the email says something happened
// and asks the person to open EboHomes. Payment, security, verification, message and tenancy details never travel by email.
const PRIVATE_TYPES = new Set(['message', 'payment', 'tenancy', 'security', 'verification'])

export function buildNotificationEmail(n: NotificationEmailInput) {
  const type = n.type ?? 'general'
  const title = (n.title ?? '').trim().slice(0, 120) || 'You have an update on EboHomes'
  const detail = PRIVATE_TYPES.has(type)
    ? 'Open EboHomes to see the details.'
    : (n.message ?? '').trim().slice(0, 400) || 'Open EboHomes to see the update.'
  const url = safeLink(n.link)
  const prefsUrl = `${SITE}/notifications/preferences`

  const subject = `EboHomes: ${title}`.slice(0, 150)

  const text =
    `${title}\n\n${detail}\n\nOpen it on EboHomes: ${url}\n\n` +
    `EboHomes will never ask you for a payment code, password or bank details by email, phone or WhatsApp.\n` +
    `Manage your email notifications: ${prefsUrl}`

  const html =
    `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1f2d24">` +
    `<h2 style="color:#14532d;margin:0 0 12px">${esc(title)}</h2>` +
    `<p style="margin:0 0 20px;line-height:1.5">${esc(detail)}</p>` +
    `<p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;background:#14532d;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open on EboHomes</a></p>` +
    `<p style="font-size:12px;line-height:1.5;color:#5b6b61;margin:0 0 8px">EboHomes will never ask you for a payment code, password or bank details by email, phone or WhatsApp.</p>` +
    `<p style="font-size:12px;line-height:1.5;color:#5b6b61;margin:0"><a href="${esc(prefsUrl)}" style="color:#14532d">Manage your email notifications</a></p>` +
    `</div>`

  return { subject, text, html }
}

export async function sendNotificationEmail(to: string, n: NotificationEmailInput): Promise<NotificationEmailOutcome> {
  const masked = maskEmail(to)
  if (!isPlausibleEmail(to) || !masked) {
    return { status: 'failed', detail: 'The account email address is missing or not valid.' }
  }
  const recipient = to.trim()
  const { subject, text, html } = buildNotificationEmail(n)

  const from = process.env.EMAIL_FROM
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const resendKey = process.env.RESEND_API_KEY

  if (smtpUser && smtpPass) {
    try {
      const port = Number(process.env.SMTP_PORT || 465)
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: { user: smtpUser, pass: smtpPass },
      })
      const info: any = await transporter.sendMail({ from: from || smtpUser, to: recipient, subject, text, html })
      const accepted = (info?.accepted ?? []).map((a: any) => String(typeof a === 'string' ? a : a?.address ?? '').toLowerCase())
      if (!accepted.includes(recipient.toLowerCase())) {
        return {
          status: 'failed',
          provider: 'smtp',
          detail: `The mail server did not accept ${masked}${info?.response ? `: ${redactRecipient(clean(info.response), recipient)}` : '.'}`,
        }
      }
      return { status: 'accepted', provider: 'smtp' }
    } catch (e: any) {
      console.error('notification email: SMTP failed:', clean(e?.code), clean(e?.responseCode))
      return { status: 'failed', provider: 'smtp', detail: `Mail server said: ${redactRecipient(clean(e?.response || e?.message), recipient)}` }
    }
  }

  if (resendKey && from) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [recipient], subject, text, html }),
      })
      const body: any = await res.json().catch(() => null)
      if (res.ok) return { status: 'accepted', provider: 'resend' }
      console.error('notification email: Resend refused:', res.status, clean(body?.name))
      return {
        status: 'failed',
        provider: 'resend',
        detail: `Resend said (${res.status}): ${redactRecipient(clean(body?.message || body?.name || 'no reason given'), recipient)}`,
      }
    } catch (e: any) {
      console.error('notification email: Resend request failed:', clean(e?.message))
      return { status: 'failed', provider: 'resend', detail: 'Could not reach Resend.' }
    }
  }

  return { status: 'not_configured', detail: 'No email provider is set up (SMTP_USER and SMTP_PASS, or RESEND_API_KEY and EMAIL_FROM).' }
}
