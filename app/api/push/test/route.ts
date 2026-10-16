import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendPushToUser } from '@/lib/push-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Best-effort limit: one test every 10 seconds per person
const lastTest = new Map<string, number>()

// Sends a test push to the SIGNED-IN person's own devices only.
export async function POST(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = data.user.id

    const now = Date.now()
    const last = lastTest.get(userId) ?? 0
    if (now - last < 10_000) {
      return NextResponse.json({ error: 'Please wait a few seconds.' }, { status: 429 })
    }
    lastTest.set(userId, now)

    const result = await sendPushToUser(userId, {
      title: 'EboHomes test notification',
      body: 'Push notifications are working on this device.',
      url: '/notifications/preferences',
      tag: 'ebohomes-test',
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('Push test error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}