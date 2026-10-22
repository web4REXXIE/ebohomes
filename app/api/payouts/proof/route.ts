import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { PROOF_BUCKET } from '@/lib/payout'
import { authUser } from '@/lib/user-auth-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// GET ?id=<payout id> -> 5 minute signed link. The database decides who may see it (admin, or the landlord once paid).
export async function GET(req: Request) {
  const u = await authUser(req)
  if (!u) return json({ error: 'Sign in first.' }, 401)
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)
  const { data: path } = await u.db.rpc('eb_payout_proof_path', { p_id: id })
  if (typeof path !== 'string' || !path) return json({ error: 'Not found.' }, 404)
  const { data, error } = await getSupabaseAdmin().storage.from(PROOF_BUCKET).createSignedUrl(path, 300)
  if (error || !data?.signedUrl) return json({ error: 'Could not open the proof.' }, 500)
  return json({ url: data.signedUrl })
}