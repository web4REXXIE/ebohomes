import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buildPushPayload, sendPushToUser } from '@/lib/push-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function secretMatches(received: string | null): boolean {
  const expected = process.env.PUSH_WEBHOOK_SECRET
  if (!expected || !received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Called by a Supabase Database Webhook every time a row is added to
// public.notifications. Anonymous callers are rejected.
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

    // Never trust the webhook body for content: read the real row
    const { data: n, error: nErr } = await admin
      .from('notifications')
      .select('id, user_id, type, title, message, link')
      .eq('id', notificationId)
      .maybeSingle()
    if (nErr) throw new Error(nErr.message)
    if (!n) return NextResponse.json({ ok: true, skipped: 'notification not found' })

    // Does this person want push at all?
    const { data: prefs } = await admin
      .from('notification_preferences')
      .select('push_enabled')
      .eq('user_id', n.user_id)
      .maybeSingle()
    if (prefs?.push_enabled !== true) {
      return NextResponse.json({ ok: true, skipped: 'push off for this user' })
    }

    // Claim the notification so a repeated webhook can never send it twice
    const { error: claimErr } = await admin
      .from('push_deliveries')
      .insert({ notification_id: notificationId })
    if (claimErr) {
      if (claimErr.code === '23505') {
        return NextResponse.json({ ok: true, skipped: 'already sent' })
      }
      throw new Error(claimErr.message)
    }

    const payload = buildPushPayload({
      id: notificationId,
      type: n.type,
      title: n.title,
      message: n.message,
      link: n.link,
    })

    const result = await sendPushToUser(n.user_id, payload, {
      urgency: n.type === 'message' ? 'high' : 'normal',
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('Push webhook error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}