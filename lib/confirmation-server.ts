// SERVER ONLY.
import nodemailer from 'nodemailer'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

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

export type EmailOutcome = { status: 'sent' | 'not_configured' | 'failed'; detail?: string }

// Short, safe reason for the ADMIN screen only. It never contains the code.
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

// Sends the code. Uses Gmail SMTP when SMTP_USER and SMTP_PASS are set, otherwise Resend.
// Returns the real outcome. Never logs the code.
export async function sendCodeEmail(to: string, formattedCode: string, propertyTitle: string): Promise<EmailOutcome> {
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
      await transporter.sendMail({ from: from || smtpUser, to, subject, text, html })
      return { status: 'sent' }
    } catch (e: any) {
      console.error('email: SMTP send failed:', clean(e?.code), clean(e?.responseCode))
      return { status: 'failed', detail: `Mail server said: ${clean(e?.response || e?.message)}` }
    }
  }

  if (resendKey && from) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
      })
      if (res.ok) return { status: 'sent' }
      const body: any = await res.json().catch(() => null)
      console.error('email: Resend refused:', res.status, clean(body?.name))
      return { status: 'failed', detail: `Resend said (${res.status}): ${clean(body?.message || body?.name || 'no reason given')}` }
    } catch (e: any) {
      console.error('email: Resend request failed:', clean(e?.message))
      return { status: 'failed', detail: 'Could not reach Resend.' }
    }
  }

  return { status: 'not_configured' }
}