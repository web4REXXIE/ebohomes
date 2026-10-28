// SERVER ONLY.
import nodemailer from 'nodemailer'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { isPlausibleEmail, maskEmail, redactRecipient, type SendProvider } from '@/lib/email-diagnostic'

// Validates the tenant's token and returns a client that acts AS that user (auth.uid() = the tenant).
export async function authTenant(req: Request): Promise<{ db: SupabaseClient; user: User } | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!token || !url || !anon) return null
  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return null
  return { db, user: data.user }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

// 'accepted' means the provider took the message. It does NOT prove the tenant's mailbox received it.
export type EmailOutcome = {
  status: 'accepted' | 'not_configured' | 'failed'
  provider?: SendProvider
  messageId?: string | null
  to?: string | null // masked recipient, safe to show to the admin
  detail?: string
}

// Short, safe reason for the ADMIN screen only. It never contains the code or the full recipient address.
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').slice(0, 200)

function buildMessage(formattedCode: string, propertyTitle: string) {
  const subject = 'Your EboHomes payment confirmation code'
  const text =
    `Your EboHomes payment confirmation code is: ${formattedCode}\n\n` +
    `Property: ${propertyTitle}\n` +
    `EboHomes has verified your payment in our bank account. Enter this code on your payment page to finish confirming it.\n` +
    `The code works once and expires in 24 hours.\n\n` +
    `EboHomes staff will never ask you for this code by phone, WhatsApp or message. Do not share it.`
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1f2d24">` +
    `<h2 style="color:#14532d">EboHomes payment confirmation</h2>` +
    `<p>EboHomes has verified your payment for <b>${esc(propertyTitle)}</b>. Enter this code on your payment page to finish confirming it:</p>` +
    `<p style="font-size:30px;letter-spacing:4px;font-weight:bold;background:#f5f1e6;padding:16px;text-align:center;border-radius:8px">${esc(formattedCode)}</p>` +
    `<p>It works once and expires in 24 hours.</p>` +
    `<p style="color:#7f1d1d"><b>EboHomes staff will never ask for this code by phone, WhatsApp or message. Do not share it.</b></p></div>`
  return { subject, text, html }
}

const addr = (a: unknown): string => String(typeof a === 'string' ? a : (a as any)?.address ?? '').trim().toLowerCase()

// Sends the code. Uses Gmail SMTP when SMTP_USER and SMTP_PASS are set, otherwise Resend (unchanged selection).
// Returns what the provider actually said. Never logs the code or the full recipient address.
export async function sendCodeEmail(to: string, formattedCode: string, propertyTitle: string): Promise<EmailOutcome> {
  const masked = maskEmail(to)
  if (!isPlausibleEmail(to) || !masked) return { status: 'failed', to: null, detail: 'The tenant\u2019s account email address is missing or not a valid email address.' }
  const recipient = to.trim()

  const from = process.env.EMAIL_FROM
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const resendKey = process.env.RESEND_API_KEY
  const { subject, text, html } = buildMessage(formattedCode, propertyTitle)

  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: { user: smtpUser, pass: smtpPass },
      })
      const info: any = await transporter.sendMail({ from: from || smtpUser, to: recipient, subject, text, html })
      const accepted = (info?.accepted ?? []).map(addr)
      const rejected = (info?.rejected ?? []).map(addr)
      const want = recipient.toLowerCase()
      const messageId = info?.messageId ? clean(info.messageId) : null
      if (rejected.includes(want) || !accepted.includes(want)) {
        console.error('email: SMTP did not accept the recipient. messageId:', messageId ?? 'none')
        return { status: 'failed', provider: 'smtp', messageId, to: masked, detail: `The mail server did not accept ${masked}${info?.response ? `: ${redactRecipient(clean(info.response), recipient)}` : '.'}` }
      }
      console.info('email: SMTP accepted. messageId:', messageId ?? 'none')
      return { status: 'accepted', provider: 'smtp', messageId, to: masked }
    } catch (e: any) {
      console.error('email: SMTP send failed:', clean(e?.code), clean(e?.responseCode))
      return { status: 'failed', provider: 'smtp', to: masked, detail: `Mail server said: ${redactRecipient(clean(e?.response || e?.message), recipient)}` }
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
      if (res.ok) {
        const messageId = body?.id ? clean(body.id) : null
        console.info('email: Resend accepted. messageId:', messageId ?? 'none')
        return { status: 'accepted', provider: 'resend', messageId, to: masked }
      }
      console.error('email: Resend refused:', res.status, clean(body?.name))
      return { status: 'failed', provider: 'resend', to: masked, detail: `Resend said (${res.status}): ${redactRecipient(clean(body?.message || body?.name || 'no reason given'), recipient)}` }
    } catch (e: any) {
      console.error('email: Resend request failed:', clean(e?.message))
      return { status: 'failed', provider: 'resend', to: masked, detail: 'Could not reach Resend.' }
    }
  }

  return { status: 'not_configured', to: masked }
}