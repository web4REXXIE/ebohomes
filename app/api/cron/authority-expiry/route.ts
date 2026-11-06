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
// It only sends reminder notifications. It never changes a listing, tenancy, application or authority status.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 16) return json({ error: 'Not configured.' }, 503)
  if (!secretMatches(req.headers.get('authorization'), secret)) return json({ error: 'Unauthorized.' }, 401)

  try {
    const { data, error } = await getSupabaseAdmin().rpc('eb_run_authority_expiry_notices', { p_trigger: 'cron' })
    if (error) return json({ error: 'The job failed.' }, 500)
    return json(data ?? { ok: true })
  } catch {
    return json({ error: 'The job failed.' }, 500)
  }
}
