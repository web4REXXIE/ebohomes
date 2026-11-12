import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendNotificationEmail } from '@/lib/notification-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Same rule as in-app: security and verification notifications are always delivered.
const ALWAYS_EMAIL = new Set(['security', 'verification'])

function secretMatches(received: string | null): boolean {
  const expected = process.env.EMAIL_WEBHOOK_SECRET
  if (!expected || !received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Called by a Supabase Database Webhook every time a row is added to public.notifications.
// Anonymous callers are rejected. The webhook body is never trusted for content.
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { type?: string; table?: string; record?: { id?: string | number } }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  if (body.type !== 'INSERT' || body.table !== 'notifications' || body.record?.id == null) {
    return NextResponse.json({ ok: true, skipped: 'not a new notification' })
  }
  const notificationId = String(body.record.id)

  try {
    const admin = getSupabaseAdmin()

    // Read the real row
    const { data: n, error: nErr } = await admin
      .from('notifications')
      .select('id, user_id, type, title, message, link')
      .eq('id', notificationId)
      .maybeSingle()
    if (nErr) throw new Error(nErr.message)
    if (!n) return NextResponse.json({ ok: true, skipped: 'notification not found' })

    // Does this person want email? No saved preference means yes.
    const type = n.type ?? 'general'
    if (!ALWAYS_EMAIL.has(type)) {
      const { data: prefs } = await admin
        .from('notification_preferences')
        .select('email_enabled')
        .eq('user_id', n.user_id)
        .maybeSingle()
      if (prefs?.email_enabled === false) {
        return NextResponse.json({ ok: true, skipped: 'email off for this user' })
      }
    }

    // Claim the notification so a repeated webhook can never email it twice.
    // An earlier FAILED attempt may be claimed again; anything else is left alone.
    const { error: claimErr } = await admin
      .from('email_deliveries')
      .insert({ notification_id: notificationId, status: 'sending' })
    if (claimErr) {
      if (claimErr.code !== '23505') throw new Error(claimErr.message)
      const { data: retry, error: retryErr } = await admin
        .from('email_deliveries')
        .update({ status: 'sending', detail: null, updated_at: new Date().toISOString() })
        .eq('notification_id', notificationId)
        .eq('status', 'failed')
        .select('notification_id')
      if (retryErr) throw new Error(retryErr.message)
      if (!retry || retry.length === 0) {
        return NextResponse.json({ ok: true, skipped: 'already handled' })
      }
    }

    const finish = async (status: 'sent' | 'failed', provider: string | null, detail: string | null) => {
      const { error } = await admin
        .from('email_deliveries')
        .update({ status, provider, detail, updated_at: new Date().toISOString() })
        .eq('notification_id', notificationId)
      if (error) console.error('Email webhook: could not save delivery result:', error.message)
    }

    // The address comes from the sign-in account, never from the webhook body.
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(n.user_id)
    const email = userData?.user?.email
    if (userErr || !email) {
      await finish('failed', null, 'The account has no email address.')
      return NextResponse.json({ ok: true, delivery: 'failed' })
    }

    const result = await sendNotificationEmail(email, {
      id: notificationId,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
    })

    if (result.status === 'accepted') {
      await finish('sent', result.provider ?? null, null)
    } else {
      await finish('failed', result.provider ?? null, result.detail ?? result.status)
    }
    return NextResponse.json({ ok: true, delivery: result.status })
  } catch (err) {
    console.error('Email webhook error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
