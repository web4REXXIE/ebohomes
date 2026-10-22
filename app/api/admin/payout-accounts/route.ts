import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { authAdmin } from '@/lib/admin-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })
const userFacing = (c?: string) => c === '22023' || c === '42501' || c === 'P0002'

// GET ?filter=pending|scheduled|all. Runs as the admin; the database re-checks admin status.
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const f = new URL(req.url).searchParams.get('filter') ?? 'pending'
  const filter = ['pending', 'scheduled', 'all'].includes(f) ? f : 'pending'
  const { data, error } = await a.userDb.rpc('eb_admin_payout_queue', { p_filter: filter })
  if (error) return json({ error: 'Could not load the queue.' }, 500)
  return json({ items: data ?? [] })
}

// POST { id, action: 'approve'|'reject', note?, attest? }
export async function POST(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)
  if (body.action !== 'approve' && body.action !== 'reject') return json({ error: 'Invalid request.' }, 400)
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''
  const attest = {
    identity_matches: body.attest?.identity_matches === true,
    confirmed_with_landlord: body.attest?.confirmed_with_landlord === true,
  }
  const { data, error } = await a.userDb.rpc('eb_review_payout_account', {
    p_id: id, p_action: body.action, p_note: note || null, p_attest: attest,
  })
  if (error) {
    if (userFacing(error.code)) return json({ error: error.message }, 409)
    console.error('payout review failed:', error.code)
    return json({ error: 'Could not record the decision. Nothing was changed.' }, 500)
  }
  return json(data)
}