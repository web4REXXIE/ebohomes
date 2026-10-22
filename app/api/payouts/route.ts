import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { validateRespond } from '@/lib/payout'
import { authUser } from '@/lib/user-auth-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })
const userFacing = (c?: string) => c === '22023' || c === '42501' || c === 'P0002'

// GET -> the landlord's own payouts (masked account)
export async function GET(req: Request) {
  const u = await authUser(req)
  if (!u) return json({ error: 'Sign in first.' }, 401)
  const { data, error } = await u.db.rpc('eb_my_payouts')
  if (error || !data?.found) return json({ error: 'Could not load your payouts.' }, 500)
  return json(data)
}

// POST { id, action: 'confirm' | 'dispute', note? }
export async function POST(req: Request) {
  const u = await authUser(req)
  if (!u) return json({ error: 'Sign in first.' }, 401)
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)
  const v = validateRespond(body.action, body.note)
  if (!v.ok) return json({ error: v.error }, 400)
  const { data, error } = await u.db.rpc('eb_landlord_respond_payout', { p_id: id, p_action: body.action, p_note: v.note })
  if (error) {
    if (userFacing(error.code)) return json({ error: error.message }, 409)
    console.error('payout respond failed:', error.code)
    return json({ error: 'Could not send your answer. Nothing was changed.' }, 500)
  }
  return json(data)
}