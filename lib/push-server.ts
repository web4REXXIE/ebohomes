// SERVER ONLY. Sends Web Push messages with VAPID. Never import from client code.
import webpush from 'web-push'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type PushPayload = {
  title: string
  body: string
  url: string
  tag?: string
}

type SubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  failure_count: number
}

export type SendResult = {
  sent: number
  failed: number
  removed: number
  devices: number
}

const MAX_FAILURES = 5
let vapidReady = false

function ensureVapid() {
  if (vapidReady) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    throw new Error('Missing VAPID settings (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidReady = true
}

// Only links that stay inside EboHomes are allowed
export function safeInternalPath(link: string | null | undefined): string {
  if (
    typeof link === 'string' &&
    link.startsWith('/') &&
    !link.startsWith('//') &&
    !link.startsWith('/\\')
  ) {
    return link
  }
  return '/notifications'
}

// What a lock screen is allowed to show. Private details (amounts, names,
// message text, tenancy codes, reasons) are never put in a push.
export function buildPushPayload(n: {
  id: string
  type: string | null
  title: string | null
  message: string | null
  link: string | null
}): PushPayload {
  const type = n.type ?? 'general'
  const title = (n.title ?? '').trim().slice(0, 80) || 'EboHomes'

  let body: string
  switch (type) {
    case 'message':
      body = 'Open EboHomes to read it.'
      break
    case 'payment':
    case 'tenancy':
    case 'security':
    case 'verification':
      body = 'Open EboHomes to see the details.'
      break
    default:
      body = (n.message ?? '').trim().slice(0, 140) || 'Open EboHomes to see the update.'
  }

  return {
    title,
    body,
    url: safeInternalPath(n.link),
    tag: `notification-${n.id}`,
  }
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  options?: { urgency?: 'very-low' | 'low' | 'normal' | 'high' }
): Promise<SendResult> {
  ensureVapid()
  const admin = getSupabaseAdmin()

  // Only this person's own devices are ever read
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, failure_count')
    .eq('user_id', userId)

  if (error) throw new Error(`Could not load subscriptions: ${error.message}`)
  const subs = (data ?? []) as SubscriptionRow[]
  const result: SendResult = { sent: 0, failed: 0, removed: 0, devices: subs.length }
  if (subs.length === 0) return result

  const body = JSON.stringify(payload)

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: options?.urgency ?? 'normal', timeout: 8000 }
        )
        result.sent++
        await admin
          .from('push_subscriptions')
          .update({ failure_count: 0, last_success_at: new Date().toISOString() })
          .eq('id', s.id)
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404 / 410 = the browser says this subscription is gone for good
        if (status === 404 || status === 410) {
          result.removed++
          await admin.from('push_subscriptions').delete().eq('id', s.id)
          return
        }
        result.failed++
        const next = s.failure_count + 1
        if (next >= MAX_FAILURES) {
          result.removed++
          await admin.from('push_subscriptions').delete().eq('id', s.id)
        } else {
          await admin.from('push_subscriptions').update({ failure_count: next }).eq('id', s.id)
        }
        console.error('Push delivery failed', { status, subscription: s.id })
      }
    })
  )

  return result
}