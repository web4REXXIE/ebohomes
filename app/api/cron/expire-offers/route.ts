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
// 1. Marks overdue offers as expired.
// 2. Expires overdue 48 hour reservations that have no signed agreement and no payment evidence.
// It never touches an active tenancy, a payment or a listing. Each step runs on its own so one failure does not stop the other.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return json({ error: 'Not configured.' }, 503)
  if (!secretMatches(req.headers.get('authorization'), secret)) return json({ error: 'Unauthorized.' }, 401)

  const db = getSupabaseAdmin()
  let offers: number | null = null
  let reservations: number | null = null
  let failed = false

  try {
    const r = await db.rpc('eb_expire_rental_offers')
    if (r.error) failed = true
    else offers = (r.data as number) ?? 0
  } catch {
    failed = true
  }
  try {
    const r = await db.rpc('eb_expire_reservations')
    if (r.error) failed = true
    else reservations = (r.data as number) ?? 0
  } catch {
    failed = true
  }

  return json({ ok: !failed, offers_expired: offers, reservations_expired: reservations }, failed ? 500 : 200)
}
