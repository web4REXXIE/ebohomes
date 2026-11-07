import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

function secretMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`)
  const got = Buffer.from(header ?? '')
  return got.length === expected.length && timingSafeEqual(got, expected)
}

// Vercel Cron calls this with GET and "Authorization: Bearer <CRON_SECRET>".
// 1. Marks overdue rental offers as expired (and sends notifications).
// 2. Retries notifications that failed to save (Phase 11.11). This never fails the job.
// It never changes a listing, tenancy, application or payment. Expiry is also checked whenever someone responds to an offer.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return json({ error: 'Not configured.' }, 503)
  if (!secretMatches(req.headers.get('authorization'), secret)) return json({ error: 'Unauthorized.' }, 401)

  const db = getSupabaseAdmin()
  let expired = 0
  let failed = false
  try {
    const { data, error } = await db.rpc('eb_expire_rental_offers')
    if (error) failed = true
    else expired = Number(data ?? 0)
  } catch {
    failed = true
  }

  let retried = 0
  try {
    const { data, error } = await db.rpc('eb_retry_failed_notifications')
    if (!error) retried = Number(data ?? 0)
  } catch {
    /* the function may not be installed yet: ignore */
  }

  if (failed) return json({ error: 'The job failed.', retried }, 500)
  return json({ ok: true, expired, retried })
}
