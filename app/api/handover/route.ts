import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { validateAction } from '@/lib/handover'
import { authUser } from '@/lib/user-auth-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })
const userFacing = (c?: string) => c === '22023' || c === '42501' || c === 'P0002'

// GET ?tenancy=<id> -> handover state for one tenancy. GET with no parameter -> the caller's handover tasks.
export async function GET(req: Request) {
  const u = await authUser(req)
  if (!u) return json({ error: 'Sign in first.' }, 401)
  const tenancy = new URL(req.url).searchParams.get('tenancy')
  if (tenancy) {
    if (!UUID_RE.test(tenancy)) return json({ error: 'Invalid request.' }, 400)
    const { data, error } = await u.db.rpc('eb_my_handover', { p_tenancy: tenancy })
    if (error) return json({ error: 'Could not load the handover.' }, 500)
    return json(data)
  }
  const { data, error } = await u.db.rpc('eb_my_handover_tasks')
  if (error || !data?.found) return json({ error: 'Could not load your handovers.' }, 500)
  return json(data)
}

// POST { tenancy_id, action: 'confirm' | 'dispute', note? }. The database works out whether the caller is the tenant or the landlord.
export async function POST(req: Request) {
  const u = await authUser(req)
  if (!u) return json({ error: 'Sign in first.' }, 401)
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const tid = typeof body?.tenancy_id === 'string' ? body.tenancy_id : ''
  if (!UUID_RE.test(tid)) return json({ error: 'Invalid request.' }, 400)
  const v = validateAction(body.action, body.note)
  if (!v.ok) return json({ error: v.error }, 400)
  const { data, error } = await u.db.rpc('eb_confirm_handover', { p_tenancy: tid, p_action: body.action, p_note: v.note })
  if (error) {
    if (userFacing(error.code)) return json({ error: error.message }, 409)
    console.error('handover failed:', error.code)
    return json({ error: 'Could not record this. Nothing was changed.' }, 500)
  }
  return json(data)
}