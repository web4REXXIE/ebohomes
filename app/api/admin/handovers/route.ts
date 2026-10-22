import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { authAdmin } from '@/lib/admin-server'
import { validateResolve } from '@/lib/handover'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })
const userFacing = (c?: string) => c === '22023' || c === '42501' || c === 'P0002'

// GET ?filter=attention|waiting|completed|all
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const f = new URL(req.url).searchParams.get('filter') ?? 'attention'
  const filter = ['attention', 'waiting', 'completed', 'all'].includes(f) ? f : 'attention'
  const { data, error } = await a.userDb.rpc('eb_admin_handovers', { p_filter: filter })
  if (error) return json({ error: 'Could not load the list.' }, 500)
  return json({ items: data ?? [] })
}

// POST { tenancy_id, outcome: 'reset' | 'admin_completed', note }
export async function POST(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const tid = typeof body?.tenancy_id === 'string' ? body.tenancy_id : ''
  if (!UUID_RE.test(tid)) return json({ error: 'Invalid request.' }, 400)
  const v = validateResolve(body.outcome, body.note)
  if (!v.ok) return json({ error: v.error }, 400)
  const { data, error } = await a.userDb.rpc('eb_resolve_handover', { p_tenancy: tid, p_outcome: body.outcome, p_note: v.note })
  if (error) {
    if (userFacing(error.code)) return json({ error: error.message }, 409)
    console.error('handover resolve failed:', error.code)
    return json({ error: 'Could not record the decision. Nothing was changed.' }, 500)
  }
  return json(data)
}