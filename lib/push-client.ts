'use client'

// Browser-side helpers for Web Push. Uses only the PUBLIC VAPID key.
import { supabase } from '@/lib/supabase'

export type PushSupport = 'supported' | 'ios-needs-install' | 'unsupported'

export type PushResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'dismissed' | 'not-signed-in' | 'error'; message: string }

const SW_URL = '/sw.js'

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || iPadOS
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'
  const hasApis =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (hasApis) return 'supported'
  // iPhone and iPad only get these APIs once the app is on the Home Screen
  if (isIOS() && !isStandalone()) return 'ios-needs-install'
  return 'unsupported'
}

export function getPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'default'
  return Notification.permission
}

export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'This device'
  const ua = navigator.userAgent
  let browser = 'Browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let os = ''
  if (/Android/.test(ua)) os = 'Android'
  else if (isIOS()) os = 'iPhone/iPad'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Mac OS X/.test(ua)) os = 'Mac'
  else if (/Linux/.test(ua)) os = 'Linux'

  const label = os ? `${browser} on ${os}` : browser
  return isStandalone() ? `${label} (installed app)` : label
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  return navigator.serviceWorker.ready
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (getPushSupport() !== 'supported') return null
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    if (!reg) return null
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

async function saveSubscription(sub: PushSubscription): Promise<string | null> {
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) return 'The browser returned an incomplete subscription.'

  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent,
    p_device_label: getDeviceLabel(),
  })
  return error ? error.message : null
}

async function createSubscription(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) throw new Error('Push is not configured yet (missing public key).')
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  })
}

// Call ONLY from a tap on "Enable push notifications".
export async function enablePush(userId: string): Promise<PushResult> {
  if (getPushSupport() !== 'supported') {
    return { ok: false, reason: 'unsupported', message: 'This browser cannot receive push notifications.' }
  }
  try {
    let permission = Notification.permission
    if (permission === 'default') permission = await Notification.requestPermission()
    if (permission === 'denied') {
      return { ok: false, reason: 'denied', message: 'Notifications are blocked for EboHomes in this browser.' }
    }
    if (permission !== 'granted') {
      return { ok: false, reason: 'dismissed', message: 'Permission was not given.' }
    }

    const reg = await getRegistration()
    const sub = await createSubscription(reg)
    const saveError = await saveSubscription(sub)
    if (saveError) {
      return { ok: false, reason: 'error', message: 'Could not save this device. Please try again.' }
    }

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: userId, push_enabled: true, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    if (error) {
      return { ok: false, reason: 'error', message: 'Could not save your push setting. Please try again.' }
    }
    return { ok: true }
  } catch (err) {
    console.error('enablePush failed:', err)
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
    }
  }
}

// Turns push off for THIS device. If no devices are left, the account switch
// goes off too.
export async function disablePush(userId: string): Promise<PushResult> {
  try {
    const sub = await getCurrentSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe().catch(() => {})
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      if (error) console.error('Could not remove device row:', error.message)
    }
    const { count } = await supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if ((count ?? 0) === 0) {
      await supabase
        .from('notification_preferences')
        .upsert(
          { user_id: userId, push_enabled: false, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
    }
    return { ok: true }
  } catch (err) {
    console.error('disablePush failed:', err)
    return { ok: false, reason: 'error', message: 'Could not turn push off. Please try again.' }
  }
}

// Remove a device from the list (this one or another).
export async function removeDevice(userId: string, id: string, endpoint: string): Promise<boolean> {
  const current = await getCurrentSubscription()
  if (current && current.endpoint === endpoint) {
    const r = await disablePush(userId)
    return r.ok
  }
  const { error } = await supabase.from('push_subscriptions').delete().eq('id', id)
  if (error) return false
  const { count } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if ((count ?? 0) === 0) {
    await supabase
      .from('notification_preferences')
      .upsert(
        { user_id: userId, push_enabled: false, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
  }
  return true
}

// Quietly keeps this device registered. Never asks for permission.
export async function syncPush(userId: string): Promise<void> {
  if (getPushSupport() !== 'supported' || Notification.permission !== 'granted') return
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('push_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  if (prefs?.push_enabled !== true) return

  try {
    const reg = await getRegistration()
    const sub = await createSubscription(reg)
    const err = await saveSubscription(sub)
    if (err) console.error('Push sync could not save device:', err)
  } catch (err) {
    console.error('Push sync failed:', err)
  }
}

// On sign-out: stop this browser receiving the previous person's pushes.
export async function dropLocalSubscription(): Promise<void> {
  const sub = await getCurrentSubscription()
  if (sub) await sub.unsubscribe().catch(() => {})
}

export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, message: 'Please sign in again.' }
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      sent?: number
      devices?: number
    }
    if (res.status === 429) return { ok: false, message: 'Please wait a few seconds and try again.' }
    if (!res.ok) return { ok: false, message: body.error ?? 'Test failed.' }
    if (!body.devices) return { ok: false, message: 'No device is registered yet.' }
    if (!body.sent) return { ok: false, message: 'The test could not be delivered. Try turning push off and on.' }
    return { ok: true, message: 'Test sent. It should arrive in a moment.' }
  } catch {
    return { ok: false, message: 'Could not reach the server.' }
  }
}